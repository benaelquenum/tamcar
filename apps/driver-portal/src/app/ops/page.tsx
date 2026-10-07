import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { PhoneIcon } from '@/components/Icon';
import { VehicleIcon } from '@/components/VehicleIcon';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { AutoRefresh } from './AutoRefresh';

export const dynamic = 'force-dynamic';

type Summary = {
  city: string;
  rate_pct: number;
  monthly_cap_fcfa: number;
  mandate_active: boolean;
  started_on: string;
  ended_on: string | null;
  month_start: string;
  earned_month: number;
  remaining_cap: number;
  wallet_fcfa: number;
  rides_month: number;
  volume_month: number;
  drivers_total: number;
  drivers_online: number;
  commission_started: boolean;
  commission_start: string;
};

type DriverRow = {
  driver_id: string;
  full_name: string;
  phone: string | null;
  category: string | null;
  plate: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  driver_status: string;
  rides_today: number;
  volume_today: number;
  rides_month: number;
  volume_month: number;
  floor_fcfa: number;
  pct_today: number;
};

type DayRow = { day: string; rides: number; volume: number; commission: number };

const CAT_LABEL: Record<string, string> = {
  moto: 'Moto',
  tricycle: 'Tricycle',
  essentiel: 'Essentiel',
  confort: 'Confort',
  premium: 'VIP',
};

function fmt(n: number | null | undefined): string {
  return Math.round(Number(n) || 0)
    .toLocaleString('fr-FR')
    .replace(/,/g, ' ');
}

