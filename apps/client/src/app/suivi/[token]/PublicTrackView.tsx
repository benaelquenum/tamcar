'use client';

import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { Map } from '@/components/Map';
import { supabaseBrowser } from '@/lib/supabase-browser';

export type PublicTrackRow = {
  status: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_km: number | null;
  duration_min: number | null;
  requested_category: string | null;
  passenger_display: string | null;
  driver_first_name: string | null;
  driver_rating_avg: number | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  driver_lat: number | null;
  driver_lng: number | null;
  matched_at: string | null;
  started_at: string | null;
  ended_at: string | null;
};

const STATUS_META: Record<string, { label: string; sub: string; color: string }> = {
  requested: { label: 'Recherche d’un chauffeur…', sub: 'TamCar cherche un chauffeur proche.', color: 'bg-primary-500' },
  scheduled: { label: 'Course programmée', sub: 'Le départ est prévu plus tard.', color: 'bg-violet-500' },
  matched: { label: 'Chauffeur en route', sub: 'Le chauffeur se dirige vers le point de départ.', color: 'bg-primary-500' },
  arrived: { label: 'Le chauffeur est arrivé', sub: 'Il attend au point de rendez-vous.', color: 'bg-primary-700' },
  in_progress: { label: 'En course', sub: 'Trajet en cours vers la destination.', color: 'bg-success' },
  completed: { label: 'Course terminée', sub: 'Arrivée à destination.', color: 'bg-success' },
  expired: { label: 'Recherche expirée', sub: 'Aucun chauffeur trouvé.', color: 'bg-neutral-600' },
};

function statusMeta(status: string) {
  if (status.startsWith('cancelled')) {
    return { label: 'Course annulée', sub: '', color: 'bg-neutral-600' };
  }
  return STATUS_META[status] ?? { label: status, sub: '', color: 'bg-neutral-600' };
}

export function PublicTrackView({
  token,
  initial,
}: {
  token: string;
  initial: PublicTrackRow | null;
}) {
  const [row, setRow] = useState<PublicTrackRow | null>(initial);
  const [gone, setGone] = useState(initial === null);

  // Poll toutes les 5 s : statut + position live du chauffeur.
  useEffect(() => {
    if (gone) return;
    const t = setInterval(async () => {
      const { data } = await supabaseBrowser.rpc('public_ride_track', { p_token: token });
      const next = (Array.isArray(data) ? data[0] : null) as PublicTrackRow | null;
      if (next) setRow(next);
      else setGone(true);
    }, 5000);
    return () => clearInterval(t);
  }, [token, gone]);

  if (gone || !row) {
    return (
      <main className="grid min-h-dvh place-items-center bg-neutral-50 p-lg">
        <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-xl text-center shadow-md">
          <Logo className="mx-auto h-8 w-auto" />
          <h1 className="mt-lg text-lg font-extrabold text-neutral-900">
            Lien invalide ou expiré
          </h1>
          <p className="mt-sm text-sm text-neutral-600">
            Ce lien de suivi n’est plus actif. Demandez un nouveau lien à la personne
            qui a commandé la course.
          </p>
        </div>
      </main>
    );
  }

  const meta = statusMeta(row.status);
  const active = ['matched', 'arrived', 'in_progress'].includes(row.status);
  const driverPin =
    active && row.driver_lat != null && row.driver_lng != null
      ? { driver_id: 'live', lat: row.driver_lat, lng: row.driver_lng, category: row.requested_category ?? undefined }
      : null;

  return (
    <main className="relative flex min-h-dvh flex-col bg-neutral-50">
      {/* Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center p-md">
        <div className="pointer-events-auto flex items-center gap-sm rounded-full bg-white px-lg py-sm shadow-lg ring-1 ring-neutral-200">
          <Logo className="h-6 w-auto" />
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Suivi de course
          </span>
        </div>
      </header>

      {/* Carte */}
      <div className="h-[52dvh] w-full">
        <Map
          pickup={[row.pickup_lng, row.pickup_lat]}
          dropoff={[row.dropoff_lng, row.dropoff_lat]}
          assignedDriver={driverPin}
          className="h-full w-full"
          frameKey={row.status}
        />
      </div>

      {/* Infos */}
      <div className="relative z-10 mx-auto -mt-6 w-full max-w-md flex-1 rounded-t-2xl bg-white p-lg shadow-2xl ring-1 ring-neutral-200">
        <div className={`rounded-xl p-md text-white ${meta.color}`}>
          <p className="text-lg font-extrabold leading-tight">{meta.label}</p>
          {meta.sub && <p className="text-xs text-white/90">{meta.sub}</p>}
          {row.passenger_display && (
            <p className="mt-xs inline-flex items-center rounded-full bg-white/20 px-sm py-0.5 text-[11px] font-bold">
              Course de {row.passenger_display}
            </p>
          )}
        </div>

        {row.driver_first_name && (
          <div className="mt-md rounded-xl border border-neutral-200 p-md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Chauffeur
            </p>
            <p className="text-sm font-extrabold text-neutral-900">
              {row.driver_first_name}
              {row.driver_rating_avg != null && (
                <span className="ml-xs text-xs font-semibold text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ★ {Number(row.driver_rating_avg).toFixed(1)}
                </span>
              )}
            </p>
            {(row.vehicle_brand || row.vehicle_plate) && (
              <p className="mt-xs text-xs text-neutral-600">
                {[row.vehicle_brand, row.vehicle_model].filter(Boolean).join(' ')}
                {row.vehicle_color ? ` · ${row.vehicle_color}` : ''}
                {row.vehicle_plate ? ` · ${row.vehicle_plate}` : ''}
              </p>
            )}
          </div>
        )}

        <div className="mt-md space-y-sm rounded-xl border border-neutral-200 p-md text-sm">
          <div className="flex items-start gap-sm">
            <span className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-success" />
            <p className="min-w-0 flex-1 text-neutral-800">{row.pickup_address}</p>
          </div>
          <div className="flex items-start gap-sm">
            <span className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-error" />
            <p className="min-w-0 flex-1 text-neutral-800">{row.dropoff_address}</p>
          </div>
          {(row.distance_km != null || row.duration_min != null) && (
            <p className="text-[11px] text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {row.distance_km != null ? `${row.distance_km} km` : ''}
              {row.distance_km != null && row.duration_min != null ? ' · ' : ''}
              {row.duration_min != null ? `~${row.duration_min} min` : ''}
            </p>
          )}
        </div>

        <a
          href="/"
          className="mt-lg block rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-center text-sm font-bold text-white shadow-glow"
        >
          Commander ma course avec TamCar
        </a>
      </div>
    </main>
  );
}
