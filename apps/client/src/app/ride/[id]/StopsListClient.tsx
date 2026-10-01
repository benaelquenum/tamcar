'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import {
  projectTotals,
  quoteRouteChange,
  type LngLat,
  type RouteChangeQuote,
} from '@/lib/route-change';
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
  /** Prix et totaux actuels de la course, position du véhicule : le nouveau prix s'en déduit. */
  currentPrice: number;
  rideKm: number;
  rideMin: number;
  inProgress: boolean;
  vehicle: LngLat | null;
  onChanged: () => void;
};

/** Une modification d'itinéraire en attente de confirmation du client. */
type Proposal = {
  title: string;
  km: number;
  min: number;
  quote: RouteChangeQuote | null;
  apply: () => Promise<void>;
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export function StopsListClient({
  rideId,
  rideStatus,
  pickup,
  pickupAddress,
  dropoff,
  dropoffAddress,
  stops,
  currentPrice,
  rideKm,
  rideMin,
  inProgress,
  vehicle,
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

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [applying, setApplying] = useState(false);

  const toCoord = (x: { lng: number; lat: number }) => [x.lng, x.lat] as LngLat;

  // Calcule le nouvel itinéraire ET le nouveau prix, puis demande confirmation :
  // rien n'est modifié (ni facturé) avant le « Confirmer » du client.
  function propose(
    title: string,
    next: { stops: LngLat[]; dropoff: LngLat },
    apply: (km: number, min: number) => Promise<void>,
  ) {
    setErr(null);
    startTransition(async () => {
      try {
        const totals = await projectTotals({
          rideKm,
          rideMin,
          inProgress,
          vehicle,
          pickup,
          oldStops: modifiable.map(toCoord),
          oldDropoff: dropoff,
          newStops: next.stops,
          newDropoff: next.dropoff,
        });
        let quote: RouteChangeQuote | null = null;
        try {
          quote = await quoteRouteChange(
            rideId,
            totals.km,
            totals.min,
            next.dropoff[0] === dropoff[0] && next.dropoff[1] === dropoff[1] ? undefined : next.dropoff,
          );
        } catch (qe) {
          const msg = qe instanceof Error ? qe.message : '';
          // Base pas encore à jour : on propose sans nouveau prix affiché.
          if (!/quote_ride_route_change|schema cache|could not find/i.test(msg)) throw qe;
        }
        setProposal({
          title,
          km: totals.km,
          min: totals.min,
          quote,
          apply: () => apply(Number(totals.km.toFixed(2)), Math.round(totals.min)),
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erreur de calcul');
      }
    });
  }

  async function confirmProposal() {
    if (!proposal || applying) return;
    setApplying(true);
    try {
      await proposal.apply();
      setProposal(null);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
      setProposal(null);
    } finally {
      setApplying(false);
    }
  }

  function handleRemove(stopId: string) {
    const remaining = modifiable.filter((s) => s.id !== stopId).map(toCoord);
    propose('Retirer cet arrêt', { stops: remaining, dropoff }, async (km, min) => {
      const { error } = await supabaseBrowser.rpc('remove_ride_stop', {
        p_stop_id: stopId,
        p_new_total_km: km,
        p_new_total_min: min,
      });
      if (error) throw new Error(error.message);
    });
  }

  function commitReorder(reordered: ClientStopRow[]) {
    propose('Changer l’ordre des arrêts', { stops: reordered.map(toCoord), dropoff }, async (km, min) => {
      const { error } = await supabaseBrowser.rpc('reorder_ride_stops', {
        p_ride_id: rideId,
        p_ordered_stop_ids: reordered.map((s) => s.id),
        p_new_total_km: km,
        p_new_total_min: min,
      });
      if (error) throw new Error(error.message);
    });
  }

  function handleReorderByIdx(fromIdx: number, toIdx: number) {
    setErr(null);
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= modifiable.length || toIdx >= modifiable.length) return;
    if (fromIdx === toIdx) return;
    const reordered = [...modifiable];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    commitReorder(reordered);
  }

  function handlePromoteToDropoff(stopId: string) {
    const promoted = modifiable.find((s) => s.id === stopId);
    if (!promoted) return;
    // L'ancienne destination devient le dernier arrêt, le point promu la destination.
    const others = modifiable.filter((s) => s.id !== stopId).map(toCoord);
    propose(
      'En faire la destination finale',
      { stops: [...others, dropoff], dropoff: toCoord(promoted) },
      async (km, min) => {
        const { error } = await supabaseBrowser.rpc('swap_stop_and_dropoff', {
          p_stop_id: stopId,
          p_new_total_km: km,
          p_new_total_min: min,
        });
        if (error) throw new Error(error.message);
      },
    );
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
    for (const row of Array.from(rows)) {
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
        handleReorderByIdx(fromIdx, toIdx);
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
                        onClick={() => handlePromoteToDropoff(s.id)}
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
                          onClick={() => handleReorderByIdx(modIdx, modIdx - 1)}
                          disabled={!canMoveUp || pending}
                          aria-label="Remonter"
                          className="grid h-7 w-7 place-items-center rounded-md bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReorderByIdx(modIdx, modIdx + 1)}
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
                        onClick={() => handleRemove(s.id)}
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
          ★ pour en faire votre destination · ⋮⋮ + glissez pour réordonner · × pour retirer
        </p>
      )}
      {err && <p className="mt-xs text-[10px] text-error">{err}</p>}
      {pending && !proposal && (
        <p className="mt-xs text-center text-[10px] text-neutral-500">Calcul du nouveau prix…</p>
      )}

      {proposal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/70 backdrop-blur-sm sm:items-center"
          onClick={() => { if (!applying) setProposal(null); }}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-center text-lg font-extrabold text-neutral-900">{proposal.title}</h2>
            <div className="mt-md space-y-xs rounded-xl border border-primary-200 bg-primary-50 p-md text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-700">Distance totale</span>
                <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {proposal.km.toFixed(1)} km
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-700">Durée estimée</span>
                <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(proposal.min)} min
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-700">Prix actuel</span>
                <span
                  className={`font-semibold text-neutral-500 ${proposal.quote ? 'line-through' : ''}`}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {fmt(currentPrice)} F
                </span>
              </div>
              {proposal.quote && (
                <div className="flex items-baseline justify-between border-t border-primary-200 pt-xs">
                  <span className="font-bold text-neutral-900">Nouveau prix</span>
                  <span className="text-lg font-extrabold text-primary-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(proposal.quote.new_total_fcfa)} F
                    <span className="ml-xs text-xs font-semibold text-neutral-500">
                      ({proposal.quote.delta_fcfa >= 0 ? '+' : '−'}{fmt(Math.abs(proposal.quote.delta_fcfa))} F)
                    </span>
                  </span>
                </div>
              )}
            </div>
            <p className="mt-sm text-center text-[10px] text-neutral-500">
              Votre chauffeur est prévenu de la modification, du nouveau prix et de sa part.
            </p>
            <div className="mt-lg flex gap-md">
              <button
                type="button"
                onClick={() => setProposal(null)}
                disabled={applying}
                className="flex-1 rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-600 hover:border-neutral-300"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void confirmProposal()}
                disabled={applying}
                className="flex-1 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow disabled:opacity-50"
              >
                {applying ? 'Envoi…' : proposal.quote ? `Confirmer · ${fmt(proposal.quote.new_total_fcfa)} F` : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
