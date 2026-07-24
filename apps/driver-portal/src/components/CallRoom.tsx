'use client';

import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

// STUN public gratuit. TURN à ajouter plus tard pour fiabiliser la 4G (CGNAT).
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

type Role = 'caller' | 'callee';
type EndStatus = 'ended' | 'missed' | 'declined';

type Props = {
  callId: string;
  role: Role;
  otherName: string;
  onClose: (status?: EndStatus) => void;
};

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function CallRoom({ callId, role, otherName, onClose }: Props) {
  const [phase, setPhase] = useState<'connecting' | 'active' | 'ended'>('connecting');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const endedRef = useRef(false);
  const finishRef = useRef<((status: EndStatus, remote?: boolean) => void) | null>(null);

  useEffect(() => {
    if (phase !== 'active') return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    let cancelled = false;

    function cleanup() {
      pcRef.current?.close();
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
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
      cleanup();
      setPhase('ended');
      onClose(status);
    }
    finishRef.current = finish;

    async function setup() {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        setError('Micro inaccessible. Autorise le micro pour appeler.');
        setTimeout(() => finish('ended'), 1500);
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (e) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
        setPhase('active');
      };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') setPhase('active');
        else if (st === 'failed' || st === 'disconnected' || st === 'closed') finish('ended');
      };

      const channel = supabaseBrowser.channel(`call:${callId}`, {
        config: { broadcast: { self: false } },
      });
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
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          channel.send({ type: 'broadcast', event: 'answer', payload: answer });
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          if (role !== 'caller' || !pcRef.current) return;
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
        })
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          try {
            await pcRef.current?.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit));
          } catch { /* ignore late/duplicate candidates */ }
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
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-neutral-900/95 backdrop-blur-sm text-white">
      <audio ref={remoteAudioRef} autoPlay />
      <p className="text-xs font-bold uppercase tracking-widest text-primary-300">
        Appel TamCar
      </p>
      <p className="mt-md text-2xl font-extrabold">{otherName}</p>
      <p className="mt-sm text-sm text-neutral-300">
        {error
          ? error
          : phase === 'active'
            ? fmtDuration(seconds)
            : role === 'caller'
              ? 'Sonnerie…'
              : 'Connexion…'}
      </p>

      <div className="mt-2xl flex items-center gap-xl">
        <button
          type="button"
          onClick={toggleMute}
          disabled={phase !== 'active'}
          className={`grid h-14 w-14 place-items-center rounded-full text-sm font-bold ring-1 ring-white/30 disabled:opacity-40 ${
            muted ? 'bg-white text-neutral-900' : 'bg-white/10 text-white'
          }`}
        >
          {muted ? 'Muet' : 'Micro'}
        </button>
        <button
          type="button"
          onClick={() => finishRef.current?.('ended')}
          className="grid h-16 w-16 place-items-center rounded-full bg-error text-2xl shadow-lg"
          aria-label="Raccrocher"
        >
          📵
        </button>
      </div>
    </div>
  );
}
