'use client';

import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { freshChannel } from '@/lib/realtime';
import { callsSupported, loadIceServers } from '@/lib/rtc';
import { startRingback } from '@/lib/callSounds';
import { PhoneIcon } from './Icon';

// ============================================================
// Salon d'appel audio (WebRTC pair-à-pair, signalisation par Realtime Broadcast).
//
// Reprise de la v1, durcie pour les conditions réelles :
//   • serveur TURN (relais) obligatoire en pratique en 4G (voir lib/rtc.ts) ;
//   • poignée de main qui ne se perd plus : le destinataire répète « prêt »
//     tant qu'il n'a pas reçu l'offre, l'appelant renvoie l'offre tant qu'il
//     n'a pas reçu la réponse ;
//   • coupure réseau : redémarrage ICE (2 essais) avant de raccrocher ;
//   • raccrochage de l'autre côté détecté AUSSI par la base (ride_calls), pas
//     seulement par un message qui pourrait se perdre ;
//   • délais : sonnerie 45 s, connexion 30 s — jamais d'écran qui reste bloqué ;
//   • débit audio limité à 24 kbit/s (environ 0,2 Mo par minute).
// ============================================================

export type CallEnd = {
  status: 'ended' | 'missed' | 'declined';
  reason: 'hangup' | 'remote' | 'timeout' | 'network' | 'mic' | 'unsupported';
  seconds: number;
};

type Phase = 'ringing' | 'connecting' | 'active' | 'reconnecting';

type Props = {
  callId: string;
  role: 'caller' | 'callee';
  otherName: string;
  onClose: (end: CallEnd) => void;
};

const RING_TIMEOUT_MS = 45_000;
const CONNECT_TIMEOUT_MS = 30_000;
const MAX_ICE_RESTARTS = 2;

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || 'TC';
}

const MicIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="17" x2="12" y2="22" />
  </svg>
);

const MicOffIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="3" y1="3" x2="21" y2="21" />
    <path d="M9 9v1a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7" />
    <path d="M17 10a5 5 0 0 1-.5 2.2M5 10a7 7 0 0 0 10.9 5.8" />
    <line x1="12" y1="17" x2="12" y2="22" />
  </svg>
);

