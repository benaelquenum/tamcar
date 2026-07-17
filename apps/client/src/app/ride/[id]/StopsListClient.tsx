'use client';

import { useState, useTransition } from 'react';
import { getRoute } from '@/lib/mapbox';
import { supabaseBrowser } from '@/lib/supabase-browser';

export type ClientStopRow = {
  id: string;
  order_idx: number;
  address: string;
  lat: number;
  lng: number;
  status: string;
  extra_price_fcfa: number;
  waiting_extra_fee_fcfa: number;
};

type Props = {
  rideId: string;
  rideStatus: string;
  pickup: [number, number];
  dropoff: [number, number];
  stops: ClientStopRow[];
  onChanged: () => void;
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

async function totalItineraryKm(
  pickup: [number, number],
  stopCoords: Array<[number, number]>,
  dropoff: [number, number],
): Promise<{ totalKm: number; totalMin: number }> {
  const waypoints: Array<[number, number]> = [pickup, ...stopCoords, dropoff];
  let totalKm = 0;
  let totalMin = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const seg = await getRoute(waypoints[i], waypoints[i + 1]);
    if (!seg) throw new Error(`Segment ${i + 1} injoignable`);
    totalKm += seg.distance_km;
    totalMin += seg.duration_min;
  }
  return { totalKm, totalMin: Math.round(totalMin) };
}

export function StopsListClient({
  rideId,
  rideStatus,
  pickup,
  dropoff,
  stops,
  onChanged,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const active = stops
    .filter((s) => s.status !== 'cancelled')
    .sort((a, b) => a.order_idx - b.order_idx);

  if (active.length === 0) return null;

  const isModifiable = (s: ClientStopRow) => s.status === 'pending' || s.status === 'accepted';
  const modifiable = active.filter(isModifiable);
  // Contrôles éditables uniquement pendant que la course peut encore bouger
  const canEdit = ['matched', 'arrived', 'in_progress'].includes(rideStatus);

  async function handleRemove(stopId: string) {
    setErr(null);
    const remaining = active.filter((s) => s.id !== stopId).map((s) => [s.lng, s.lat] as [number, number]);
    startTransition(async () => {
      try {
        const { totalKm, totalMin } = await totalItineraryKm(pickup, remaining, dropoff);
        const { error } = await supabaseBrowser.rpc('remove_ride_stop', {
          p_stop_id: stopId,
          p_new_total_km: totalKm,
          p_new_total_min: totalMin,
        });
        if (error) throw new Error(error.message);
        onChanged();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erreur suppression');
      }
    });
  }

  async function handleReorder(fromIdx: number, toIdx: number) {
    setErr(null);
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= modifiable.length || toIdx >= modifiable.length) return;
    if (fromIdx === toIdx) return;
    const reordered = [...modifiable];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const nonMod = active.filter((s) => !isModifiable(s));
    const finalOrder = [...nonMod, ...reordered];
    startTransition(async () => {
      try {
        const { totalKm, totalMin } = await totalItineraryKm(
          pickup,
          finalOrder.map((s) => [s.lng, s.lat] as [number, number]),
          dropoff,
        );
        const { error } = await supabaseBrowser.rpc('reorder_ride_stops', {
          p_ride_id: rideId,
          p_ordered_stop_ids: reordered.map((s) => s.id),
          p_new_total_km: totalKm,
          p_new_total_min: totalMin,
        });
        if (error) throw new Error(error.message);
        onChanged();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erreur réordonnancement');
      }
    });
  }

  async function handlePromoteToDropoff(stopId: string) {
    setErr(null);
    // Nouvel itinéraire : pickup → autres stops modifiables (sans celui promu)
    // → nouvelle destination (le stop promu)
    // Note : le RPC recycle le stop en "ancien dropoff" à la fin des stops.
    const promoted = active.find((s) => s.id === stopId);
    if (!promoted) return;
    const otherStops = active.filter((s) => s.id !== stopId && s.status !== 'cancelled');
    // Après swap : stops = [...otherStops, ancien dropoff], nouveau dropoff = promoted
    const newRouteStops = [
      ...otherStops.map((s) => [s.lng, s.lat] as [number, number]),
      dropoff, // ancien dropoff recyclé en stop
    ];
    startTransition(async () => {
      try {
        const { totalKm, totalMin } = await totalItineraryKm(
          pickup,
          newRouteStops,
          [promoted.lng, promoted.lat] as [number, number],
        );
        const { error } = await supabaseBrowser.rpc('swap_stop_and_dropoff', {
          p_stop_id: stopId,
          p_new_total_km: totalKm,
          p_new_total_min: totalMin,
        });
        if (error) throw new Error(error.message);
        onChanged();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erreur promotion en destination');
      }
    });
  }

  return (
    <div className="mb-sm space-y-xs">
      {active.map((s) => {
        const modIdx = modifiable.findIndex((m) => m.id === s.id);
        const canMoveUp = canEdit && modIdx > 0;
        const canMoveDown = canEdit && modIdx >= 0 && modIdx < modifiable.length - 1;
        const canRemove = canEdit && isModifiable(s);
        const canPromote = canEdit && isModifiable(s);
        return (
          <div
            key={s.id}
            className="flex items-center gap-sm rounded-lg bg-violet-500/10 p-sm text-xs ring-1 ring-violet-500/20"
          >
            <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-violet-500 font-bold text-white">
              {s.order_idx}
            </span>
            <div className="flex-1 min-w-0">
              <p className="truncate font-semibold text-neutral-900">{s.address}</p>
              <p className="text-[10px] text-neutral-600">
                {s.status === 'pending' && 'Envoyé au chauffeur'}
                {s.status === 'accepted' && 'Prévu'}
                {s.status === 'arrived' && '↳ Arrêt en cours'}
                {s.status === 'departed' && `Terminé · +${fmt(s.waiting_extra_fee_fcfa)} F attente`}
              </p>
            </div>
            <span
              className="text-[10px] font-bold text-violet-700"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              +{fmt(s.extra_price_fcfa)} F
            </span>
            {canPromote && (
              <button
                type="button"
                onClick={() => void handlePromoteToDropoff(s.id)}
                disabled={pending}
                aria-label="Faire de cet arrêt ma destination finale"
                title="Faire de cet arrêt ma destination finale"
                className="grid h-6 w-6 flex-none place-items-center rounded-full bg-primary-500 text-[11px] text-white hover:brightness-110 disabled:opacity-40"
              >
                ★
              </button>
            )}
            {(canMoveUp || canMoveDown) && (
              <div className="flex flex-none flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => void handleReorder(modIdx, modIdx - 1)}
                  disabled={!canMoveUp || pending}
                  aria-label="Remonter"
                  className="grid h-4 w-4 place-items-center rounded text-neutral-500 hover:bg-white disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => void handleReorder(modIdx, modIdx + 1)}
                  disabled={!canMoveDown || pending}
                  aria-label="Descendre"
                  className="grid h-4 w-4 place-items-center rounded text-neutral-500 hover:bg-white disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
            )}
            {canRemove && (
              <button
                type="button"
                onClick={() => void handleRemove(s.id)}
                disabled={pending}
                aria-label="Retirer cet arrêt"
                className="grid h-6 w-6 flex-none place-items-center rounded-full bg-error/10 text-error hover:bg-error/20 disabled:opacity-40"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      {err && <p className="text-[10px] text-error">{err}</p>}
    </div>
  );
}
