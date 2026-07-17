'use client';

import { useEffect, useState, useTransition } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

type RideStopRow = {
  id: string;
  order_idx: number;
  address: string;
  lat: number;
  lng: number;
  status: 'pending' | 'accepted' | 'arrived' | 'departed' | 'cancelled';
  arrived_at: string | null;
  waiting_extra_fee_fcfa: number;
  extra_price_fcfa: number;
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export function StopsPanel({ rideId }: { rideId: string }) {
  const [stops, setStops] = useState<RideStopRow[]>([]);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabaseBrowser.rpc('ride_stops_of', { p_ride_id: rideId });
      if (!cancelled) setStops((data ?? []) as RideStopRow[]);
    }
    load();
    const channel = supabaseBrowser
      .channel(`driver-stops:${rideId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ride_stops', filter: `ride_id=eq.${rideId}` },
        load,
      )
      .subscribe();
    return () => { cancelled = true; supabaseBrowser.removeChannel(channel); };
  }, [rideId]);

  function call(rpc: string, id: string) {
    setErr(null);
    startTransition(async () => {
      const { error } = await supabaseBrowser.rpc(rpc, { p_stop_id: id });
      if (error) setErr(error.message);
    });
  }

  if (stops.length === 0) return null;

  return (
    <section className="mb-md space-y-xs">
      {stops.map((s) => (
        <StopRow key={s.id} stop={s} pending={pending} onCall={call} />
      ))}
      {err && (
        <p className="text-center text-xs text-error">{err}</p>
      )}
    </section>
  );
}

function StopRow({
  stop,
  pending,
  onCall,
}: {
  stop: RideStopRow;
  pending: boolean;
  onCall: (rpc: string, id: string) => void;
}) {
  const [waitingSec, setWaitingSec] = useState(0);

  useEffect(() => {
    if (stop.status !== 'arrived' || !stop.arrived_at) return;
    const start = new Date(stop.arrived_at).getTime();
    const tick = () => setWaitingSec(Math.max(0, Math.round((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [stop.arrived_at, stop.status]);

  const isPaidWaiting = waitingSec > 180;
  const extraMin = isPaidWaiting ? Math.ceil((waitingSec - 180) / 60) : 0;
  const runningFee = extraMin * 40;

  return (
    <div
      className={`rounded-lg p-sm ring-1 ${
        stop.status === 'arrived'
          ? 'bg-primary-50 ring-primary-200'
          : stop.status === 'departed'
            ? 'bg-neutral-100 ring-neutral-200 opacity-70'
            : 'bg-violet-500/10 ring-violet-500/30'
      }`}
    >
      <div className="flex items-center gap-sm">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-violet-500 text-xs font-bold text-white">
          {stop.order_idx}
        </span>
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-bold text-neutral-900">
            {stop.address}
          </p>
          <p className="text-[10px] text-neutral-600">
            {stop.status === 'pending' && 'À accepter'}
            {stop.status === 'accepted' && '→ Va vers l\'arrêt'}
            {stop.status === 'arrived' && (
              <span
                className={isPaidWaiting ? 'font-bold text-error' : ''}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                Attente {Math.floor(waitingSec / 60)}m{(waitingSec % 60).toString().padStart(2, '0')}
                {isPaidWaiting && ` · +${fmt(runningFee)} F facturés`}
              </span>
            )}
            {stop.status === 'departed' && `Terminé · +${fmt(stop.waiting_extra_fee_fcfa)} F attente`}
          </p>
        </div>
        <span
          className="text-[10px] font-bold text-violet-700"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          +{fmt(stop.extra_price_fcfa)} F
        </span>
      </div>

      {/* Actions par étape */}
      {stop.status === 'pending' && (
        <button
          type="button"
          onClick={() => onCall('driver_accept_stop', stop.id)}
          disabled={pending}
          className="mt-xs w-full rounded-md bg-primary-500 py-xs text-[11px] font-bold text-white disabled:opacity-50"
        >
          Accepter cet arrêt
        </button>
      )}
      {stop.status === 'accepted' && (
        <button
          type="button"
          onClick={() => onCall('driver_arrive_at_stop', stop.id)}
          disabled={pending}
          className="mt-xs w-full rounded-md bg-primary-500 py-xs text-[11px] font-bold text-white disabled:opacity-50"
        >
          Je suis arrivé à l&apos;arrêt
        </button>
      )}
      {stop.status === 'arrived' && (
        <button
          type="button"
          onClick={() => onCall('driver_depart_from_stop', stop.id)}
          disabled={pending}
          className="mt-xs w-full rounded-md bg-primary-700 py-xs text-[11px] font-bold text-white disabled:opacity-50"
        >
          Je repars · {isPaidWaiting ? `+${fmt(runningFee)} F` : 'gratuit'}
        </button>
      )}
    </div>
  );
}
