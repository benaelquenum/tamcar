'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { freshChannel } from '@/lib/realtime';
import { CameraIcon, VideoIcon, MicIcon, ClockIcon } from './Icon';

type MsgKind = 'text' | 'photo' | 'audio' | 'video';

type ChatMessage = {
  id: string;
  sender_id: string;
  sender_full_name: string | null;
  content: string | null;
  kind: MsgKind;
  media_path: string | null;
  media_duration_s: number | null;
  created_at: string;
  read_at: string | null;
};

type Props = {
  rideId: string;
  myUserId: string;
  otherName: string;
  onClose: () => void;
};

const EXPIRY_MS = 5 * 60 * 1000; // médias éphémères : 5 min
const VOICE_MAX_S = 30;
const VIDEO_MAX_S = 5;

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(Number.isFinite(v.duration) ? v.duration : 0);
    };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

export function RideChat({ rideId, myUserId, otherName, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [viewing, setViewing] = useState<{ kind: MsgKind; url: string } | null>(null);
  const [, setNowTick] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const recStartRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const refetch = useCallback(async () => {
    const { data } = await supabaseBrowser.rpc('ride_messages_history', { p_ride_id: rideId });
    if (Array.isArray(data)) {
      setMessages(data as ChatMessage[]);
      scrollToBottom();
    }
  }, [rideId, scrollToBottom]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabaseBrowser.rpc('ride_messages_history', { p_ride_id: rideId });
      if (!mounted) return;
      setMessages((data ?? []) as ChatMessage[]);
      scrollToBottom();
      supabaseBrowser.rpc('mark_ride_messages_read', { p_ride_id: rideId });
    })();

    const channel = freshChannel(`ride_messages:${rideId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ride_messages', filter: `ride_id=eq.${rideId}` },
        async (payload) => {
          const raw = payload.new as { sender_id: string };
          await refetch();
          if (raw.sender_id !== myUserId) {
            supabaseBrowser.rpc('mark_ride_messages_read', { p_ride_id: rideId });
          }
        },
      )
      .subscribe();

    // Re-rendu périodique pour refléter l'expiration (5 min) des médias.
    const tick = setInterval(() => setNowTick((n) => n + 1), 15_000);

    return () => {
      mounted = false;
      supabaseBrowser.removeChannel(channel);
      clearInterval(tick);
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    };
  }, [rideId, myUserId, scrollToBottom, refetch]);

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    const { error: rpcErr } = await supabaseBrowser.rpc('send_ride_message', {
      p_ride_id: rideId,
      p_content: content,
    });
    setSending(false);
    if (rpcErr) { setError(rpcErr.message); return; }
    setInput('');
  }

  async function uploadAndSend(blob: Blob, kind: 'photo' | 'audio' | 'video', ext: string, durationS?: number) {
    setSending(true);
    setError(null);
    const path = `${rideId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabaseBrowser.storage
      .from('ride-media')
      .upload(path, blob, { contentType: blob.type || undefined, upsert: false });
    if (upErr) { setError('Envoi du média : ' + upErr.message); setSending(false); return; }
    const { error: rpcErr } = await supabaseBrowser.rpc('send_ride_media', {
      p_ride_id: rideId,
      p_kind: kind,
      p_media_path: path,
      p_duration_s: durationS ? Math.round(durationS) : null,
    });
    setSending(false);
    if (rpcErr) setError(rpcErr.message);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    await uploadAndSend(file, 'photo', ext);
  }

  async function handleVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dur = await getVideoDuration(file);
    if (dur > VIDEO_MAX_S + 0.6) {
      setError(`Vidéo trop longue (${VIDEO_MAX_S} s max). Refais une capture plus courte.`);
      return;
    }
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
    await uploadAndSend(file, 'video', ext, dur);
  }

  async function startVoice() {
    if (recording || sending) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const secs = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > 0) await uploadAndSend(blob, 'audio', 'webm', secs);
      };
      recorderRef.current = rec;
      recStartRef.current = Date.now();
      rec.start();
      setRecording(true);
      setRecSecs(0);
      recTimerRef.current = setInterval(() => {
        setRecSecs((s) => {
          const next = s + 1;
          if (next >= VOICE_MAX_S) stopVoice();
          return next;
        });
      }, 1000);
    } catch {
      setError('Micro indisponible. Autorise l\'accès au micro.');
    }
  }

  function stopVoice() {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setRecording(false);
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    recorderRef.current = null;
  }

  async function viewMedia(m: ChatMessage) {
    if (!m.media_path) return;
    const { data, error: sErr } = await supabaseBrowser.storage
      .from('ride-media')
      .createSignedUrl(m.media_path, 60);
    if (sErr || !data?.signedUrl) {
      setError('Média expiré ou indisponible.');
      return;
    }
    setViewing({ kind: m.kind, url: data.signedUrl });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center gap-md border-b border-neutral-200 bg-white px-lg py-md shadow-sm">
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full bg-neutral-100 text-neutral-900"
          aria-label="Fermer"
        >
          <span className="text-lg leading-none">←</span>
        </button>
        <div className="flex-1">
          <p className="text-sm font-bold text-neutral-900">{otherName}</p>
          <p className="text-[10px] text-neutral-500">Chat de la course · photos et voix éphémères (5 min)</p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-neutral-50 p-md">
        {messages.length === 0 ? (
          <p className="mt-2xl text-center text-xs text-neutral-500">
            Aucun message. Écrivez le premier ci-dessous.
          </p>
        ) : (
          <ul className="space-y-sm">
            {messages.map((m) => {
              const mine = m.sender_id === myUserId;
              const expired = m.kind !== 'text' && Date.now() - new Date(m.created_at).getTime() > EXPIRY_MS;
              return (
                <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-md py-sm shadow-sm ${
                      mine
                        ? 'rounded-br-sm bg-primary-500 text-white'
                        : 'rounded-bl-sm bg-white text-neutral-900 ring-1 ring-neutral-200'
                    }`}
                  >
                    {m.kind === 'text' ? (
                      <p className="text-sm">{m.content}</p>
                    ) : expired ? (
                      <p className={`flex items-center gap-xs text-sm italic ${mine ? 'text-white/70' : 'text-neutral-400'}`}>
                        <ClockIcon className="h-4 w-4" /> Média expiré
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => viewMedia(m)}
                        className="flex items-center gap-xs text-sm font-semibold underline-offset-2 hover:underline"
                      >
                        {m.kind === 'photo' && <><CameraIcon className="h-4 w-4" /> Photo · voir</>}
                        {m.kind === 'video' && <><VideoIcon className="h-4 w-4" /> Vidéo · voir</>}
                        {m.kind === 'audio' && <><MicIcon className="h-4 w-4" /> Note vocale{m.media_duration_s ? ` · ${m.media_duration_s}s` : ''}</>}
                      </button>
                    )}
                    <p className={`mt-xs text-right text-[9px] ${mine ? 'text-white/70' : 'text-neutral-400'}`}>
                      {fmtTime(m.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-neutral-200 bg-white px-lg py-md">
        {error && <p className="mb-xs text-xs text-error">{error}</p>}

        <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
        <input ref={videoInputRef} type="file" accept="video/*" capture="environment" onChange={handleVideo} className="hidden" />

        {recording ? (
          <div className="flex items-center gap-md">
            <span className="flex items-center gap-xs text-sm font-bold text-error">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-error" />
              {recSecs}s / {VOICE_MAX_S}s
            </span>
            <button
              type="button"
              onClick={stopVoice}
              className="ml-auto rounded-full bg-error px-lg py-sm text-sm font-bold text-white"
            >
              Envoyer la note
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-xs">
            <button type="button" onClick={() => photoInputRef.current?.click()} disabled={sending}
              aria-label="Photo" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-neutral-100 text-neutral-700 disabled:opacity-50"><CameraIcon className="h-5 w-5" /></button>
            <button type="button" onClick={() => videoInputRef.current?.click()} disabled={sending}
              aria-label="Vidéo" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-neutral-100 text-neutral-700 disabled:opacity-50"><VideoIcon className="h-5 w-5" /></button>
            <button type="button" onClick={startVoice} disabled={sending}
              aria-label="Note vocale" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-neutral-100 text-neutral-700 disabled:opacity-50"><MicIcon className="h-5 w-5" /></button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={sending ? 'Envoi…' : 'Votre message…'}
              maxLength={500}
              className="min-w-0 flex-1 rounded-full border border-neutral-200 bg-white px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              type="submit"
              disabled={sending || input.trim().length === 0}
              className="flex-none rounded-full bg-primary-500 px-md py-sm text-sm font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
            >
              {sending ? '…' : 'Envoyer'}
            </button>
          </form>
        )}
      </div>

      {/* Visionneuse média éphémère */}
      {viewing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-lg" onClick={() => setViewing(null)}>
          {viewing.kind === 'photo' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewing.url} alt="" className="max-h-[85vh] max-w-full rounded-lg object-contain" />
          )}
          {viewing.kind === 'video' && (
            <video src={viewing.url} controls autoPlay className="max-h-[85vh] max-w-full rounded-lg" />
          )}
          {viewing.kind === 'audio' && (
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-lg text-center">
              <p className="mb-md flex items-center justify-center gap-xs text-sm font-bold text-neutral-900"><MicIcon className="h-4 w-4" /> Note vocale</p>
              <audio src={viewing.url} controls autoPlay className="w-full" />
              <button type="button" onClick={() => setViewing(null)} className="mt-md text-xs font-bold text-primary-700 underline">Fermer</button>
            </div>
          )}
          <button type="button" aria-label="Fermer" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/20 text-2xl text-white">×</button>
        </div>
      )}
    </div>
  );
}
