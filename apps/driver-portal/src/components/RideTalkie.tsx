'use client';

import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { freshChannel } from '@/lib/realtime';
import { MicIcon } from './Icon';

// Talkie-walkie de course (v1) : maintenir pour parler, relâcher pour
// envoyer. Le côté d'en face JOUE LE VOCAL AUTOMATIQUEMENT (bip + lecture
// haut-parleur) s'il a l'écran course ouvert — sensation talkie, latence
// 1-3 s. Si la lecture auto est bloquée (aucune interaction préalable),
// un bouton « Vocal reçu — écouter » apparaît. Le vocal est aussi tracé
// dans le chat (historique + badge non-lu + repli hors écran).
// Infra réutilisée : bucket ride-media + send_ride_media + broadcast.

const MAX_S = 20;

export function RideTalkie({ rideId, active }: { rideId: string; active: boolean }) {
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [sending, setSending] = useState(false);
  const [incomingUrl, setIncomingUrl] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const channelRef = useRef<ReturnType<typeof freshChannel> | null>(null);

  function bip(freq: number) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      o.start();
      o.stop(ctx.currentTime + 0.2);
    } catch {
      /* ignore */
    }
  }

  async function playIncoming(url: string) {
    bip(988);
    const audio = new Audio(url);
    try {
      await audio.play();
      setIncomingUrl(null);
    } catch {
      // Lecture auto bloquée (pas d'interaction préalable) → bouton manuel.
      setIncomingUrl(url);
    }
  }

  // Canal talkie dédié à la course (broadcast, self exclu).
  useEffect(() => {
    if (!active) return;
    const ch = freshChannel(`ride-ptt:${rideId}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'ptt' }, async ({ payload }) => {
      const path = (payload as { path?: string })?.path;
      if (!path) return;
      const { data } = await supabaseBrowser.storage.from('ride-media').createSignedUrl(path, 120);
      if (data?.signedUrl) void playIncoming(data.signedUrl);
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      supabaseBrowser.removeChannel(ch);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId, active]);

  async function send(blob: Blob, durS: number) {
    setSending(true);
    try {
      const path = `${rideId}/ptt-${crypto.randomUUID()}.webm`;
      const { error: upErr } = await supabaseBrowser.storage
        .from('ride-media')
        .upload(path, blob, { contentType: blob.type || 'audio/webm', upsert: false });
      if (upErr) return;
      channelRef.current?.send({ type: 'broadcast', event: 'ptt', payload: { path } });
      // Trace chat : historique + badge non-lu + repli si l'autre est ailleurs.
      supabaseBrowser
        .rpc('send_ride_media', {
          p_ride_id: rideId,
          p_kind: 'audio',
          p_media_path: path,
          p_duration_s: durS,
        })
        .then(() => undefined);
    } finally {
      setSending(false);
    }
  }

  async function startRec(e: React.PointerEvent) {
    e.preventDefault();
    if (recording || sending || !active) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const durS = Math.round((Date.now() - startedAtRef.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > 0 && durS >= 1) void send(blob, durS);
      };
      recRef.current = rec;
      startedAtRef.current = Date.now();
      rec.start();
      setRecording(true);
      setSecs(0);
      bip(660);
      timerRef.current = setInterval(() => {
        setSecs((s) => {
          const n = s + 1;
          if (n >= MAX_S) stopRec();
          return n;
        });
      }, 1000);
    } catch {
      /* micro refusé */
    }
  }

  function stopRec() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    recRef.current = null;
  }

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  if (!active) return null;

  return (
    <div className="mt-sm">
      <button
        type="button"
        onPointerDown={startRec}
        onPointerUp={stopRec}
        onPointerLeave={() => {
          if (recording) stopRec();
        }}
        onContextMenu={(e) => e.preventDefault()}
        disabled={sending}
        className={`flex w-full select-none items-center justify-center gap-sm rounded-xl py-md text-sm font-bold transition disabled:opacity-60 ${
          recording ? 'animate-pulse bg-error text-white shadow-lg' : 'bg-neutral-900 text-white shadow-sm hover:brightness-110'
        }`}
        style={{ touchAction: 'none', WebkitUserSelect: 'none' }}
      >
        <MicIcon className="h-4 w-4" />
        {recording
          ? `Parlez… ${secs}s — relâchez pour envoyer`
          : sending
            ? 'Envoi…'
            : 'Talkie — maintenir pour parler'}
      </button>
      {incomingUrl && (
        <button
          type="button"
          onClick={() => void playIncoming(incomingUrl)}
          className="mt-xs flex w-full items-center justify-center gap-xs rounded-xl border-2 border-primary-500 bg-primary-50 py-sm text-sm font-bold text-primary-700"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
          Vocal reçu — écouter
        </button>
      )}
    </div>
  );
}
