import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { BannerCarousel, type BannerItem } from '@/components/BannerCarousel';
import { AlertTriangleIcon } from '@/components/Icon';
import { LiveAmount } from './LiveAmount';
import { LiveRefresh } from './LiveRefresh';
import {
  CAT_LABEL,
  VEHICLE_STATUS_LABEL,
  ago,
  fmt,
  monthLabel,
  previewParam,
  previousMonth,
  type DealerDay,
  type DealerPayout,
  type DealerRecent,
  type DealerSummary,
  type DealerVehicle,
} from './lib';

export const dynamic = 'force-dynamic';

export default async function DealerDashboard({
  searchParams,
}: {
  searchParams: { as?: string | string[] };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  const supabase = createServerSupabase();

  const preview = previewParam(searchParams.as);
  const who = { p_dealer_id: preview };

  const [{ data: sData }, { data: vData }, { data: dData }, { data: rData }, { data: pData }, { data: bannerRows }] =
    await Promise.all([
      supabase.rpc('dealer_my_summary', who),
      supabase.rpc('dealer_my_vehicles', who),
      supabase.rpc('dealer_my_daily', who),
      supabase.rpc('dealer_my_recent', { ...who, p_limit: 8 }),
      supabase.rpc('dealer_my_payouts', { ...who, p_limit: 5 }),
      supabase
        .from('home_banners')
        .select('id, title, subtitle, image_url, link_url, cta_text, gradient')
        .eq('is_active', true)
        .eq('audience', 'dealer')
        .order('display_order', { ascending: true })
        .limit(6),
    ]);

  const s = ((sData ?? []) as DealerSummary[])[0];
  if (!s) {
    return (
      <div className="rounded-xl bg-white p-lg shadow-sm">
        <p className="text-sm text-neutral-700">
          {profile.role === 'admin'
            ? 'Choisissez un partenaire dans Admin, Partenaires véhicule, puis « Voir son espace ».'
            : 'Aucun profil partenaire véhicule trouvé. Contactez TamCar pour l’activation.'}
        </p>
      </div>
    );
  }

  const vehicles = (vData ?? []) as DealerVehicle[];
  const days = (dData ?? []) as DealerDay[];
  const recent = (rData ?? []) as DealerRecent[];
  const payouts = (pData ?? []) as DealerPayout[];
  const banners = (bannerRows ?? []) as BannerItem[];

  const isSunday = new Date(`${s.today}T12:00:00Z`).getUTCDay() === 0;
  const prevMonth = previousMonth(s.month_start);
  const sameLabel = monthLabel(prevMonth, false);
  const growth =
    s.prev_to_date_fcfa > 0
      ? Math.round(((s.month_fcfa - s.prev_to_date_fcfa) * 100) / s.prev_to_date_fcfa)
      : null;

  const active = vehicles.filter((v) => v.status === 'active');
  const unassigned = active.filter((v) => !v.driver_name);
  const suspended = active.filter((v) => v.driver_status === 'suspended');
  const expectedTotal = active.reduce((sum, v) => sum + (v.driver_name ? v.expected_daily_fcfa : 0), 0);
  const updatedAt = new Date().toISOString();

  return (
    <div className="space-y-lg">
      {preview && profile.role === 'admin' && (
        <p className="rounded-xl bg-warning/15 p-md text-xs font-semibold text-neutral-800">
          Aperçu administrateur : vous voyez l’espace de {s.company_name}.
        </p>
      )}
      {banners.length > 0 && <BannerCarousel banners={banners} />}

      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900">{s.company_name}</h1>
          <p className="mt-xs text-sm text-neutral-600">
            Partenaire véhicule TamCar · Part {Number(s.share_pct)} %
            {s.is_shareholder && ` · Actionnaire SARL ${s.shareholder_pct ?? '—'} %`}
          </p>
        </div>
        <LiveRefresh dealerId={s.dealer_id} updatedAt={updatedAt} />
      </div>

      {/* Alertes */}
      {(unassigned.length > 0 || suspended.length > 0) && (
        <section className="space-y-xs">
          {unassigned.map((v) => (
            <Alert key={`u-${v.vehicle_id}`}>
              {v.brand} {v.model} ({v.plate_number}) n’a pas de chauffeur : il ne rapporte rien tant qu’il n’est pas affecté.
              Contactez TamCar.
            </Alert>
          ))}
          {suspended.map((v) => (
            <Alert key={`s-${v.vehicle_id}`}>
              Le chauffeur de {v.brand} {v.model} ({v.plate_number}) est suspendu : le véhicule ne roule plus pour le moment.
            </Alert>
          ))}
        </section>
      )}

      {/* Part du mois + portefeuille */}
      <section className="grid gap-md lg:grid-cols-3">
        <div className="rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 p-lg text-white shadow-glow lg:col-span-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary-100">
            Votre part · {monthLabel(s.month_start)}
          </p>
          <p className="mt-xs text-4xl font-extrabold">
            <LiveAmount value={s.month_fcfa} onDark />
          </p>
          <p className="mt-xs text-xs text-primary-100">
            {s.month_rides} course{s.month_rides > 1 ? 's' : ''} ce mois · dernière course {ago(s.last_ride_at)}
          </p>
          {growth !== null ? (
            <p className="mt-md text-xs text-primary-100">
              <strong className="text-white">
                {growth >= 0 ? '+' : ''}
                {growth} %
              </strong>{' '}
              par rapport à la même période en {sameLabel} ({fmt(s.prev_to_date_fcfa)} F).
            </p>
          ) : (
            <p className="mt-md text-xs text-primary-100">Pas encore de point de comparaison avec le mois précédent.</p>
          )}
        </div>

        <div className="rounded-2xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Portefeuille à percevoir</p>
          <p className="mt-xs text-3xl font-extrabold text-neutral-900">
            <LiveAmount value={s.wallet_fcfa} />
          </p>
          {s.paid_fcfa > 0 && (
            <p className="mt-xs text-xs text-neutral-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
              Déjà versé : {fmt(s.paid_fcfa)} F
            </p>
          )}
          <p className="mt-md text-[11px] leading-relaxed text-neutral-500">
            Ce solde augmente à chaque course terminée sur vos véhicules. Les versements sont enregistrés par l’équipe TamCar.
          </p>
          {payouts.length > 0 && (
            <ul className="mt-md space-y-xs border-t border-neutral-100 pt-md">
              <li className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Derniers versements</li>
              {payouts.map((p) => (
                <li
                  key={p.paid_at}
                  className="flex items-baseline justify-between gap-sm text-xs text-neutral-700"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  <span>
                    {new Date(p.paid_at).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'Africa/Porto-Novo',
                    })}
                    {p.note && <span className="text-neutral-400"> · {p.note}</span>}
                  </span>
                  <strong className="text-neutral-900">{fmt(p.amount_fcfa)} F</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-md sm:grid-cols-3">
        <Kpi
          label="Aujourd’hui"
          value={<LiveAmount value={s.today_fcfa} />}
          sub={`${s.today_rides} course${s.today_rides > 1 ? 's' : ''}`}
        />
        <Kpi
          label={`Mois précédent · ${monthLabel(prevMonth, false)}`}
          value={`${fmt(s.prev_month_fcfa)} F`}
        />
        <Kpi
          label="Depuis le début"
          value={`${fmt(s.total_fcfa)} F`}
          sub={`${s.total_rides} course${s.total_rides > 1 ? 's' : ''}`}
        />
      </section>

      {/* Jour par jour */}
      <section className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <div className="mb-md flex flex-wrap items-baseline justify-between gap-sm">
          <h2 className="text-lg font-bold text-neutral-900">Jour par jour · {monthLabel(s.month_start, false)}</h2>
          {expectedTotal > 0 && (
            <p className="text-[11px] text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
              Trait pointillé : objectif indicatif de votre part, {fmt(expectedTotal)} F par jour
            </p>
          )}
        </div>
        <DailyBars days={days} today={s.today} target={expectedTotal} />
      </section>

      {/* Véhicules */}
      <section>
        <div className="mb-md flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-neutral-900">Ma flotte</h2>
          <Link
            href={preview ? `/dealer/vehicles?as=${preview}` : '/dealer/vehicles'}
            className="text-xs font-semibold text-primary-700 underline"
          >
            Voir le détail
          </Link>
        </div>
        {vehicles.length === 0 ? (
          <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
            Aucun véhicule enregistré. Contactez TamCar pour en ajouter.
          </div>
        ) : (
          <ul className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => (
              <VehicleCard key={v.vehicle_id} v={v} isSunday={isSunday} />
            ))}
          </ul>
        )}
      </section>

      {/* Fonds de rachat et avance de démarrage */}
      {(s.fund_fcfa > 0 || s.adr_amount_fcfa !== null) && (
        <section className="grid gap-md sm:grid-cols-2">
          {s.fund_fcfa > 0 && (
            <div className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Fonds de rachat constitué sur vos véhicules
              </p>
              <p className="mt-xs text-2xl font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(s.fund_fcfa)} F
              </p>
              <p className="mt-sm text-[11px] leading-relaxed text-neutral-500">
                Il s’ajoute à votre part de chaque course et vous revient à la cession du véhicule au chauffeur, à la fin du contrat.
              </p>
            </div>
          )}
          {s.adr_amount_fcfa !== null && (
            <div className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Avance de démarrage remboursable
              </p>
              <p className="mt-xs text-2xl font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(s.adr_amount_fcfa)} F
              </p>
              <p className="mt-sm text-[11px] leading-relaxed text-neutral-500">
                {s.adr_status === 'refunded' && 'Remboursée.'}
                {s.adr_status === 'pending_activation' &&
                  'Remboursable 12 mois après la mise en service de votre premier véhicule.'}
                {s.adr_status === 'active' &&
                  `Remboursement prévu le ${s.adr_refund_target ? new Date(`${s.adr_refund_target}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'à la date anniversaire des 12 mois'}.`}
                {s.adr_status === 'forfeited' && 'Contrat clôturé : voir avec TamCar.'}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Dernières courses */}
      <section>
        <div className="mb-md flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-neutral-900">Dernières courses</h2>
          <Link
            href={preview ? `/dealer/transactions?as=${preview}` : '/dealer/transactions'}
            className="text-xs font-semibold text-primary-700 underline"
          >
            Voir tout l’historique
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
            Aucune course pour le moment.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
            {recent.map((r) => (
              <li key={r.ride_id} className="flex items-center justify-between gap-md px-md py-sm text-sm">
                <span className="text-xs text-neutral-600">
                  {new Date(r.ended_at).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Africa/Porto-Novo',
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-700">
                  {r.brand} {r.model} · {r.plate_number}
                </span>
                <strong className="text-primary-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  +{fmt(r.share_fcfa)} F
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-sm rounded-xl bg-warning/15 p-md text-xs font-medium leading-relaxed text-neutral-800">
      <AlertTriangleIcon className="mt-0.5 h-4 w-4 flex-none text-warning" />
      <span>{children}</span>
    </p>
  );
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-md shadow-sm ring-1 ring-neutral-200">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-xs text-2xl font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      {sub && <p className="mt-xs text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}

function VehicleCard({ v, isSunday }: { v: DealerVehicle; isSunday: boolean }) {
  const suspended = v.driver_status === 'suspended';
  const showGauge = v.status === 'active' && v.driver_name && v.expected_daily_fcfa > 0 && !isSunday;
  const pct = showGauge ? Math.round((v.today_fcfa * 100) / v.expected_daily_fcfa) : 0;
  return (
    <li className="rounded-xl bg-white p-md shadow-sm ring-1 ring-neutral-200">
      <div className="flex items-start justify-between gap-md">
        <div className="min-w-0">
          <p className="truncate font-semibold text-neutral-900">
            {v.brand} {v.model}
          </p>
          <p className="text-[11px] text-neutral-500">
            {v.plate_number} · {CAT_LABEL[v.category] ?? v.category}
          </p>
        </div>
        <span
          className={`flex-none rounded-full px-sm py-0.5 text-[10px] font-bold ${
            v.status === 'active' ? 'bg-primary-100 text-primary-700' : 'bg-neutral-200 text-neutral-700'
          }`}
        >
          {VEHICLE_STATUS_LABEL[v.status]}
        </span>
      </div>

      <p className="mt-sm flex items-center gap-xs text-xs text-neutral-700">
        <span
          className={`inline-block h-2 w-2 flex-none rounded-full ${
            suspended ? 'bg-error' : v.driver_online ? 'bg-success' : 'bg-neutral-300'
          }`}
          aria-hidden
        />
        {v.driver_name ? (
          <>
            {v.driver_name} · {suspended ? 'suspendu' : v.driver_online ? 'en ligne' : 'hors ligne'}
          </>
        ) : (
          <span className="font-semibold text-warning">Pas de chauffeur affecté</span>
        )}
      </p>

      <div className="mt-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <div className="flex items-baseline justify-between text-xs text-neutral-600">
          <span>
            Aujourd’hui : <strong className="text-neutral-900">{fmt(v.today_fcfa)} F</strong> · {v.today_rides} course
            {v.today_rides > 1 ? 's' : ''}
          </span>
          {showGauge && <span>{pct} %</span>}
        </div>
        {showGauge && (
          <div className="mt-xs h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-full rounded-full ${pct >= 100 ? 'bg-success' : 'bg-primary-500'}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        )}
        {showGauge && (
          <p className="mt-xs text-[10px] text-neutral-500">Objectif indicatif de votre part : {fmt(v.expected_daily_fcfa)} F</p>
        )}
        <p className="mt-sm text-xs text-neutral-600">
          Ce mois : <strong className="text-neutral-900">{fmt(v.month_fcfa)} F</strong> · {v.month_rides} course
          {v.month_rides > 1 ? 's' : ''}
        </p>
      </div>
    </li>
  );
}

/** Histogramme du mois : une barre par jour, le jour en cours en couleur pleine. */
function DailyBars({ days, today, target }: { days: DealerDay[]; today: string; target: number }) {
  const max = Math.max(1, target, ...days.map((d) => d.share_fcfa));
  const HEIGHT = 112;
  const targetBottom = target > 0 ? Math.round((target / max) * HEIGHT) : null;
  return (
    <div>
      <div className="relative flex items-end gap-[3px]" style={{ height: HEIGHT }}>
        {targetBottom !== null && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-neutral-400"
            style={{ bottom: targetBottom }}
          />
        )}
        {days.map((d) => {
          const h = d.share_fcfa > 0 ? Math.max(4, Math.round((d.share_fcfa / max) * HEIGHT)) : 2;
          const isToday = d.day === today;
          return (
            <div
              key={d.day}
              className="flex-1 rounded-t-sm"
              style={{ height: h }}
              title={`${new Date(`${d.day}T00:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })} : ${fmt(d.share_fcfa)} F (${d.rides} course${d.rides > 1 ? 's' : ''})`}
            >
              <div
                className={`h-full w-full rounded-t-sm ${
                  d.share_fcfa === 0 ? 'bg-neutral-200' : isToday ? 'bg-primary-500' : 'bg-primary-200'
                }`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-xs flex gap-[3px] text-[9px] text-neutral-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {days.map((d, i) => {
          const n = Number(d.day.slice(8, 10));
          const show = i === 0 || i === days.length - 1 || n % 5 === 0;
          return (
            <span key={d.day} className="flex-1 text-center">
              {show ? n : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
