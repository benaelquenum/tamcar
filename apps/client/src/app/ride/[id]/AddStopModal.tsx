'use client';

import { useState } from 'react';
import { AddressAutocomplete, type SelectedAddress } from '@/components/AddressAutocomplete';
import { getRoute } from '@/lib/mapbox';
import { supabaseBrowser } from '@/lib/supabase-browser';

type StopMode = 'stopover' | 'new_destination';

type Props = {
  open: boolean;
  onClose: () => void;
  rideId: string;
  pickup: [number, number];
  dropoff: [number, number];
  existingStops: Array<{ lat: number; lng: number }>;
  currentPrice: number;
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
  onAdded,
}: Props) {
  const [mode, setMode] = useState<StopMode>('stopover');
  const [selected, setSelected] = useState<SelectedAddress | null>(null);
  const [computing, setComputing] = useState(false);
  const [newTotalKm, setNewTotalKm] = useState<number | null>(null);
  const [newTotalMin, setNewTotalMin] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function computeItinerary(addr: SelectedAddress, chosenMode: StopMode) {
    // stopover  : pickup → stops → nouveau → dropoff
    // new_dest  : pickup → stops → nouveau (dropoff ignoré)
    const waypoints: Array<[number, number]> = [
      pickup,
      ...existingStops.map((s) => [s.lng, s.lat] as [number, number]),
      addr.center,
    ];
    if (chosenMode === 'stopover') waypoints.push(dropoff);

    let totalKm = 0;
    let totalMin = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const seg = await getRoute(waypoints[i], waypoints[i + 1]);
      if (!seg) throw new Error(`Impossible de calculer le segment ${i + 1}`);
      totalKm += seg.distance_km;
      totalMin += seg.duration_min;
    }
    return { totalKm, totalMin };
  }

  async function refreshEstimate(addr: SelectedAddress | null, chosenMode: StopMode) {
    setNewTotalKm(null);
    setNewTotalMin(null);
    setError(null);
    if (!addr) return;
    setComputing(true);
    try {
      const { totalKm, totalMin } = await computeItinerary(addr, chosenMode);
      setNewTotalKm(totalKm);
      setNewTotalMin(Math.round(totalMin));
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
    if (!selected || newTotalKm == null || newTotalMin == null) return;
    setSubmitting(true);
    setError(null);
    const { error: rpcErr } = await supabaseBrowser.rpc('add_ride_stop', {
      p_ride_id: rideId,
      p_address: selected.place_name,
      p_lat: selected.center[1],
      p_lng: selected.center[0],
      p_new_total_km: newTotalKm,
      p_new_total_min: newTotalMin,
      p_mode: mode,
    });
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    onAdded();
    onClose();
  }

  if (!open) return null;

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
            ? 'Le chauffeur y passe puis reprend le trajet vers ta destination initiale. 3 min d\'attente gratuites, puis 40 F/min.'
            : 'Ce lieu devient ta nouvelle destination finale. L\'ancienne destination n\'est plus desservie.'}
        </p>

        <AddressAutocomplete
          label={mode === 'stopover' ? 'Où veux-tu passer ?' : 'Nouvelle destination'}
          placeholder="Cherche une adresse ou un lieu…"
          value={selected}
          onChange={handleSelectStop}
          markerColor={mode === 'stopover' ? '#8B5CF6' : '#2563EB'}
        />

        {computing && (
          <p className="mt-md text-center text-xs text-neutral-500">
            Calcul du nouvel itinéraire…
          </p>
        )}

        {newTotalKm != null && newTotalMin != null && !computing && (
          <div className="mt-md rounded-xl border border-primary-200 bg-primary-50 p-md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
              Nouvel itinéraire
            </p>
            <div className="mt-xs space-y-xs text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-700">Distance totale</span>
                <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {newTotalKm.toFixed(1)} km
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-700">Durée estimée</span>
                <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {newTotalMin} min
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-700">Total actuel</span>
                <span className="font-semibold text-neutral-500 line-through" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatFcfa(currentPrice)} F
                </span>
              </div>
            </div>
            <p className="mt-md text-[10px] text-neutral-500">
              Le nouveau prix sera calculé par TamCar selon la distance additionnelle
              et la catégorie de ton véhicule.
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
            disabled={submitting || !selected || newTotalKm == null || computing}
            className="flex-1 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow disabled:opacity-50"
          >
            {submitting
              ? 'Envoi…'
              : mode === 'stopover'
                ? 'Ajouter cette escale'
                : 'Définir comme destination'}
          </button>
        </div>
      </div>
    </div>
  );
}
