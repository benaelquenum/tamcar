'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { VehicleCategory } from '@/lib/pricing';
import { CalendarIcon, CheckIcon, PinIcon, UserIcon } from '@/components/Icon';

type Ride = {
  id: string;
  scheduled_at: string;
  pickup_address: string;
  dropoff_address: string;
  price_total_fcfa: number;
  requested_category: VehicleCategory;
  driver_confirmed: boolean;
  driver_search_started_at: string | null;
  driver_search_prompted_at: string | null;
};

type Alternative = {
  category: VehicleCategory;
  new_price_fcfa: number;
  delta_fcfa: number;
  drivers_online_nearby: number;
};

const CAT_LABEL: Record<string, string> = {
  moto: 'Moto',
  tricycle: 'Tricycle',
  essentiel: 'Essentiel',
  confort: 'Confort',
  premium: 'VIP',
};

/** Délai au bout duquel on rend la main au client (aligné sur le cron). */
const SEARCH_GRACE_MS = 60_000;

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
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null);

  // La recherche a-t-elle assez duré pour qu'on propose les options ?
  // Deux sources : le marqueur posé par le cron, et l'horloge locale —
  // l'écran ne doit pas attendre le tick suivant pour réagir.
  const searchStartedAt = ride.driver_search_started_at
    ? new Date(ride.driver_search_started_at).getTime()
    : null;
  const [graceElapsed, setGraceElapsed] = useState(
    () => searchStartedAt != null && Date.now() - searchStartedAt >= SEARCH_GRACE_MS,
  );

  useEffect(() => {
    if (ride.driver_confirmed || searchStartedAt == null) return;
    const remaining = searchStartedAt + SEARCH_GRACE_MS - Date.now();
    if (remaining <= 0) {
      setGraceElapsed(true);
      return;
    }
    setGraceElapsed(false);
    const t = setTimeout(() => setGraceElapsed(true), remaining);
    return () => clearTimeout(t);
  }, [searchStartedAt, ride.driver_confirmed]);

  const decisionTime =
    !ride.driver_confirmed && (graceElapsed || ride.driver_search_prompted_at != null);

  // Un chauffeur peut s'engager pendant que l'écran est ouvert : la page
  // bascule d'elle-même sur la course confirmée.
  useEffect(() => {
    if (ride.driver_confirmed) return;
    const t = setInterval(() => router.refresh(), 8_000);
    return () => clearInterval(t);
  }, [router, ride.driver_confirmed]);

  const loadAlternatives = useCallback(async () => {
    const { data } = await supabaseBrowser.rpc('preview_alternative_offers', {
      p_ride_id: ride.id,
    });
    setAlternatives(Array.isArray(data) ? (data as Alternative[]) : []);
  }, [ride.id]);

  useEffect(() => {
    if (showAlternatives && alternatives === null) void loadAlternatives();
  }, [showAlternatives, alternatives, loadAlternatives]);

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
    setAlternatives(null);
    setShowAlternatives(false);
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
    setShowAlternatives(false);
    setAlternatives(null);
    setNotice(`Catégorie ${CAT_LABEL[category] ?? category} — la recherche repart sur les chauffeurs concernés.`);
    router.refresh();
  }

  async function handleCancel() {
    if (!confirm('Annuler définitivement cette réservation ? C’est gratuit jusqu’à 10 minutes avant le départ.')) {
      return;
    }
    setBusy('cancel');
    setError(null);
    const { error: err } = await supabaseBrowser.rpc('cancel_scheduled_ride', {
      p_ride_id: ride.id,
    });
    setBusy(null);
    if (err) { setError(err.message); return; }
    router.push('/history');
  }

  const catName = CAT_LABEL[ride.requested_category] ?? ride.requested_category;

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
        <>
          <div className="mt-lg rounded-xl bg-primary-500 p-md text-white shadow-glow">
            <p className="flex items-center gap-xs text-sm font-bold">
              <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />
              Un chauffeur est engagé
            </p>
            <p className="mt-xs text-xs">
              Vous serez rappelé 30, 20, 10 et 5 minutes avant le départ. L’annulation
              reste gratuite jusqu’à 10 minutes avant, puis coûte 200 FCFA.
            </p>
          </div>
          <Link
            href={`/ride/${ride.id}`}
            className="mt-md flex w-full items-center justify-center gap-xs rounded-xl border-2 border-primary-500 bg-white py-md text-sm font-bold text-primary-700 transition hover:bg-primary-50"
          >
            <UserIcon className="h-4 w-4" />
            Voir le chauffeur et le détail de la course
          </Link>
        </>
      ) : (
        <>
          <div className="mt-lg rounded-xl bg-neutral-100 p-md">
            <p className="flex items-center gap-xs text-sm font-bold text-neutral-900">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
              {decisionTime ? 'Aucun chauffeur pour l’instant' : 'Recherche en cours…'}
            </p>
            <p className="mt-xs text-xs text-neutral-600">
              {decisionTime
                ? 'Personne n’a encore pris votre réservation. Vous décidez de la suite — l’annulation reste gratuite.'
                : 'Les chauffeurs disponibles à moins de 12 km du départ ont été alertés. Vous êtes prévenu dès que l’un d’eux s’engage.'}
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

          {decisionTime && (
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
                onClick={() => setShowAlternatives((v) => !v)}
                disabled={busy !== null}
                className="w-full rounded-xl border-2 border-primary-500 bg-white py-md text-sm font-bold text-primary-700 transition hover:bg-primary-50 disabled:opacity-50"
              >
                {showAlternatives ? 'Masquer les alternatives' : 'Voir une alternative'}
              </button>

              {showAlternatives && (
                <ul className="space-y-xs">
                  {alternatives === null && (
                    <li className="rounded-xl bg-neutral-100 p-md text-center text-xs text-neutral-600">
                      Calcul des alternatives…
                    </li>
                  )}
                  {alternatives?.length === 0 && (
                    <li className="rounded-xl bg-neutral-100 p-md text-center text-xs text-neutral-600">
                      Aucune autre catégorie disponible sur ce trajet.
                    </li>
                  )}
                  {alternatives?.map((a) => (
                    <li key={a.category}>
                      <button
                        type="button"
                        onClick={() => handleSwitch(a.category)}
                        disabled={busy !== null}
                        className="flex w-full items-center justify-between gap-md rounded-xl border border-neutral-200 bg-white p-md text-left transition hover:border-primary-300 disabled:opacity-50"
                      >
                        <span className="flex-1">
                          <span className="block text-sm font-bold text-neutral-900">
                            {CAT_LABEL[a.category] ?? a.category}
                          </span>
                          <span
                            className={`block text-[11px] font-semibold ${
                              a.drivers_online_nearby > 0 ? 'text-success' : 'text-neutral-500'
                            }`}
                          >
                            {a.drivers_online_nearby === 0
                              ? 'Aucun chauffeur en ligne autour'
                              : `${a.drivers_online_nearby} chauffeur${a.drivers_online_nearby > 1 ? 's' : ''} autour`}
                          </span>
                        </span>
                        <span className="text-right">
                          <span
                            className="block text-sm font-extrabold text-neutral-900"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {busy === a.category ? '…' : `${fmtFcfa(a.new_price_fcfa)} F`}
                          </span>
                          {a.delta_fcfa !== 0 && (
                            <span
                              className={`block text-[10px] font-semibold ${
                                a.delta_fcfa < 0 ? 'text-success' : 'text-neutral-500'
                              }`}
                              style={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                              {a.delta_fcfa < 0 ? '−' : '+'}
                              {fmtFcfa(Math.abs(a.delta_fcfa))} F
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
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
          )}
        </>
      )}

      <div className="h-2xl" />
    </>
  );
}
