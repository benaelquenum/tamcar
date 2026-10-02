'use client';

import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { freshChannel } from '@/lib/realtime';
import { callsSupported } from '@/lib/rtc';
import { startRingtone } from '@/lib/callSounds';
import { CallRoom, type CallEnd } from './CallRoom';
import { PhoneIcon } from './Icon';

// Appel audio entre le client et le chauffeur d'une course active, sans échange
// de numéro. Rend le bouton « Appel TamCar » (à placer dans la rangée des
// boutons de contact), la fenêtre d'appel entrant et le salon d'appel.
// Le cycle de vie de l'appel est en base (ride_calls) ; l'audio passe en WebRTC
// (voir CallRoom).

type Props = {
  rideId: string;
  myUserId: string;
  /** Course active (acceptée, arrivée ou en cours) : seul cas où l'on peut appeler. */
  active: boolean;
  otherName: string;
  buttonClassName?: string;
  /** Appelé à la fin de chaque appel, avec sa durée en secondes (comptage de la data). */
  onCallEnded?: (seconds: number) => void;
};

const INCOMING_TIMEOUT_MS = 45_000;

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || 'TC';
}

export function RideCall({ rideId, myUserId, active, otherName, buttonClassName, onCallEnded }: Props) {
  const [call, setCall] = useState<{ callId: string; role: 'caller' | 'callee' } | null>(null);
  const [incoming, setIncoming] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const callRef = useRef(call);
  callRef.current = call;

  // Appel entrant : à l'ouverture (arrivée par la notification) et en temps réel.
  useEffect(() => {
    if (!active) {
      setIncoming(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser.rpc('my_incoming_call', { p_ride_id: rideId });
      const row = Array.isArray(data) ? (data[0] as { call_id: string } | undefined) : null;
      if (!cancelled && row?.call_id && !callRef.current) setIncoming(row.call_id);
    })();
    const ch = freshChannel(`ride-calls:${rideId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ride_calls', filter: `ride_id=eq.${rideId}` },
        (payload) => {
          const raw = payload.new as { id: string; callee_id: string; status: string };
          if (raw.callee_id === myUserId && raw.status === 'ringing' && !callRef.current) setIncoming(raw.id);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ride_calls', filter: `ride_id=eq.${rideId}` },
        (payload) => {
          // L'appelant a raccroché ou l'appel est manqué : la sonnerie s'arrête.
          const raw = payload.new as { id: string; status: string };
          if (raw.status !== 'ringing') setIncoming((cur) => (cur === raw.id ? null : cur));
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabaseBrowser.removeChannel(ch);
    };
  }, [rideId, myUserId, active]);

  // Sonnerie et délai de l'appel entrant.
  useEffect(() => {
    if (!incoming || call) return;
    const stop = startRingtone();
    const t = setTimeout(() => setIncoming(null), INCOMING_TIMEOUT_MS);
    return () => {
      stop();
      clearTimeout(t);
    };
  }, [incoming, call]);

  // Message d'état (pas de réponse, appel terminé…) : visible 4 s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4_000);
    return () => clearTimeout(t);
  }, [toast]);

  async function startCall() {
    if (starting || call) return;
    if (!callsSupported()) {
      setToast("Les appels ne sont pas disponibles sur cet appareil.");
      return;
    }
    setStarting(true);
    const { data, error } = await supabaseBrowser.rpc('start_ride_call', { p_ride_id: rideId });
    setStarting(false);
    const row = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
    if (error || !row?.id) {
      const msg = error?.message ?? '';
      setToast(
        /start_ride_call|schema cache|could not find/i.test(msg)
          ? 'Les appels TamCar arrivent bientôt.'
          : msg || 'Appel indisponible pour le moment.',
      );
      return;
    }
    setCall({ callId: row.id, role: 'caller' });
  }

  async function answerIncoming() {
    const id = incoming;
    if (!id) return;
    setIncoming(null);
    const { error } = await supabaseBrowser.rpc('answer_ride_call', { p_call_id: id });
    if (error) {
      setToast('Cet appel est terminé.');
      return;
    }
    setCall({ callId: id, role: 'callee' });
  }

  async function declineIncoming() {
    const id = incoming;
    if (!id) return;
    setIncoming(null);
    await supabaseBrowser.rpc('end_ride_call', { p_call_id: id, p_status: 'declined' });
  }

  function handleEnd(end: CallEnd) {
    setCall(null);
    if (end.seconds > 0) onCallEnded?.(end.seconds);
    if (end.reason === 'timeout') setToast('Pas de réponse.');
    else if (end.reason === 'mic') setToast('Micro inaccessible : autorisez le micro pour TamCar.');
    else if (end.reason === 'unsupported') setToast("Les appels ne sont pas disponibles sur cet appareil.");
    else if (end.reason === 'network') setToast('La connexion a échoué. Essayez le message vocal.');
    else if (end.status === 'declined') setToast('Appel refusé.');
    else if (end.seconds > 0) setToast(`Appel terminé · ${fmt(end.seconds)}`);
  }

  if (!active && !call) return null;

  return (
    <>
      {active && (
        <button
          type="button"
          onClick={startCall}
          disabled={starting || !!call}
          className={
            buttonClassName ??
            'flex flex-1 items-center justify-center gap-xs rounded-xl bg-primary-500 py-2 text-xs font-bold text-white shadow-md transition hover:bg-primary-700 disabled:opacity-60'
          }
        >
          <PhoneIcon className="h-4 w-4" />
          {starting ? '…' : 'Appel TamCar'}
        </button>
      )}

      {incoming && !call && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-between bg-gradient-to-br from-primary-700 via-violet-500 to-primary-900 px-lg py-2xl text-white">
          <span className="mt-lg rounded-full bg-white/15 px-md py-xs text-[11px] font-bold uppercase tracking-widest text-white/90">
            Appel entrant · TamCar
          </span>
          <div className="flex flex-col items-center gap-lg">
            <div className="relative">
              <span className="absolute inset-0 animate-ping rounded-full bg-white/20" />
              <div className="relative grid h-32 w-32 place-items-center rounded-full bg-white/15 text-4xl font-extrabold ring-4 ring-white/25 backdrop-blur">
                {initials(otherName)}
              </div>
            </div>
            <div className="text-center">
              <p className="text-2xl font-extrabold">{otherName}</p>
              <p className="mt-xs animate-pulse text-sm text-white/80">vous appelle…</p>
            </div>
          </div>
          <div className="mb-lg flex w-full items-end justify-around">
            <button type="button" onClick={declineIncoming} className="flex flex-col items-center gap-xs" aria-label="Refuser">
              <span className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-error shadow-lg transition active:scale-95">
                <PhoneIcon className="h-7 w-7 rotate-[135deg] text-white" />
              </span>
              <span className="text-[11px] font-semibold text-white/80">Refuser</span>
            </button>
            <button type="button" onClick={answerIncoming} className="flex flex-col items-center gap-xs" aria-label="Répondre">
              <span className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-success shadow-lg transition active:scale-95">
                <PhoneIcon className="h-7 w-7 text-white" />
              </span>
              <span className="text-[11px] font-semibold text-white/80">Répondre</span>
            </button>
          </div>
        </div>
      )}

      {call && <CallRoom callId={call.callId} role={call.role} otherName={otherName} onClose={handleEnd} />}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[80] flex justify-center px-lg">
          <p className="rounded-full bg-neutral-900/95 px-lg py-sm text-xs font-semibold text-white shadow-xl" role="status">
            {toast}
          </p>
        </div>
      )}
    </>
  );
}
