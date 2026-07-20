'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { getRoute } from '@/lib/mapbox';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useT } from '@/lib/i18n-client';

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
  pickupAddress: string;
  dropoff: [number, number];
  dropoffAddress: string;
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
  pickupAddress,
  dropoff,
  dropoffAddress,
  stops,
  onChanged,
}: Props) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const active = stops
    .filter((s) => s.status !== 'cancelled')
    .sort((a, b) => a.order_idx - b.order_idx);

  const isModifiable = (s: ClientStopRow) => s.status === 'pending' || s.status === 'accepted';
  const modifiable = active.filter(isModifiable);
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

  async function commitReorder(reordered: ClientStopRow[]) {
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

  async function handleReorderByIdx(fromIdx: number, toIdx: number) {
    setErr(null);
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= modifiable.length || toIdx >= modifiable.length) return;
    if (fromIdx === toIdx) return;
    const reordered = [...modifiable];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    await commitReorder(reordered);
  }

  async function handlePromoteToDropoff(stopId: string) {
    setErr(null);
    const promoted = active.find((s) => s.id === stopId);
    if (!promoted) return;
    const otherStops = active.filter((s) => s.id !== stopId && s.status !== 'cancelled');
    const newRouteStops = [
      ...otherStops.map((s) => [s.lng, s.lat] as [number, number]),
      dropoff,
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

  // Drag & drop tactile (pointer events)
  const dragStartYRef = useRef<number>(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, stopId: string) {
    if (!canEdit || pending) return;
    const target = active.find((s) => s.id === stopId);
    if (!target || !isModifiable(target)) return;
    dragStartYRef.current = e.clientY;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      setDraggingId(stopId);
      if (navigator.vibrate) navigator.vibrate(20);
    }, 200);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (holdTimerRef.current && Math.abs(e.clientY - dragStartYRef.current) > 8) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!draggingId || !containerRef.current) return;
    const rows = containerRef.current.querySelectorAll<HTMLDivElement>('[data-stop-id]');
    let overId: string | null = null;
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) {
        overId = row.dataset.stopId ?? null;
        break;
      }
    }
    setDragOverId(overId);
  }

  function onPointerUp() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (draggingId && dragOverId && draggingId !== dragOverId) {
      const fromIdx = modifiable.findIndex((s) => s.id === draggingId);
      const toIdx = modifiable.findIndex((s) => s.id === dragOverId);
      if (fromIdx >= 0 && toIdx >= 0) {
        void handleReorderByIdx(fromIdx, toIdx);
      }
    }
    setDraggingId(null);
    setDragOverId(null);
  }

  return (
    <div
      ref={containerRef}
      className="mb-sm"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Timeline pickup → escales → destination */}
      <div className="rounded-xl bg-neutral-50 p-md ring-1 ring-neutral-200">
        {/* Départ */}
        <div className="flex items-start gap-md">
          <span className="mt-xs grid h-4 w-4 flex-none place-items-center rounded-full bg-neutral-400" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              {t('ride.pickup_label')}
            </p>
            <p className="text-xs font-semibold text-neutral-900">{pickupAddress}</p>
          </div>
        </div>

        {/* Escales */}
        {active.map((s) => {
          const modIdx = modifiable.findIndex((m) => m.id === s.id);
          const canMoveUp = canEdit && modIdx > 0;
          const canMoveDown = canEdit && modIdx >= 0 && modIdx < modifiable.length - 1;
          const canRemove = canEdit && isModifiable(s);
          const canPromote = canEdit && isModifiable(s);
          const isDragging = draggingId === s.id;
          const isDragTarget = dragOverId === s.id && draggingId && draggingId !== s.id;
          return (
            <div key={s.id}>
              <div className="ml-2 h-3 border-l-2 border-dashed border-neutral-300" />
              <div
                data-stop-id={s.id}
                onPointerDown={(e) => onPointerDown(e, s.id)}
                className={`flex items-start gap-md rounded-lg p-sm transition ${
                  isDragging
                    ? 'scale-[1.02] bg-primary-100 ring-2 ring-primary-500 shadow-lg'
                    : isDragTarget
                      ? 'bg-primary-50 ring-2 ring-primary-400'
                      : 'bg-violet-500/10 ring-1 ring-violet-500/20'
                }`}
                style={{ touchAction: canEdit && isModifiable(s) ? 'none' : 'auto' }}
              >
                {canEdit && isModifiable(s) && (
                  <span aria-hidden className="grid h-8 w-4 flex-none place-items-center text-neutral-400">
                    ⋮⋮
                  </span>
                )}
                <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-violet-500 text-[10px] font-bold text-white">
                  {s.order_idx}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
                    Escale {s.order_idx}
                  </p>
                  <p className="truncate text-xs font-semibold text-neutral-900">{s.address}</p>
                  <p className="text-[10px] text-neutral-600">
                    {s.status === 'pending' && 'Envoyé au chauffeur'}
                    {s.status === 'accepted' && 'Prévu'}
                    {s.status === 'arrived' && '↳ En cours'}
                    {s.status === 'departed' && `Terminé · +${fmt(s.waiting_extra_fee_fcfa)} F attente`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-xs">
                  <span
                    className="text-[10px] font-bold text-violet-700"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    +{fmt(s.extra_price_fcfa)} F
                  </span>
                  <div className="flex items-center gap-xs">
                    {canPromote && (
                      <button
                        type="button"
                        onClick={() => void handlePromoteToDropoff(s.id)}
                        disabled={pending}
                        aria-label="En faire ma destination finale"
                        title="En faire ma destination finale"
                        className="grid h-8 w-8 flex-none place-items-center rounded-full bg-primary-500 text-sm text-white hover:brightness-110 disabled:opacity-40"
                      >
                        ★
                      </button>
                    )}
                    {(canMoveUp || canMoveDown) && (
                      <div className="flex flex-none flex-col gap-xs">
                        <button
                          type="button"
                          onClick={() => void handleReorderByIdx(modIdx, modIdx - 1)}
                          disabled={!canMoveUp || pending}
                          aria-label="Remonter"
                          className="grid h-7 w-7 place-items-center rounded-md bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReorderByIdx(modIdx, modIdx + 1)}
                          disabled={!canMoveDown || pending}
                          aria-label="Descendre"
                          className="grid h-7 w-7 place-items-center rounded-md bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-30"
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
                        className="grid h-8 w-8 flex-none place-items-center rounded-full bg-error/10 text-lg text-error hover:bg-error/20 disabled:opacity-40"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Destination finale */}
        <div className="ml-2 h-3 border-l-2 border-dashed border-neutral-300" />
        <div className="flex items-start gap-md rounded-lg bg-primary-50 p-sm ring-1 ring-primary-200">
          <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-primary-500 text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
              {t('ride.dropoff_final')}
            </p>
            <p className="text-xs font-bold text-neutral-900">{dropoffAddress}</p>
          </div>
        </div>
      </div>

      {canEdit && modifiable.length > 0 && (
        <p className="mt-xs text-center text-[10px] text-neutral-500">
          ★ pour en faire ta destination · ⋮⋮ + glisse pour réordonner · × pour retirer
        </p>
      )}
      {err && <p className="mt-xs text-[10px] text-error">{err}</p>}
    </div>
  );
}