function ago(iso: string | null): string {
  if (!iso) return 'jamais vu';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86_400)} j`;
}

export default async function OpsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = createServerSupabase();
  const { data: isManager } = await supabase.rpc('ops_is_manager');
  if (!isManager) redirect('/dashboard');

  const [{ data: sData }, { data: dData }, { data: yData }] = await Promise.all([
    supabase.rpc('ops_pro_summary'),
    supabase.rpc('ops_pro_drivers'),
    supabase.rpc('ops_pro_daily'),
  ]);
  const s = ((sData ?? []) as Summary[])[0];
  const drivers = (dData ?? []) as DriverRow[];
  const days = ((yData ?? []) as DayRow[]).slice(0, 10);
  if (!s) redirect('/dashboard');

  const capPct = s.monthly_cap_fcfa > 0 ? Math.min(100, Math.round((s.earned_month * 100) / s.monthly_cap_fcfa)) : 0;
  const monthLabel = new Date(`${s.month_start}T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <main className="relative min-h-dvh bg-neutral-50">
      <AutoRefresh />
      <div className="relative z-10 mx-auto max-w-md px-lg py-lg pb-3xl">
        <header className="flex items-center justify-between">
          <Link
            href="/dashboard"
            aria-label="Retour"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
          <div className="w-11" />
        </header>

        <h1 className="mt-lg text-xl font-extrabold text-neutral-900">Espace responsable opérations</h1>
        <p className="text-xs font-bold uppercase tracking-wider text-primary-700">
          {s.city}
          {!s.mandate_active && ' · mandat terminé'}
        </p>

        {/* Portefeuille responsable */}
        <section className="mt-lg rounded-2xl bg-gradient-to-br from-violet-500 to-primary-700 p-lg text-white shadow-glow">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">Mon portefeuille responsable</p>
          <p className="mt-xs text-4xl font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(s.wallet_fcfa)}
            <span className="ml-xs text-lg font-medium text-white/80">FCFA</span>
          </p>
          <div className="mt-md">
            <div className="flex items-baseline justify-between text-[11px] text-white/85">
              <span>
                Gagné en {monthLabel} : <strong className="text-white">{fmt(s.earned_month)} F</strong>
              </span>
              <span>plafond {fmt(s.monthly_cap_fcfa)} F</span>
            </div>
            <div className="mt-xs h-2 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${capPct}%` }} />
            </div>
            {s.remaining_cap === 0 && s.monthly_cap_fcfa > 0 && (
              <p className="mt-xs text-[11px] font-semibold text-white">Plafond du mois atteint.</p>
            )}
          </div>
          <p className="mt-md text-[11px] leading-relaxed text-white/85">
            Vous recevez <strong className="text-white">{Number(s.rate_pct)} % du prix</strong> de chaque course terminée par les
            chauffeurs que vous supervisez (moto, tricycle, voiture), jusqu’à {fmt(s.monthly_cap_fcfa)} F par mois. Vos
            propres courses ne comptent pas.
            {!s.commission_started &&
              ` Les commissions démarrent le ${new Date(s.commission_start).toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo', day: 'numeric', month: 'long', year: 'numeric' })}.`}
          </p>
        </section>

        {/* Chiffres du mois */}
        <section className="mt-md grid grid-cols-3 gap-sm">
          {[
            ['Courses du mois', fmt(s.rides_month)],
            ['Volume du mois', `${fmt(s.volume_month)} F`],
            ['En ligne', `${s.drivers_online} / ${s.drivers_total}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-neutral-200 bg-white p-md text-center shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
              <p className="mt-xs text-sm font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {value}
              </p>
            </div>
          ))}
        </section>

        {/* Activité des chauffeurs supervisés */}
        <h2 className="mt-xl text-xs font-bold uppercase tracking-wider text-neutral-500">Mes chauffeurs</h2>
        {drivers.length === 0 ? (
          <p className="mt-sm rounded-xl bg-white p-lg text-center text-sm text-neutral-600 shadow-sm">
            Aucun chauffeur à superviser pour le moment.
          </p>
        ) : (
          <ul className="mt-sm space-y-sm">
            {drivers.map((d) => {
              const suspended = d.driver_status === 'suspended';
              const barPct = Math.min(100, Math.round(d.pct_today / 2));
              return (
                <li key={d.driver_id} className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <p className="flex items-center gap-xs text-sm font-bold text-neutral-900">
                        <span
                          className={`inline-block h-2.5 w-2.5 flex-none rounded-full ${
                            suspended ? 'bg-error' : d.is_online ? 'bg-success' : 'bg-neutral-300'
                          }`}
                          aria-hidden
                        />
                        <span className="truncate">{d.full_name}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-neutral-500">
                        <VehicleIcon category={d.category} className="mr-xs inline-block h-3.5 w-3.5 align-text-bottom text-primary-700" />
                        {CAT_LABEL[d.category ?? ''] ?? '—'}
                        {d.plate ? ` · ${d.plate}` : ''} ·{' '}
                        {suspended ? <strong className="text-error">suspendu</strong> : d.is_online ? 'en ligne' : `hors ligne, ${ago(d.last_seen_at)}`}
                      </p>
                    </div>
                    {d.phone && (
                      <a
                        href={`tel:${d.phone}`}
                        aria-label={`Appeler ${d.full_name}`}
                        className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primary-50 text-primary-700"
                      >
                        <PhoneIcon className="h-4 w-4" />
                      </a>
                    )}
                  </div>

                  <div className="mt-sm">
                    <div className="flex items-baseline justify-between text-[11px] text-neutral-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <span>
                        Aujourd’hui : <strong className="text-neutral-900">{fmt(d.volume_today)} F</strong> · {d.rides_today} course
                        {d.rides_today > 1 ? 's' : ''}
                      </span>
                      {d.floor_fcfa > 0 && <span>{d.pct_today} % de l’objectif</span>}
                    </div>
                    {d.floor_fcfa > 0 && (
                      <div className="relative mt-xs h-2 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className={`h-full rounded-full ${d.pct_today >= 100 ? 'bg-success' : 'bg-primary-500'}`}
                          style={{ width: `${barPct}%` }}
                        />
                        <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-neutral-400" />
                      </div>
                    )}
                    <p className="mt-xs text-[11px] text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      Ce mois : {fmt(d.volume_month)} F · {d.rides_month} course{d.rides_month > 1 ? 's' : ''}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Jour par jour */}
        {days.length > 0 && (
          <>
            <h2 className="mt-xl text-xs font-bold uppercase tracking-wider text-neutral-500">Jour par jour</h2>
            <ul className="mt-sm divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              {days.map((y) => (
                <li key={y.day} className="flex items-baseline justify-between gap-md px-md py-sm text-[12px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <span className="font-semibold text-neutral-800">
                    {new Date(`${y.day}T00:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                  </span>
                  <span className="text-neutral-500">
                    {y.rides} course{y.rides > 1 ? 's' : ''} · {fmt(y.volume)} F
                  </span>
                  <strong className="text-primary-700">+{fmt(y.commission)} F</strong>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-lg text-center text-[11px] text-neutral-500">
          Les données se rafraîchissent toutes les 30 secondes. Le règlement de votre portefeuille est enregistré par
          l’équipe TamCar.
        </p>
      </div>
    </main>
  );
}
