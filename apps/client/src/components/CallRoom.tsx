'use client';

import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

// STUN public gratuit. TURN à ajouter pour fiabiliser la 4G (CGNAT).
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

type Role = 'caller' | 'callee';
type EndStatus = 'ended' | 'missed' | 'declined';
type Props = { callId: string; role: Role; otherName: string; onClose: (status?: EndStatus) => void };

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}
function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || 'TC';
}

/* --- Icônes SVG dédiées --- */
const IconMic = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={p.className}>
    <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><line x1="12" y1="17" x2="12" y2="22" />
  </svg>
);
const IconMicOff = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={p.className}>
    <line x1="3" y1="3" x2="21" y2="21" /><path d="M9 9v1a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7" /><path d="M17 10a5 5 0 0 1-.5 2.2M5 10a7 7 0 0 0 10.9 5.8" /><line x1="12" y1="17" x2="12" y2="22" />
  </svg>
);
const IconSpeaker = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={p.className}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);
const IconSpeakerOff = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={p.className}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" />
  </svg>
);
const IconPhoneDown = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={p.className}>
    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a.99.99 0 0 1-1.41-.01l-2.44-2.44a.99.99 0 0 1 0-1.41C3.85 8.81 7.72 7 12 7s8.15 1.81 11.27 4.72c.39.39.39 1.02 0 1.41l-2.44 2.44c-.39.39-1.02.39-1.42.01a11.9 11.9 0 0 0-2.65-1.85.998.998 0 0 1-.56-.9v-3.1A15.9 15.9 0 0 0 12 9z" transform="rotate(135 12 12)" />
  </svg>
);

