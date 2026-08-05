import Link from 'next/link';
import {
  ArrowRightIcon,
  CarIcon,
  CheckIcon,
  CoinsIcon,
  PinIcon,
  UsersIcon,
} from '@/components/Icon';
import { createServerSupabase } from '@/lib/supabase-server';
import { DailyChart } from './DailyChart';
import {
  dayLabel,
  fmt,
  monthLabel,
  parseMonthParam,
  shiftMonth,
  toMonthParam,
  type OpsDailyRow,
  type OpsDashboardRow,
  type OpsMonthRow,
} from './lib';

export const dynamic = 'force-dynamic';

export default async function OpsPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  const month = parseMonthParam(searchParams?.m);
  const supabase = createServerSupabase();

  const [dashRes, dailyRes, monthsRes] = await Promise.all([
    supabase.rpc('ops_my_dashboard', { p_month: month }),
    supabase.rpc('ops_my_daily', { p_month: month }),
    supabase.rpc('ops_my_months', { p_count: 6 }),
  ]);

  const cities = (dashRes.data ?? []) as OpsDashboardRow[];
  const daily = (dailyRes.data ?? []) as OpsDailyRow[];
  const months = (monthsRes.data ?? []) as OpsMonthRow[];

  const currentMonth = parseMonthParam(undefined);
  const isCurrent = month === currentMonth;
  const prev = toMonthParam(shiftMonth(month, -1));
  const next = toMonthParam(shiftMonth(month, 1));

  return (
    <div>
      {/* Sélecteur de mois */}
      <div className="mb-lg flex items-center justify-between gap-md">
        <Link
          href={`/ops?m=${prev}`}
          className="rounded-lg border border-neutral-200 bg-white px-md py-sm text-xs font-bold text-neutral-600 transition hover:text-primary-700"
        >
          &larr; {monthLabel(shiftMonth(month, -1))}
        </Link>
        <h1 className="text-center text-sm font-extrabold capitalize text-neutral-900">
          {monthLabel(month)}
        </h1>
        {isCurrent ? (
          <span className="rounded-lg border border-transparent px-md py-sm text-xs font-bold text-neutral-400">
            en cours
          </span>
        ) : (
          <Link
            href={`/ops?m=${next}`}
            className="rounded-lg border border-neutral-200 bg-white px-md py-sm text-xs font-bold text-neutral-600 transition hover:text-primary-700"
          >
            {monthLabel(shiftMonth(month, 1))} &rarr;
          </Link>
        )}
      </div>

      {cities.length === 0 && (
        <div className="rounded-xl bg-white p-2xl text-center shadow-sm">
          <p className="text-sm font-bold text-neutral-900">Aucune ville sur ce mois</p>
          <p className="mt-xs text-xs text-neutral-600">
            Vous n&apos;étiez pas responsable opérations d&apos;une ville en {monthLabel(month)}.
          </p>
        </div>
      )}

      {cities.map((c) => {
        const cityDaily = daily.filter((d) => d.city === c.city);
        const cityMonths = months.filter((m) => m.city === c.city && m.month_start !== month);
        const activeDays = cityDaily.filter((d) => Number(d.rides_count) > 0);

        return (
          <section key={c.city} className="mb-2xl">
            {/* Carte principale : rémunération du mois */}
            <div className="rounded-2xl bg-primary-700 p-lg text-white shadow-lg">
              <div className="flex items-center gap-xs text-white/80">
                <PinIcon className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">{c.city}</span>
                {c.ended_on && (
                  <span className="rounded-full bg-white/20 px-sm py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    mandat clos
                  </span>
                )}
              </div>

              <p className="mt-md text-[11px] uppercase tracking-wider text-white/70">
                Votre rémunération du mois
              </p>
              <p
                className="text-4xl font-extrabold leading-tight"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {fmt(c.pay_fcfa)} <span className="text-2xl">F</span>
              </p>
              <p className="text-[11px] text-white/70">
                {Number(c.rate_pct)} % du volume · plafond {fmt(c.monthly_cap_fcfa)} F / mois
              </p>

              {/* Barre de progression vers le plafond */}
              <div
                className="mt-md h-2.5 w-full overflow-hidden rounded-full bg-white/25"
                role="progressbar"
                aria-valuenow={Number(c.cap_progress_pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progression vers le plafond de ${fmt(c.monthly_cap_fcfa)} francs`}
              >
                <div
                  className={`h-full rounded-full ${c.cap_reached ? 'bg-gold' : 'bg-white'}`}
                  style={{ width: `${Math.min(100, Number(c.cap_progress_pct))}%` }}
                />
              </div>

              <div className="mt-xs flex items-baseline justify-between text-[11px]">
                {c.cap_reached ? (
                  <span className="inline-flex items-center gap-xs font-bold text-gold">
                    <CheckIcon className="h-3.5 w-3.5" />
                    Plafond atteint
                  </span>
                ) : (
                  <span className="text-white/80" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    Il reste {fmt(c.monthly_cap_fcfa - c.pay_fcfa)} F avant le plafond
                  </span>
                )}
                <span
                  className="font-bold text-white/90"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {Number(c.cap_progress_pct)} %
                </span>
              </div>

              {c.cap_reached && Number(c.gross_pay_fcfa) > Number(c.pay_fcfa) && (
                <p className="mt-sm text-[11px] text-white/70">
                  Sans plafond, ce mois représenterait {fmt(c.gross_pay_fcfa)} F.
                </p>
              )}
            </div>

            <p className="mt-sm px-xs text-[11px] text-neutral-600">
              {c.settled ? (
                <>
                  Ce mois vous a été <strong className="text-success">réglé</strong>.
                </>
              ) : (
                <>Montant calculé, en attente de règlement.</>
              )}
            </p>

            {/* Indicateurs de la ville */}
            <div className="mt-lg grid grid-cols-3 gap-sm">
              <Stat
                icon={<CoinsIcon className="h-4 w-4" />}
                label="Volume courses"
                value={`${fmt(c.volume_fcfa)} F`}
              />
              <Stat
                icon={<CarIcon className="h-4 w-4" />}
                label="Courses"
                value={fmt(c.rides_count)}
              />
              <Stat
                icon={<UsersIcon className="h-4 w-4" />}
                label="Chauffeurs actifs"
                value={fmt(c.active_drivers)}
              />
            </div>

            {/* Détail jour par jour */}
            {cityDaily.length > 0 && (
              <div className="mt-lg rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
                <DailyChart rows={cityDaily} />

                <details className="mt-lg">
                  <summary className="cursor-pointer text-xs font-bold text-primary-700">
                    Détail jour par jour ({activeDays.length} jour
                    {activeDays.length > 1 ? 's' : ''} avec courses)
                  </summary>
                  <div className="mt-md overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-neutral-200 text-left text-neutral-600">
                          <th className="py-sm font-semibold">Jour</th>
                          <th className="py-sm text-right font-semibold">Courses</th>
                          <th className="py-sm text-right font-semibold">Volume</th>
                          <th className="py-sm text-right font-semibold">Votre part</th>
                        </tr>
                      </thead>
                      <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {cityDaily.map((d) => (
                          <tr key={d.day} className="border-b border-neutral-100">
                            <td className="py-sm text-neutral-900">{dayLabel(d.day)}</td>
                            <td className="py-sm text-right text-neutral-600">
                              {fmt(d.rides_count)}
                            </td>
                            <td className="py-sm text-right text-neutral-600">
                              {fmt(d.volume_fcfa)} F
                            </td>
                            <td className="py-sm text-right font-bold text-neutral-900">
                              {fmt(d.pay_fcfa)} F
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}

            {/* Historique */}
            {cityMonths.length > 0 && (
              <div className="mt-lg">
                <h2 className="mb-sm text-xs font-bold uppercase tracking-wider text-neutral-600">
                  Mois précédents
                </h2>
                <ul className="space-y-sm">
                  {cityMonths.map((m) => (
                    <li key={m.month_start}>
                      <Link
                        href={`/ops?m=${toMonthParam(m.month_start)}`}
                        className="flex items-center justify-between gap-md rounded-xl border border-neutral-200 bg-white p-md shadow-sm transition hover:border-primary-300"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold capitalize text-neutral-900">
                            {monthLabel(m.month_start)}
                          </p>
                          <p
                            className="text-[11px] text-neutral-600"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {fmt(m.rides_count)} courses · {fmt(m.volume_fcfa)} F de volume
                            {m.cap_reached && ' · plafond atteint'}
                            {m.settled && ' · réglé'}
                          </p>
                        </div>
                        <div className="flex flex-none items-center gap-xs">
                          <span
                            className="text-sm font-extrabold text-neutral-900"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {fmt(m.pay_fcfa)} F
                          </span>
                          <ArrowRightIcon className="h-4 w-4 text-neutral-400" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}

      <p className="mt-xl rounded-md bg-neutral-100 p-md text-[11px] leading-relaxed text-neutral-600">
        Le volume correspond au <strong>prix total des courses terminées</strong> dont le point de
        départ se situe dans votre ville (une course Cotonou &rarr; Porto-Novo compte pour Cotonou).
        Les montants sont mis à jour en direct à chaque course terminée. La rémunération affichée
        est <strong>calculée</strong> : elle vous est réglée séparément, hors application.
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-md text-center shadow-sm">
      <div className="flex justify-center text-primary-500">{icon}</div>
      <p
        className="mt-xs text-base font-extrabold leading-tight text-neutral-900"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
      <p className="text-[10px] leading-tight text-neutral-600">{label}</p>
    </div>
  );
}
