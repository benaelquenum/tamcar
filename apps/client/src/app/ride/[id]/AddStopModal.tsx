'use client';

import { useState } from 'react';
import { AddressAutocomplete, type SelectedAddress } from '@/components/AddressAutocomplete';
import {
  projectTotals,
  quoteRouteChange,
  type LngLat,
  type RouteChangeQuote,
} from '@/lib/route-change';
import { supabaseBrowser } from '@/lib/supabase-browser';

type StopMode = 'stopover' | 'new_destination';

type Props = {
  open: boolean;
  onClose: () => void;
  rideId: string;
  pickup: LngLat;
  dropoff: LngLat;
  /** Arrêts encore à faire (pending / accepted), dans l'ordre. */
  existingStops: Array<{ lat: number; lng: number }>;
  currentPrice: number;
  /** Totaux actuels de la course (le nouveau prix s'en déduit). */
  rideKm: number;
  rideMin: number;
  inProgress: boolean;
  /** Position du véhicule : c'est d'elle que part le recalcul d'une course démarrée. */
  vehicle: LngLat | null;
  onAdded: () => void;
};

function formatFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export function AddStopModal({
  open,
  onClose,
  rideId,
  pickup,
  dropoff,
  existingStops,
  currentPrice,
  rideKm,
  rideMin,
  inProgress,
  vehicle,
  onAdded,
}: Props) {
  const [mode, setMode] = useState<StopMode>('stopover');
  const [selected, setSelected] = useState<SelectedAddress | null>(null);
  const [computing, setComputing] = useState(false);
  const [totals, setTotals] = useState<{ km: number; min: number } | null>(null);
  const [quote, setQuote] = useState<RouteChangeQuote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshEstimate(addr: SelectedAddress | null, chosenMode: StopMode) {
    setTotals(null);
    setQuote(null);
    setError(null);
    if (!addr) return;
    setComputing(true);
    try {
      const stopCoords = existingStops.map((s) => [s.lng, s.lat] as LngLat);
      // escale : … → arrêts → nouveau → destination ; nouvelle destination :
      // … → arrêts → nouveau (l'ancienne destination n'est plus desservie).
      const next = await projectTotals({
        rideKm,
        rideMin,
        inProgress,
        vehicle,
        pickup,
        oldStops: stopCoords,
        oldDropoff: dropoff,
        newStops: chosenMode === 'stopover' ? [...stopCoords, addr.center] : stopCoords,
        newDropoff: chosenMode === 'stopover' ? dropoff : addr.center,
      });
      // Base pas encore à jour (fonction absente) : on ajoute sans afficher le
      // nouveau prix — il est calculé côté serveur à la confirmation.
      let q: RouteChangeQuote | null = null;
      try {
        q = await quoteRouteChange(
          rideId,
          next.km,
          next.min,
          chosenMode === 'new_destination' ? addr.center : undefined,
        );
      } catch (qe) {
        const msg = qe instanceof Error ? qe.message : '';
        if (!/quote_ride_route_change|schema cache|could not find/i.test(msg)) throw qe;
      }
      setTotals(next);
      setQuote(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur calcul itinéraire');
    } finally {
      setComputing(false);
    }
  }

  async function handleSelectStop(addr: SelectedAddress | null) {
    setSelected(addr);
    await refreshEstimate(addr, mode);
  }

  async function handleModeChange(newMode: StopMode) {
    setMode(newMode);
    await refreshEstimate(selected, newMode);
  }

  async function submit() {
    if (!selected || !totals) return;
    setSubmitting(true);
    setError(null);
    const { error: rpcErr } = await supabaseBrowser.rpc('add_ride_stop', {
      p_ride_id: rideId,
      p_address: selected.place_name,
      p_lat: selected.center[1],
      p_lng: selected.center[0],
      p_new_total_km: Number(totals.km.toFixed(2)),
      p_new_total_min: Math.round(totals.min),
      p_mode: mode,
    });
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setSelected(null);
    setTotals(null);
    setQuote(null);
    onAdded();
    onClose();
  }

  if (!open) return null;

  const delta = quote ? quote.delta_fcfa : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-md text-center">
          <h2 className="text-lg font-extrabold text-neutral-900">
            Modifier l&apos;itinéraire
          </h2>
        </div>

        {/* Toggle mode */}
        <div className="mb-md grid grid-cols-2 gap-sm rounded-xl bg-neutral-100 p-xs">
          <button
            type="button"
            onClick={() => void handleModeChange('stopover')}
            className={`rounded-lg py-sm text-xs font-bold transition ${
              mode === 'stopover'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500'
            }`}
          >
            Escale sur le trajet
          </button>
          <button
            type="button"
            onClick={() => void handleModeChange('new_destination')}
            className={`rounded-lg py-sm text-xs font-bold transition ${
              mode === 'new_destination'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500'
            }`}
          >
            Nouvelle destination
          </button>
        </div>

        <p className="mb-md text-[11px] text-neutral-600">
          {mode === 'stopover'
            ? 'Le chauffeur y passe puis reprend le trajet vers votre destination initiale. 3 min d\'attente gratuites, puis 40 F/min.'
            : 'Ce lieu devient votre nouvelle destination finale. L\'ancienne destination n\'est plus desservie.'}
        </p>

        <AddressAutocomplete
          label={mode === 'stopover' ? 'Où voulez-vous passer ?' : 'Nouvelle destination'}
          placeholder="Cherche une adresse ou un lieu…"
          value={selected}
          onChange={handleSelectStop}
          markerColor={mode === 'stopover' ? '#8B5CF6' : '#2563EB'}
        />

        {computing && (
          <p className="mt-md text-center text-xs text-neutral-500">
            Calcul du nouvel itinéraire et du nouveau prix…
          </p>
        )}

        {totals && !computing && (
          <div className="mt-md rounded-xl border border-primary-200 bg-primary-50 p-md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
              Nouvel itinéraire
            </p>
            <div className="mt-xs space-y-xs text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-700">Distance totale</span>
                <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {totals.km.toFixed(1)} km
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-700">Durée estimée</span>
                <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(totals.min)} min
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-700">Prix actuel</span>
                <span className={`font-semibold text-neutral-500 ${quote ? 'line-through' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatFcfa(currentPrice)} F
                </span>
              </div>
              {quote && (
                <div className="flex items-baseline justify-between border-t border-primary-200 pt-xs">
                  <span className="font-bold text-neutral-900">Nouveau prix</span>
                  <span className="text-lg font-extrabold text-primary-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatFcfa(quote.new_total_fcfa)} F
                    <span className="ml-xs text-xs font-semibold text-neutral-500">
                      ({delta >= 0 ? '+' : '−'}{formatFcfa(Math.abs(delta))} F)
                    </span>
                  </span>
                </div>
              )}
            </div>
            <p className="mt-md text-[10px] text-neutral-500">
              Calculé par TamCar avec la même grille que votre commande. Votre
              chauffeur est prévenu : nouvel arrêt, nouveau prix et sa part.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-md rounded-md bg-error/10 p-md text-sm text-error">
            {error}
          </div>
        )}

        <div className="mt-lg flex gap-md">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-600 hover:border-neutral-300"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !selected || !totals || computing}
            className="flex-1 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow disabled:opacity-50"
          >
            {submitting
              ? 'Envoi…'
              : quote
                ? `Confirmer · ${formatFcfa(quote.new_total_fcfa)} F`
                : mode === 'stopover'
                  ? 'Ajouter cette escale'
                  : 'Définir comme destination'}
          </button>
        </div>
      </div>
    </div>
  );
}