export function CallRoom({ callId, role, otherName, onClose }: Props) {
  const [phase, setPhase] = useState<'connecting' | 'active' | 'ended'>('connecting');
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const endedRef = useRef(false);
  const finishRef = useRef<((s: EndStatus, remote?: boolean) => void) | null>(null);
  const remoteSetRef = useRef(false);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    if (phase !== 'active') return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    let cancelled = false;

    function cleanup() {
      pcRef.current?.close(); pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop()); localStreamRef.current = null;
      if (channelRef.current) supabaseBrowser.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    async function finish(status: EndStatus, remote = false) {
      if (endedRef.current) return;
      endedRef.current = true;
      if (!remote) {
        channelRef.current?.send({ type: 'broadcast', event: 'hangup', payload: {} });
        supabaseBrowser.rpc('end_ride_call', { p_call_id: callId, p_status: status });
      }
      cleanup(); setPhase('ended'); onClose(status);
    }
    finishRef.current = finish;

    async function flushIce() {
      const pc = pcRef.current; if (!pc) return;
      for (const c of pendingIceRef.current) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* ignore */ } }
      pendingIceRef.current = [];
    }

    async function setup() {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        setError('Micro inaccessible. Vérifie l\'autorisation micro du navigateur.');
        setTimeout(() => finish('ended'), 1800); return;
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (e) => {
        const el = remoteAudioRef.current;
        if (el) { el.srcObject = e.streams[0]; el.play().catch(() => {}); }
        setPhase('active');
      };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') setPhase('active');
        else if (st === 'failed' || st === 'closed') finish('ended');
      };

      const channel = supabaseBrowser.channel(`call:${callId}`, { config: { broadcast: { self: false } } });
      channelRef.current = channel;

      pc.onicecandidate = (e) => {
        if (e.candidate) channel.send({ type: 'broadcast', event: 'ice', payload: e.candidate.toJSON() });
      };

      async function sendOffer() {
        if (role !== 'caller' || !pcRef.current) return;
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        channel.send({ type: 'broadcast', event: 'offer', payload: offer });
      }

      channel
        .on('broadcast', { event: 'ready' }, () => { sendOffer(); })
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          if (role !== 'callee' || !pcRef.current) return;
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
          remoteSetRef.current = true; await flushIce();
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          channel.send({ type: 'broadcast', event: 'answer', payload: answer });
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          if (role !== 'caller' || !pcRef.current) return;
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
          remoteSetRef.current = true; await flushIce();
        })
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          const cand = payload as RTCIceCandidateInit;
          if (!remoteSetRef.current || !pcRef.current) { pendingIceRef.current.push(cand); return; }
          try { await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)); } catch { /* ignore */ }
        })
        .on('broadcast', { event: 'hangup' }, () => { finish('ended', true); })
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return;
          if (role === 'callee') channel.send({ type: 'broadcast', event: 'ready', payload: {} });
          if (role === 'caller') sendOffer();
        });
    }
    setup();

    return () => {
      cancelled = true;
      if (!endedRef.current) {
        endedRef.current = true;
        pcRef.current?.close();
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        if (channelRef.current) supabaseBrowser.removeChannel(channelRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, role]);

  function toggleMute() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled; setMuted(!track.enabled);
  }
  async function toggleSpeaker() {
    const el = remoteAudioRef.current; const next = !speaker; setSpeaker(next);
    // setSinkId : dispo surtout desktop ; sinon on ajuste juste le volume.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (el && typeof (el as any).setSinkId === 'function') {
      try { await (el as any).setSinkId(next ? 'default' : ''); } catch { /* ignore */ }
    }
    if (el) el.volume = next ? 1 : 0.35;
  }

  const statusLabel = error ? error : phase === 'active' ? fmtDuration(seconds) : role === 'caller' ? 'Sonnerie…' : 'Connexion…';

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-between bg-gradient-to-br from-primary-700 via-violet-700 to-primary-900 px-lg py-2xl text-white">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* En-tête */}
      <div className="mt-lg flex flex-col items-center">
        <span className="rounded-full bg-white/15 px-md py-xs text-[11px] font-bold uppercase tracking-widest text-white/90">
          Appel TamCar
        </span>
      </div>

      {/* Avatar + identité */}
      <div className="flex flex-col items-center gap-lg">
        <div className="relative">
          {phase !== 'active' && (
            <>
              <span className="absolute inset-0 animate-ping rounded-full bg-white/20" />
              <span className="absolute -inset-3 animate-pulse rounded-full bg-white/10" />
            </>
          )}
          <div className="relative grid h-32 w-32 place-items-center rounded-full bg-white/15 text-4xl font-extrabold ring-4 ring-white/25 backdrop-blur">
            {initials(otherName)}
          </div>
        </div>
        <div className="text-center">
          <p className="text-2xl font-extrabold">{otherName}</p>
          <p className={`mt-xs text-sm ${error ? 'text-amber-200' : 'text-white/80'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {statusLabel}
          </p>
        </div>
      </div>

      {/* Contrôles */}
      <div className="mb-lg flex items-center justify-center gap-2xl">
        <button
          type="button"
          onClick={toggleMute}
          disabled={phase !== 'active'}
          className={`flex flex-col items-center gap-xs ${phase !== 'active' ? 'opacity-40' : ''}`}
        >
          <span className={`grid h-16 w-16 place-items-center rounded-full ring-1 ring-white/30 transition ${muted ? 'bg-white text-primary-700' : 'bg-white/15 text-white'}`}>
            {muted ? <IconMicOff className="h-6 w-6" /> : <IconMic className="h-6 w-6" />}
          </span>
          <span className="text-[11px] font-semibold text-white/80">{muted ? 'Muet' : 'Micro'}</span>
        </button>

        <button type="button" onClick={() => finishRef.current?.('ended')} className="flex flex-col items-center gap-xs">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-error text-white shadow-lg transition active:scale-95">
            <IconPhoneDown className="h-8 w-8" />
          </span>
          <span className="text-[11px] font-semibold text-white/80">Raccrocher</span>
        </button>

        <button type="button" onClick={toggleSpeaker} className="flex flex-col items-center gap-xs">
          <span className={`grid h-16 w-16 place-items-center rounded-full ring-1 ring-white/30 transition ${speaker ? 'bg-white/15 text-white' : 'bg-white text-primary-700'}`}>
            {speaker ? <IconSpeaker className="h-6 w-6" /> : <IconSpeakerOff className="h-6 w-6" />}
          </span>
          <span className="text-[11px] font-semibold text-white/80">{speaker ? 'Haut-parleur' : 'Écouteur'}</span>
        </button>
      </div>
    </div>
  );
}
