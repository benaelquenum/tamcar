'use client';

import { useState } from 'react';
import { AddressAutocomplete, type SelectedAddress } from '@/components/AddressAutocomplete';
import { getRoute } from '@/lib/mapbox';
import { supabaseBrowser } from '@/lib/supabase-browser';

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
  const [selected, setSelected] = useState<SelectedAddress | null>(null);
  const [computing, setComputing] = useState(false);
  const [newTotalKm, setNewTotalKm] = useState<number | null>(null);
  const [newTotalMin, setNewTotalMin] = useState<number | null>(null);
  const [extraKm, setExtraKm] = useState<number | null>(null);
  const [extraPrice, setExtraPrice] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelectStop(addr: SelectedAddress | null) {
    setSelected(addr);
    setNewTotalKm(null);
    setNewTotalMin(null);
    setExtraKm(null);
    setExtraPrice(null);
    setError(null);
    if (!addr) return;
    setComputing(true);
    // Nouvel itinéraire : pickup → stops existants → nouveau stop → dropoff
    const waypoints: Array<[number, number]> = [
      pickup,
      ...existingStops.map((s) => [s.lng, s.lat] as [number, number]),
      addr.center,
      dropoff,
    ];
    try {
      // Simplification : on additionne les segments (getRoute prend 2 points)
      let totalKm = 0;
      let totalMin = 0;
      for (let i = 0; i < waypoints.length - 1; i++) {
        const seg = await getRoute(waypoints[i], waypoints[i + 1]);
        if (!seg) throw new Error(`Impossible de calculer le segment ${i + 1}`);
        totalKm += seg.distance_km;
        totalMin += seg.duration_min;
      }
      setNewTotalKm(totalKm);
      setNewTotalMin(Math.round(totalMin));
      // Extra approx (le vrai calcul se fait côté serveur avec km_city_fcfa de la catégorie)
      const origKm = 0; // on n'a pas la distance ride ici, mais le RPC recalcule
      const extra = Math.max(0, totalKm - origKm);
      setExtraKm(extra);
      // Estimation prix additionnel côté client : 90 F/km (Essentiel par défaut)
      // Le RPC utilisera la vraie catégorie du véhicule
      setExtraPrice(Math.ceil(extra * 90));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur calcul itinéraire');
    } finally {
      setComputing(false);
    }
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
            Ajouter un arrêt
          </h2>
          <p className="mt-xs text-xs text-neutral-600">
            Passe par un point supplémentaire. Le prix est recalculé selon la
            distance additionnelle. 3 min d&apos;attente gratuites, puis 40 F/min.
          </p>
        </div>

        <AddressAutocomplete
          label="Où veux-tu passer ?"
          placeholder="Cherche une adresse ou un lieu…"
          value={selected}
          onChange={handleSelectStop}
          markerColor="#8B5CF6"
        />

        {computing && (
          <p className="mt-md text-center text-xs text-neutral-500">
            Calcul du nouvel itinéraire…
          </p>
        )}

        {extraKm != null && extraPrice != null && !computing && (
          <div className="mt-md rounded-xl border border-primary-200 bg-primary-50 p-md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
              Estimation du recalcul
            </p>
            <div className="mt-xs space-y-xs text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-700">Distance additionnelle</span>
                <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {extraKm.toFixed(1)} km
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-700">Coût additionnel estimé</span>
                <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  +{formatFcfa(extraPrice)} F
                </span>
              </div>
              <div className="mt-sm flex justify-between border-t border-primary-200 pt-sm text-base">
                <span className="font-bold text-neutral-900">Nouveau total estimé</span>
                <span
                  className="font-extrabold text-neutral-900"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatFcfa(currentPrice + extraPrice)} F
                </span>
              </div>
            </div>
            <p className="mt-md text-[10px] text-neutral-500">
              Le prix exact sera calculé par TamCar selon la catégorie du véhicule.
              Frais d&apos;attente : décomptés au départ de l&apos;arrêt.
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
            {submitting ? 'Envoi…' : 'Ajouter cet arrêt'}
          </button>
        </div>
      </div>
    </div>
  );
}
