'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { computePrice, type PriceQuote, type VehicleCategory } from '@/lib/pricing';
import { CalendarIcon, CheckIcon, PinIcon } from '@/components/Icon';

type Ride = {
  id: string;
  scheduled_at: string;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_km: number;
  duration_min: number;
  price_total_fcfa: number;
  requested_category: VehicleCategory;
  driver_confirmed: boolean;
};

const CATEGORIES: { id: VehicleCategory; name: string; tagline: string }[] = [
  { id: 'moto', name: 'Moto', tagline: 'Rapide, éco, zémidjan formalisé' },
  { id: 'tricycle', name: 'Tricycle', tagline: 'Kloboto confortable à petit prix' },
  { id: 'essentiel', name: 'Essentiel', tagline: 'Voiture basique, fonctionnelle' },
  { id: 'confort', name: 'Confort', tagline: 'Voiture confortable, bien entretenue' },
  { id: 'premium', name: 'VIP', tagline: 'Voiture de prestige, confort premium' },
];

function fmtFcfa(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ReservationActions({ ride }: { ride: Ride }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, PriceQuote | null>>({});

  // Un chauffeur peut s'engager pendant que l'écran est ouvert : on
  // rafraîchit régulièrement pour que la page bascule d'elle-même.
  useEffect(() => {
    if (ride.driver_confirmed) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [router, ride.driver_confirmed]);

  // Tarifs des autres catégories, calculés à l'ouverture de la liste.
  useEffect(() => {
    if (!showCategories) return;
    let cancelled = false;
    (async () => {
      const others = CATEGORIES.filter((c) => c.id !== ride.requested_category);
      const results = await Promise.all(
        others.map((c) =>
          computePrice({
            pickup_lat: ride.pickup_lat,
            pickup_lng: ride.pickup_lng,
            dropoff_lat: ride.dropoff_lat,
            dropoff_lng: ride.dropoff_lng,
            distance_km: ride.distance_km,
            duration_min: ride.duration_min,
            p_category: c.id,
          }),
        ),
      );
      if (cancelled) return;
      const byId: Record<string, PriceQuote | null> = {};
      others.forEach((c, i) => { byId[c.id] = results[i]; });
      setQuotes(byId);
    })();
    return () => { cancelled = true; };
  }, [showCategories, ride]);

  async function handleContinue() {
    setBusy('continue');
    setError(null);
    setNotice(null);
    const { error: err } = await supabaseBrowser.rpc('scheduled_search_continue', {
      p_ride_id: ride.id,
    });
    setBusy(null);
    if (err) { setError(err.message); return; }
    setNotice('Recherche relancée — les chauffeurs autour du départ viennent d’être alertés.');
    router.refresh();
  }

  async function handleSwitch(category: VehicleCategory) {
    setBusy(category);
    setError(null);
    setNotice(null);
    const { error: err } = await supabaseBrowser.rpc('client_switch_category', {
      p_ride_id: ride.id,
      p_new_category: category,
    });
    setBusy(null);
    if (err) { setError(err.message); return; }
    setShowCategories(false);
    setNotice('Catégorie modifiée — la recherche repart sur les chauffeurs concernés.');
    router.refresh();
  }

  async function handleCancel() {
    if (!confirm('Annuler définitivement cette réservation ? C’est gratuit.')) return;
    setBusy('cancel');
    setError(null);
    const { error: err } = await supabaseBrowser.rpc('cancel_scheduled_ride', {
      p_ride_id: ride.id,
    });
    setBusy(null);
    if (err) { setError(err.message); return; }
    router.push('/history');
  }

  const catName =
    CATEGORIES.find((c) => c.id === ride.requested_category)?.name ??
    ride.requested_category;

  return (
    <>
      <h1 className="mt-lg text-2xl font-extrabold text-neutral-900">
        {ride.driver_confirmed ? 'Réservation confirmée' : 'Recherche d’un chauffeur'}
      </h1>

      <section className="mt-lg rounded-xl bg-white p-md shadow-sm ring-1 ring-violet-500/30">
        <p className="flex items-center gap-xs text-sm font-bold text-violet-700">
          <CalendarIcon className="h-4 w-4" />
          {fmtDate(ride.scheduled_at)}
        </p>
        <div className="mt-md space-y-xs">
          <div className="flex items-start gap-xs">
            <span className="mt-xs grid h-4 w-4 flex-none place-items-center rounded-full bg-primary-500 text-white">
              <PinIcon className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <p className="flex-1 text-xs text-neutral-900">{ride.pickup_address}</p>
          </div>
          <div className="ml-1.5 h-3 border-l-2 border-dashed border-neutral-300" />
          <div className="flex items-start gap-xs">
            <span className="mt-xs grid h-4 w-4 flex-none place-items-center rounded-full bg-violet-500 text-white">
              <PinIcon className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <p className="flex-1 text-xs text-neutral-900">{ride.dropoff_address}</p>
          </div>
        </div>
        <div className="mt-md flex items-baseline justify-between border-t border-neutral-100 pt-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            {catName}
          </span>
          <span
            className="text-lg font-extrabold text-neutral-900"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {fmtFcfa(ride.price_total_fcfa)} FCFA
          </span>
        </div>
      </section>

      {ride.driver_confirmed ? (
        <div className="mt-lg rounded-xl bg-primary-500 p-md text-white shadow-glow">
          <p className="flex items-center gap-xs text-sm font-bold">
            <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />
            Un chauffeur est engagé
          </p>
          <p className="mt-xs text-xs">
            Votre course est confirmée. Vous serez rappelé 30, 20 et 10 minutes avant
            le départ.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-lg rounded-xl bg-neutral-100 p-md">
            <p className="flex items-center gap-xs text-sm font-bold text-neutral-900">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
              Aucun chauffeur pour l&apos;instant
            </p>
            <p className="mt-xs text-xs text-neutral-600">
              Personne n&apos;a encore pris votre réservation. Vous décidez de la suite —
              l&apos;annulation reste gratuite.
            </p>
          </div>

          {notice && (
            <p className="mt-md rounded-lg bg-success/10 p-sm text-xs font-semibold text-success">
              {notice}
            </p>
          )}
          {error && (
            <p className="mt-md rounded-lg bg-error/10 p-sm text-xs font-semibold text-error">
              {error}
            </p>
          )}

          <div className="mt-lg space-y-sm">
            <button
              type="button"
              onClick={handleContinue}
              disabled={busy !== null}
              className="w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {busy === 'continue' ? 'Relance…' : 'Continuer la recherche'}
            </button>

            <button
              type="button"
              onClick={() => setShowCategories((v) => !v)}
              disabled={busy !== null}
              className="w-full rounded-xl border-2 border-primary-500 bg-white py-md text-sm font-bold text-primary-700 transition hover:bg-primary-50 disabled:opacity-50"
            >
              {showCategories ? 'Masquer les autres catégories' : 'Chercher une alternative'}
            </button>

            {showCategories && (
              <ul className="space-y-xs">
                {CATEGORIES.filter((c) => c.id !== ride.requested_category).map((c) => {
                  const q = quotes[c.id];
                  const delta = q ? q.price_total_fcfa - ride.price_total_fcfa : null;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => handleSwitch(c.id)}
                        disabled={busy !== null || !q}
                        className="flex w-full items-center justify-between gap-md rounded-xl border border-neutral-200 bg-white p-md text-left transition hover:border-primary-300 disabled:opacity-50"
                      >
                        <span className="flex-1">
                          <span className="block text-sm font-bold text-neutral-900">{c.name}</span>
                          <span className="block text-[11px] text-neutral-500">{c.tagline}</span>
                        </span>
                        <span className="text-right">
                          <span
                            className="block text-sm font-extrabold text-neutral-900"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {busy === c.id ? '…' : `${fmtFcfa(q?.price_total_fcfa)} F`}
                          </span>
                          {delta != null && delta !== 0 && (
                            <span
                              className={`block text-[10px] font-semibold ${
                                delta < 0 ? 'text-success' : 'text-neutral-500'
                              }`}
                              style={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                              {delta < 0 ? '−' : '+'}
                              {fmtFcfa(Math.abs(delta))} F
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <button
              type="button"
              onClick={handleCancel}
              disabled={busy !== null}
              className="w-full rounded-xl bg-neutral-100 py-md text-sm font-bold text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-50"
            >
              {busy === 'cancel' ? 'Annulation…' : 'Annuler la réservation'}
            </button>
          </div>
        </>
      )}

      <div className="h-2xl" />
    </>
  );
}
