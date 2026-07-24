import Link from 'next/link';
import { PassIcon, CheckIcon, ClockIcon } from '@/components/Icon';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  cancelRequestAction,
  confirmPaymentAction,
  pauseSubscriptionAction,
  useJokerAction,
} from './actions';
import { AutoRefresh } from './AutoRefresh';

type SearchParams = { error?: string; ok?: string };

type PlanRow = {
  code: string;
  label: string;
  rides_total: number;
  validity_days: number;
  discount_pct: number;
  reports_per_month: number;
  pauses_max: number;
  is_flex: boolean;
};

type SubRow = {
  id: string;
  status: string;
  category: string;
  origin_address: string;
  dropoff_address: string;
  days_of_week: number[] | null;
  slot_out: string | null;
  slot_return: string | null;
  rides_total: number;
  rides_remaining: number;
  reports_used_month: number;
  reports_per_month: number;
  pauses_used: number;
  pauses_max: number;
  paused_until: string | null;
  total_price_fcfa: number;
  starts_on: string;
  expires_on: string;
  searching_until: string | null;
  payment_deadline: string | null;
  preferred_driver_name: string | null;
  preferred_driver_rating: number | null;
  subscription_plans: PlanRow | null;
};

type SubRideRow = {
  id: string;
  travel_date: string;
  direction: string;
  slot_time: string;
  status: string;
};

type PassListRow = {
  id: string;
  status: string;
  category: string;
  origin_address: string;
  dropoff_address: string;
  rides_total: number;
  rides_remaining: number;
  total_price_fcfa: number;
  starts_on: string;
  expires_on: string;
  created_at: string;
};

const PASS_STATUS: Record<string, { label: string; cls: string }> = {
  pending_driver: { label: 'Recherche', cls: 'bg-primary-50 text-primary-700' },
  awaiting_payment: { label: 'À confirmer', cls: 'bg-amber-50 text-amber-700' },
  active: { label: 'Actif', cls: 'bg-emerald-50 text-emerald-700' },
  paused: { label: 'En pause', cls: 'bg-neutral-100 text-neutral-600' },
  expired: { label: 'Expiré', cls: 'bg-neutral-100 text-neutral-500' },
  cancelled: { label: 'Annulé', cls: 'bg-neutral-100 text-neutral-500' },
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  planned: { label: 'Planifié', cls: 'bg-neutral-100 text-neutral-600' },
  generated: { label: 'Programmé', cls: 'bg-primary-50 text-primary-700' },
  completed: { label: 'Effectué', cls: 'bg-emerald-50 text-emerald-700' },
  missed: { label: 'Manqué', cls: 'bg-error/10 text-error' },
  reported: { label: 'Reporté (joker)', cls: 'bg-violet-500/10 text-violet-600' },
  recredited: { label: 'Recrédité', cls: 'bg-amber-50 text-amber-700' },
  cancelled: { label: 'Annulé', cls: 'bg-neutral-100 text-neutral-500' },
};

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function fmtTime(t: string): string {
  return t.slice(0, 5).replace(':', 'h');
}

function fmtFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/ /g, ' ');
}

