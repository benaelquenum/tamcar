'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AddressAutocomplete,
  type SelectedAddress,
} from '@/components/AddressAutocomplete';
import { Map } from '@/components/Map';
import { getRoute, type RouteResult } from '@/lib/mapbox';
import { computePrice, type VehicleCategory } from '@/lib/pricing';
import { supabaseBrowser } from '@/lib/supabase-browser';

type RecentDriver = {
  driver_id: string;
  driver_name: string;
  driver_rating: number | null;
  vehicle_category: string;
  vehicle_label: string | null;
  is_online: boolean;
};

function fmtFcfa(n: number): string {
  return n.toLocaleString('fr-FR');
}

export default function RequestDriverPage() {
  const router = useRouter();
  const { driverId } = useParams<{ driverId: string }>();

  const [driver, setDriver] = useState<RecentDriver | null>(null);
  const [origin, setOrigin] = useState<SelectedAddress | null>(null);
  const [dropoff, setDropoff] = useState<SelectedAddress | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Retrouve le chauffeur dans la liste des chauffeurs récents
  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser.rpc('my_recent_drivers', {
        p_limit: 50,
      });
      const found = ((data as RecentDriver[]) ?? []).find(
        (d) => d.driver_id === driverId,
      );
      setDriver(found ?? null);
    })();
  }, [driverId]);

  // Itinéraire + prix
  useEffect(() => {
    if (!origin || !dropoff || !driver) {
      setRoute(null);
      setPrice(null);
      return;
    }
    let stale = false;
    (async () => {
      setQuoting(true);
      setError(null);
      const r = await getRoute(origin.center, dropoff.center);
      if (stale) return;
      if (!r) {
        setError('Impossible de calculer l’itinéraire.');
        setQuoting(false);
        return;
      }
      setRoute(r);
      const q = await computePrice({
        pickup_lat: origin.center[1],
        pickup_lng: origin.center[0],
        dropoff_lat: dropoff.center[1],
        dropoff_lng: dropoff.center[0],
        distance_km: r.distance_km,
        duration_min: r.duration_min,
        p_category: driver.vehicle_category as VehicleCategory,
      });
      if (stale) return;
      setPrice(q?.price_total_fcfa ?? null);
      setQuoting(false);
    })();
    return () => {
      stale = true;
    };
  }, [origin, dropoff, driver]);

  async function send() {
    setError(null);
    if (!origin || !dropoff || !route) {
      return setError('Renseignez le trajet (départ et destination).');
    }
    setSending(true);
    const { error: err } = await supabaseBrowser.rpc('request_driver_oneshot', {
      p_driver_id: driverId,
      p_pickup_lat: origin.center[1],
      p_pickup_lng: origin.center[0],
      p_pickup_address: origin.place_name,
      p_dropoff_lat: dropoff.center[1],
      p_dropoff_lng: dropoff.center[0],
      p_dropoff_address: dropoff.place_name,
      p_distance_km: Number(route.distance_km.toFixed(2)),
      p_duration_min: route.duration_min,
    });
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push('/chauffeurs');
  }

  return (
    <main className="mx-auto max-w-md px-lg py-xl">
      <Link
        href="/chauffeurs"
        className="mb-md inline-flex items-center gap-xs text-xs font-semibold text-primary-600"
      >
        ← Mes chauffeurs
      </Link>

      <h1 className="text-xl font-extrabold text-neutral-900">
        Demander une course
      </h1>
      {driver ? (
        <p className="text-sm text-neutral-600">
          À <strong>{driver.driver_name}</strong>
          {driver.driver_rating != null && (
            <span className="text-amber-500"> · ★ {Number(driver.driver_rating).toFixed(1)}</span>
          )}{' '}
          ·{' '}
          <span className={driver.is_online ? 'text-emerald-600' : 'text-neutral-400'}>
            {driver.is_online ? 'en ligne' : 'hors ligne'}
          </span>
        </p>
      ) : (
        <p className="text-sm text-neutral-400">Chargement du chauffeur…</p>
      )}

      <section className="mt-lg space-y-md">
        <AddressAutocomplete
          label="Départ"
          placeholder="Votre position"
          value={origin}
          onChange={setOrigin}
          markerColor="#2563EB"
          showLocationButton
        />
        <AddressAutocomplete
          label="Destination"
          placeholder="Où allez-vous ?"
          value={dropoff}
          onChange={setDropoff}
          markerColor="#7C3AED"
        />
        {(origin || dropoff) && (
          <Map
            pickup={origin?.center ?? null}
            dropoff={dropoff?.center ?? null}
            route={route?.geometry ?? null}
            className="h-52 w-full rounded-xl bg-neutral-100 shadow-sm ring-1 ring-neutral-200"
          />
        )}
      </section>

      <section className="mt-lg rounded-2xl border border-neutral-200 bg-neutral-50 p-lg">
        {quoting ? (
          <p className="text-sm text-neutral-500">Calcul du prix…</p>
        ) : price != null && route ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-neutral-600">
                {route.distance_km.toFixed(1)} km · {route.duration_min} min
              </span>
              <span className="text-xl font-extrabold text-primary-700">
                {fmtFcfa(price)} FCFA
              </span>
            </div>
            <p className="mt-xs text-xs text-neutral-500">
              Prix indicatif. Le chauffeur doit accepter — sa réponse arrive sous
              10 min.
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            Renseignez le trajet pour voir le prix.
          </p>
        )}
      </section>

      {error && (
        <div className="mt-md rounded-md bg-error/10 p-md text-sm font-medium text-error">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={send}
        disabled={sending || quoting || price == null}
        className="mt-lg w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
      >
        {sending ? 'Envoi de la demande…' : 'Demander sa disponibilité'}
      </button>
      <p className="mt-md text-center text-[11px] text-neutral-400">
        La course reste sur TamCar : prix affiché, suivi en direct, paiement
        habituel. Aucun numéro n&apos;est partagé.
      </p>
    </main>
  );
}