export function CallRoom({ callId, role, otherName, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>(role === 'caller' ? 'ringing' : 'connecting');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hangupRef = useRef<(() => void) | null>(null);
  const secondsRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Chronomètre : il ne tourne qu'une fois la conversation établie.
  useEffect(() => {
    if (phase !== 'active') return;
    const t = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Écran gardé allumé pendant l'appel (sinon la connexion peut se couper).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wl = (navigator as any).wakeLock;
    if (wl?.request) {
      wl.request('screen').then((l: { release: () => Promise<void> }) => { lock = l; }).catch(() => undefined);
    }
    return () => { void lock?.release().catch(() => undefined); };
  }, []);

  useEffect(() => {
    let ended = false;
    let pc: RTCPeerConnection | null = null;
    let stream: MediaStream | null = null;
    let sig: ReturnType<typeof freshChannel> | null = null;
    let dbCh: ReturnType<typeof freshChannel> | null = null;
    let stopRingback: (() => void) | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const intervals = new Set<ReturnType<typeof setInterval>>();

    let remoteSet = false;
    let answered = false; // appelant : réponse SDP reçue
    let gotOffer = false; // destinataire : offre SDP reçue
    let calleeReady = false;
    let connected = false;
    let restarts = 0;
    let lastOffer: RTCSessionDescriptionInit | null = null;
    let lastAnswer: RTCSessionDescriptionInit | null = null;
    const pendingIce: RTCIceCandidateInit[] = [];

    const after = (ms: number, fn: () => void) => {
      const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
      timers.add(t);
      return t;
    };
    const every = (ms: number, fn: () => void) => {
      const t = setInterval(fn, ms);
      intervals.add(t);
      return t;
    };
    const send = (event: string, payload: unknown) => {
      try { sig?.send({ type: 'broadcast', event, payload }); } catch { /* canal fermé */ }
    };

    function cleanup() {
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      stopRingback?.();
      try { pc?.close(); } catch { /* déjà fermé */ }
      stream?.getTracks().forEach((t) => t.stop());
      if (sig) supabaseBrowser.removeChannel(sig);
      if (dbCh) supabaseBrowser.removeChannel(dbCh);
    }

    function finish(status: CallEnd['status'], reason: CallEnd['reason'], remote = false) {
      if (ended) return;
      ended = true;
      if (!remote) {
        send('hangup', {});
        void supabaseBrowser.rpc('end_ride_call', { p_call_id: callId, p_status: status });
      }
      cleanup();
      onCloseRef.current({ status, reason, seconds: secondsRef.current });
    }

    hangupRef.current = () => finish(role === 'caller' && !connected ? 'missed' : 'ended', 'hangup');

    async function flushIce() {
      if (!pc) return;
      for (const c of pendingIce.splice(0)) {
        try { await pc.addIceCandidate(c); } catch { /* candidat périmé */ }
      }
    }

    async function capBitrate() {
      try {
        for (const s of pc?.getSenders() ?? []) {
          if (s.track?.kind !== 'audio') continue;
          const p = s.getParameters();
          if (!p.encodings || p.encodings.length === 0) p.encodings = [{}];
          p.encodings[0].maxBitrate = 24_000;
          await s.setParameters(p);
        }
      } catch { /* non supporté : débit par défaut */ }
    }

    // --- appelant : envoie (ou renvoie) l'offre
    async function sendOffer(iceRestart = false) {
      if (!pc || ended || role !== 'caller') return;
      if (lastOffer && !answered && !iceRestart) { send('offer', lastOffer); return; }
      try {
        const offer = await pc.createOffer({ iceRestart });
        await pc.setLocalDescription(offer);
        const d = pc.localDescription;
        lastOffer = d ? { type: d.type, sdp: d.sdp } : offer;
        if (iceRestart) answered = false;
        send('offer', lastOffer);
      } catch { /* état de signalisation incompatible : le prochain essai réessaiera */ }
    }

    // --- destinataire : répond à l'offre
    async function onOffer(offer: RTCSessionDescriptionInit) {
      if (!pc || ended || role !== 'callee') return;
      if (lastAnswer && pc.remoteDescription?.sdp === offer.sdp) { send('answer', lastAnswer); return; }
      try {
        await pc.setRemoteDescription(offer);
        remoteSet = true;
        gotOffer = true;
        await flushIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const d = pc.localDescription;
        lastAnswer = d ? { type: d.type, sdp: d.sdp } : answer;
        send('answer', lastAnswer);
      } catch { /* offre reçue en double : on attend la suivante */ }
    }

    async function onAnswer(answer: RTCSessionDescriptionInit) {
      if (!pc || ended || role !== 'caller' || pc.signalingState !== 'have-local-offer') return;
      try {
        await pc.setRemoteDescription(answer);
        remoteSet = true;
        answered = true;
        await flushIce();
      } catch { /* réponse périmée */ }
    }

    function restartIce() {
      if (ended) return;
      if (restarts >= MAX_ICE_RESTARTS) {
        setNotice('La connexion a été perdue.');
        finish('ended', 'network');
        return;
      }
      restarts += 1;
      setPhase('reconnecting');
      if (role === 'caller') void sendOffer(true);
      else send('ice-restart', {});
      after(12_000, () => { if (!ended && pc?.connectionState !== 'connected') restartIce(); });
    }

    function startConnectTimer() {
      after(CONNECT_TIMEOUT_MS, () => {
        if (!ended && !connected) {
          setNotice('Connexion impossible.');
          finish('ended', 'network');
        }
      });
    }

    function onCalleeReady() {
      if (calleeReady) { void sendOffer(); return; }
      calleeReady = true;
      stopRingback?.();
      stopRingback = null;
      setPhase('connecting');
      startConnectTimer();
      void sendOffer();
      // L'offre est renvoyée toutes les 3 s tant que la réponse n'est pas arrivée.
      let tries = 0;
      const t = every(3_000, () => {
        tries += 1;
        if (ended || answered || tries > 10) { clearInterval(t); intervals.delete(t); return; }
        void sendOffer();
      });
    }

    (async () => {
      if (!callsSupported()) {
        setNotice('Appel indisponible sur cet appareil.');
        after(1_500, () => finish('ended', 'unsupported'));
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
          video: false,
        });
      } catch {
        setNotice('Micro inaccessible : autorisez le micro pour TamCar.');
        after(2_000, () => finish('ended', 'mic'));
        return;
      }
      if (ended) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;

      const iceServers = await loadIceServers();
      if (ended) return;

      pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
      stream.getTracks().forEach((track) => pc!.addTrack(track, stream!));

      pc.ontrack = (e) => {
        const el = audioRef.current;
        if (!el) return;
        el.srcObject = e.streams[0] ?? new MediaStream([e.track]);
        el.play().catch(() => setNeedsTap(true));
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) send('ice', e.candidate.toJSON());
      };
      pc.onconnectionstatechange = () => {
        if (!pc || ended) return;
        const st = pc.connectionState;
        if (st === 'connected') {
          connected = true;
          stopRingback?.();
          stopRingback = null;
          setPhase('active');
          setNotice(null);
          void capBitrate();
        } else if (st === 'disconnected') {
          setPhase('reconnecting');
          after(4_000, () => { if (!ended && pc?.connectionState !== 'connected') restartIce(); });
        } else if (st === 'failed') {
          restartIce();
        }
      };

      sig = freshChannel(`call:${callId}`, { config: { broadcast: { self: false } } });
      sig
        .on('broadcast', { event: 'ready' }, () => { if (role === 'caller') onCalleeReady(); })
        .on('broadcast', { event: 'offer' }, ({ payload }) => { void onOffer(payload as RTCSessionDescriptionInit); })
        .on('broadcast', { event: 'answer' }, ({ payload }) => { void onAnswer(payload as RTCSessionDescriptionInit); })
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          const cand = payload as RTCIceCandidateInit;
          if (!pc || !remoteSet) { pendingIce.push(cand); return; }
          try { await pc.addIceCandidate(cand); } catch { /* candidat périmé */ }
        })
        .on('broadcast', { event: 'ice-restart' }, () => { if (role === 'caller') void sendOffer(true); })
        .on('broadcast', { event: 'hangup' }, () => finish('ended', 'remote', true))
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED' || ended) return;
          if (role === 'callee') {
            // « prêt » répété jusqu'à réception de l'offre : un message perdu ne bloque plus l'appel.
            startConnectTimer();
            send('ready', {});
            let tries = 0;
            const t = every(2_000, () => {
              tries += 1;
              if (ended || gotOffer || tries > 12) { clearInterval(t); intervals.delete(t); return; }
              send('ready', {});
            });
          }
        });

      // État de l'appel en base : un raccrochage ou un refus arrive même si un message de signalisation se perd.
      dbCh = freshChannel(`call-status:${callId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'ride_calls', filter: `id=eq.${callId}` },
          (payload) => {
            const st = (payload.new as { status?: string }).status;
            if (st === 'active' && role === 'caller') onCalleeReady();
            else if (st === 'ended' || st === 'missed' || st === 'declined') finish(st, 'remote', true);
          },
        )
        .subscribe();

      if (role === 'caller') {
        stopRingback = startRingback();
        after(RING_TIMEOUT_MS, () => {
          if (!ended && !calleeReady) { setNotice('Pas de réponse.'); finish('missed', 'timeout'); }
        });
      }
    })();

    return () => {
      if (!ended) {
        ended = true;
        cleanup();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, role]);

  function toggleMute() {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }

  const statusLabel =
    notice ??
    (phase === 'active'
      ? fmtDuration(seconds)
      : phase === 'reconnecting'
        ? 'Reconnexion…'
        : phase === 'ringing'
          ? 'Sonnerie…'
          : 'Connexion…');

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-between bg-gradient-to-br from-primary-700 via-violet-500 to-primary-900 px-lg py-2xl text-white">
      <audio ref={audioRef} autoPlay playsInline />

      <div className="mt-lg flex flex-col items-center">
        <span className="rounded-full bg-white/15 px-md py-xs text-[11px] font-bold uppercase tracking-widest text-white/90">
          Appel TamCar
        </span>
      </div>

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
          <p
            className={`mt-xs text-sm ${notice ? 'text-amber-200' : 'text-white/80'}`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
            aria-live="polite"
          >
            {statusLabel}
          </p>
          {needsTap && (
            <button
              type="button"
              onClick={() => { void audioRef.current?.play().then(() => setNeedsTap(false)).catch(() => undefined); }}
              className="mt-md rounded-full bg-white px-lg py-sm text-xs font-bold text-primary-700 shadow"
            >
              Toucher pour activer le son
            </button>
          )}
        </div>
      </div>

      <div className="mb-lg flex items-center justify-center gap-2xl">
        <button
          type="button"
          onClick={toggleMute}
          disabled={phase !== 'active'}
          className={`flex flex-col items-center gap-xs ${phase !== 'active' ? 'opacity-40' : ''}`}
        >
          <span className={`grid h-16 w-16 place-items-center rounded-full ring-1 ring-white/30 transition ${muted ? 'bg-white text-primary-700' : 'bg-white/15 text-white'}`}>
            {muted ? <MicOffIcon className="h-6 w-6" /> : <MicIcon className="h-6 w-6" />}
          </span>
          <span className="text-[11px] font-semibold text-white/80">{muted ? 'Muet' : 'Micro'}</span>
        </button>

        <button type="button" onClick={() => hangupRef.current?.()} className="flex flex-col items-center gap-xs" aria-label="Raccrocher">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-error text-white shadow-lg transition active:scale-95">
            <PhoneIcon className="h-8 w-8 rotate-[135deg]" />
          </span>
          <span className="text-[11px] font-semibold text-white/80">Raccrocher</span>
        </button>
      </div>
    </div>
  );
}