export default async function TamPassPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createServerSupabase();

  const { data: subs } = await supabase
    .from('subscriptions')
    .select('*, subscription_plans(*)')
    .in('status', ['pending_driver', 'awaiting_payment', 'active', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1);

  const sub = (subs?.[0] as SubRow | undefined) ?? null;

  // Tous les pass du client (historique complet, tous statuts)
  const { data: allSubs } = await supabase
    .from('subscriptions')
    .select(
      'id, status, category, origin_address, dropoff_address, rides_total, rides_remaining, total_price_fcfa, starts_on, expires_on, created_at',
    )
    .order('created_at', { ascending: false });
  const passes = (allSubs as PassListRow[]) ?? [];

  let upcoming: SubRideRow[] = [];
  let missed: SubRideRow[] = [];
  if (sub) {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: up }, { data: mi }] = await Promise.all([
      supabase
        .from('subscription_rides')
        .select('id, travel_date, direction, slot_time, status')
        .eq('subscription_id', sub.id)
        .gte('travel_date', today)
        .order('travel_date')
        .order('slot_time')
        .limit(8),
      supabase
        .from('subscription_rides')
        .select('id, travel_date, direction, slot_time, status')
        .eq('subscription_id', sub.id)
        .eq('status', 'missed')
        .order('travel_date', { ascending: false })
        .limit(4),
    ]);
    upcoming = (up as SubRideRow[]) ?? [];
    missed = (mi as SubRideRow[]) ?? [];
  }


  const isWaiting =
    sub?.status === 'pending_driver' || sub?.status === 'awaiting_payment';

  return (
    <main className="mx-auto max-w-md px-lg py-xl">
      <AutoRefresh active={isWaiting} />
      <Link
        href="/"
        className="mb-md inline-flex items-center gap-xs text-xs font-semibold text-primary-600"
      >
        ← Accueil
      </Link>
      <header className="flex items-center gap-md">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-50 text-primary-500">
          <PassIcon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-extrabold text-neutral-900">TamPass</h1>
          <p className="text-xs text-neutral-500">
            Votre trajet quotidien, garanti et prépayé.
          </p>
        </div>
      </header>

      {searchParams.ok && (
        <div className="mt-md rounded-md bg-emerald-50 p-md text-sm font-medium text-emerald-700">
          {searchParams.ok}
        </div>
      )}
      {searchParams.error && (
        <div className="mt-md rounded-md bg-error/10 p-md text-sm font-medium text-error">
          {searchParams.error}
        </div>
      )}

      {sub && sub.status === 'pending_driver' ? (
        <>
          {/* Recherche du chauffeur en cours */}
          <section className="mt-lg rounded-2xl border-2 border-primary-200 bg-primary-50 p-lg">
            <div className="flex items-center gap-md">
              <span className="relative grid h-11 w-11 place-items-center rounded-full bg-primary-500 text-white">
                <ClockIcon className="h-5 w-5" />
                <span className="absolute inset-0 animate-ping rounded-full bg-primary-400 opacity-40" />
              </span>
              <div>
                <p className="font-bold text-neutral-900">
                  Recherche de votre chauffeur…
                </p>
                <p className="text-xs text-neutral-600">
                  Les chauffeurs proches sont notifiés (jusqu&apos;à 3 h). Vous
                  recevrez une notification dès qu&apos;un chauffeur accepte.
                </p>
              </div>
            </div>
            <p className="mt-md text-sm text-neutral-700">
              {sub.origin_address} → {sub.dropoff_address}
            </p>
            <p className="mt-xs text-xs text-neutral-500">
              {sub.rides_total} trajets ·{' '}
              {sub.slot_out ? `départ ${fmtTime(sub.slot_out)}` : ''}
              {sub.slot_return ? ` · retour ${fmtTime(sub.slot_return)}` : ''} ·{' '}
              {fmtFcfa(sub.total_price_fcfa)} FCFA à la confirmation
            </p>
            <form action={cancelRequestAction} className="mt-lg">
              <input type="hidden" name="subscription_id" value={sub.id} />
              <button
                type="submit"
                className="w-full rounded-xl border-2 border-neutral-300 bg-white py-md text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
              >
                Annuler la recherche
              </button>
            </form>
          </section>
        </>
      ) : sub && sub.status === 'awaiting_payment' ? (
        <>
          {/* Chauffeur trouvé — confirmation par paiement */}
          <section className="mt-lg rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-lg">
            <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">
              Chauffeur trouvé !
            </p>
            <p className="mt-sm text-lg font-extrabold text-neutral-900">
              {sub.preferred_driver_name ?? 'Votre chauffeur'}
              {sub.preferred_driver_rating != null && (
                <span className="ml-sm text-sm font-bold text-amber-500">
                  ★ {Number(sub.preferred_driver_rating).toFixed(1)}
                </span>
              )}
            </p>
            <p className="mt-xs text-sm text-neutral-600">
              {sub.origin_address} → {sub.dropoff_address}
            </p>
            <p className="mt-xs text-xs text-neutral-500">
              {sub.rides_total} trajets · confirmez avant le{' '}
              {sub.payment_deadline
                ? new Date(sub.payment_deadline).toLocaleString('fr-FR', {
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </p>
            <form action={confirmPaymentAction} className="mt-lg">
              <input type="hidden" name="subscription_id" value={sub.id} />
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
              >
                Confirmer et payer {fmtFcfa(sub.total_price_fcfa)} FCFA
              </button>
            </form>
            <form action={cancelRequestAction} className="mt-sm">
              <input type="hidden" name="subscription_id" value={sub.id} />
              <button
                type="submit"
                className="w-full rounded-xl border border-neutral-300 bg-white py-md text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
              >
                Refuser et annuler
              </button>
            </form>
            <p className="mt-sm text-center text-[11px] text-neutral-500">
              Paiement par wallet TamCar Crédit.{' '}
              <Link href="/wallet" className="underline">
                Recharger mon wallet
              </Link>
            </p>
          </section>
        </>
      ) : sub ? (
        <>
          {/* Carte du pass actif */}
          <section className="mt-lg overflow-hidden rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 p-lg text-white shadow-glow">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-bold uppercase tracking-wider opacity-90">
                {sub.subscription_plans?.label ?? 'Mon TamPass'}
              </p>
              <span className="rounded-full bg-white/15 px-md py-xs text-[11px] font-bold">
                {sub.status === 'paused'
                  ? `En pause jusqu'au ${sub.paused_until ? fmtDate(sub.paused_until) : '—'}`
                  : 'Actif'}
              </span>
            </div>
            <p className="mt-md text-3xl font-extrabold">
              {sub.rides_remaining}
              <span className="text-base font-semibold opacity-80">
                {' '}/ {sub.rides_total} trajets
              </span>
            </p>
            <div className="mt-sm h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white"
                style={{
                  width: `${Math.round((sub.rides_remaining / sub.rides_total) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-md text-xs opacity-90">
              {sub.origin_address} → {sub.dropoff_address}
            </p>
            <p className="mt-xs text-xs opacity-75">
              {sub.slot_out ? `Départ ${fmtTime(sub.slot_out)}` : 'Horaires libres'}
              {sub.slot_return ? ` · Retour ${fmtTime(sub.slot_return)}` : ''}
              {' · '}Expire le {fmtDate(sub.expires_on)}
            </p>
          </section>

          {/* Prochains trajets */}
          <section className="mt-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
              Prochains trajets
            </h2>
            <div className="mt-md space-y-sm">
              {upcoming.length === 0 && (
                <p className="rounded-xl bg-neutral-50 p-lg text-sm text-neutral-500">
                  Aucun trajet planifié pour l&apos;instant — la génération se
                  fait chaque soir pour le lendemain.
                </p>
              )}
              {upcoming.map((r) => {
                const badge = STATUS_LABELS[r.status] ?? STATUS_LABELS.planned;
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-md"
                  >
                    <div className="flex items-center gap-md">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-50 text-primary-500">
                        <ClockIcon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">
                          {fmtDate(r.travel_date)} · {fmtTime(r.slot_time)}
                        </p>
                        <p className="text-xs text-neutral-500 capitalize">
                          {r.direction}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-md py-xs text-[11px] font-bold ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Jokers sur trajets manqués */}
          {missed.length > 0 && (
            <section className="mt-xl">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
                Trajets manqués — utiliser un joker
              </h2>
              <p className="mt-xs text-xs text-neutral-500">
                {sub.reports_per_month} joker(s)/mois ·{' '}
                {sub.reports_used_month} utilisé(s) ce mois-ci
              </p>
              <div className="mt-md space-y-sm">
                {missed.map((r) => (
                  <form
                    key={r.id}
                    action={useJokerAction}
                    className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-md"
                  >
                    <input type="hidden" name="subscription_ride_id" value={r.id} />
                    <p className="text-sm text-neutral-700">
                      {fmtDate(r.travel_date)} · {fmtTime(r.slot_time)}
                    </p>
                    <button
                      type="submit"
                      className="rounded-lg bg-violet-500/10 px-md py-xs text-xs font-bold text-violet-600 hover:bg-violet-500/20"
                    >
                      Recréditer
                    </button>
                  </form>
                ))}
              </div>
            </section>
          )}

          {/* Actions */}
          <section className="mt-xl space-y-sm">
            {sub.status === 'active' &&
              sub.pauses_max > sub.pauses_used && (
                <form action={pauseSubscriptionAction}>
                  <input type="hidden" name="subscription_id" value={sub.id} />
                  <button
                    type="submit"
                    className="w-full rounded-xl border-2 border-neutral-300 bg-white py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                  >
                    Mettre en pause 1 semaine
                  </button>
                </form>
              )}
            <Link
              href="/tampass/nouveau"
              className="block w-full rounded-xl border-2 border-primary-500 bg-white py-md text-center text-sm font-bold text-primary-700 hover:bg-primary-50"
            >
              Acheter un autre pass
            </Link>
          </section>
        </>
      ) : (
        <>
          {/* Pitch + formules */}
          <section className="mt-lg rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 p-lg text-white">
            <p className="text-lg font-extrabold leading-snug">
              Votre trajet de tous les jours, au même créneau, avec votre
              chauffeur habituel.
            </p>
            <ul className="mt-md space-y-xs text-sm opacity-95">
              <li className="flex items-start gap-sm">
                <CheckIcon className="mt-0.5 h-4 w-4 flex-none" /> Créneau
                garanti — sinon trajet recrédité + 500 F offerts
              </li>
              <li className="flex items-start gap-sm">
                <CheckIcon className="mt-0.5 h-4 w-4 flex-none" /> Jusqu&apos;à
                15 % moins cher que les courses unitaires
              </li>
              <li className="flex items-start gap-sm">
                <CheckIcon className="mt-0.5 h-4 w-4 flex-none" /> Prépayé une
                fois, plus rien à penser
              </li>
            </ul>
          </section>

          <section className="mt-xl rounded-xl border border-neutral-200 bg-white p-lg">
            <p className="text-sm font-bold text-neutral-900">
              Vous définissez tout, la remise suit votre fréquence
            </p>
            <p className="mt-xs text-xs text-neutral-500">
              Trajet, jours, heures, durée — c&apos;est vous qui choisissez.
            </p>
            <div className="mt-md grid grid-cols-3 gap-sm text-center">
              <div className="rounded-lg bg-neutral-50 p-md">
                <p className="text-lg font-extrabold text-primary-600">−5 %</p>
                <p className="text-[11px] text-neutral-500">dès 10 trajets</p>
              </div>
              <div className="rounded-lg bg-neutral-50 p-md">
                <p className="text-lg font-extrabold text-primary-600">−10 %</p>
                <p className="text-[11px] text-neutral-500">dès 20 trajets</p>
              </div>
              <div className="rounded-lg bg-primary-50 p-md">
                <p className="text-lg font-extrabold text-primary-700">−15 %</p>
                <p className="text-[11px] text-neutral-600">dès 40 trajets</p>
              </div>
            </div>
          </section>

          <Link
            href="/tampass/nouveau"
            className="mt-xl flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
          >
            Créer mon TamPass
          </Link>
        </>
      )}

      {/* Tous mes pass — historique complet, chaque pass ouvre son détail */}
      {passes.length > 0 && (
        <section className="mt-2xl">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
            Tous mes pass
          </h2>
          <div className="mt-md space-y-sm">
            {passes.map((p) => {
              const b = PASS_STATUS[p.status] ?? PASS_STATUS.active;
              return (
                <Link
                  key={p.id}
                  href={`/tampass/${p.id}`}
                  className="block rounded-xl border border-neutral-200 bg-white p-md transition hover:border-primary-300 hover:shadow-sm"
                >
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-bold text-neutral-900 capitalize">
                      {p.category}
                      <span className="ml-sm text-xs font-normal text-neutral-400">
                        {fmtDate(p.created_at.slice(0, 10))}
                      </span>
                    </p>
                    <span className={`rounded-full px-md py-xs text-[11px] font-bold ${b.cls}`}>
                      {b.label}
                    </span>
                  </div>
                  <p className="mt-xs truncate text-xs text-neutral-600">
                    {p.origin_address} → {p.dropoff_address}
                  </p>
                  <p className="mt-xs text-xs text-neutral-500">
                    {p.rides_remaining}/{p.rides_total} trajets ·{' '}
                    {fmtFcfa(p.total_price_fcfa)} FCFA · voir le détail →
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
