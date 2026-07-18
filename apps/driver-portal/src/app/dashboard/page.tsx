import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import {
  ArrowRightIcon,
  CarIcon,
  ChartIcon,
  CoinsIcon,
  HistoryIcon,
  LogOutIcon,
  WalletIcon,
} from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { logout } from '@/app/login/actions';

type WalletRow = { kind: 'tamcar_credit' | 'tamcar_revenus' | 'tamcar_rachat'; balance_fcfa: number };
type RideRow = {
  id: string;
  driver_share_fcfa: number;
  driver_rachat_fcfa: number;
  price_total_fcfa: number;
  distance_km: number | null;
  ended_at: string | null;
  requested_at: string;
  status: string;
};

function formatFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function DriverDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'driver' && profile.role !== 'admin') redirect('/');

  const supabase = createServerSupabase();

  const { data: driver } = await supabase
    .from('drivers')
    .select('id, application_type, current_vehicle_id, status, is_online')
    .eq('profile_id', profile.id)
    .single();
  if (!driver) redirect('/');

  const [
    { data: wallets },
    { data: rides },
    { data: vehicle },
    { data: progressData },
  ] = await Promise.all([
    supabase.rpc('my_wallets'),
    supabase
      .from('rides_view')
      .select('id, driver_share_fcfa, driver_rachat_fcfa, price_total_fcfa, distance_km, ended_at, requested_at, status')
      .eq('driver_id', driver.id)
      .eq('status', 'completed')
      .order('ended_at', { ascending: false })
      .limit(200),
    driver.current_vehicle_id
      ? supabase
          .from('vehicles')
          .select('brand, model, plate_number, category, color')
          .eq('id', driver.current_vehicle_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase.rpc('driver_today_progress', { p_driver_id: driver.id }),
  ]);

  const w = (wallets ?? []) as WalletRow[];
  const revenus = w.find((x) => x.kind === 'tamcar_revenus')?.balance_fcfa ?? 0;

  const list = (rides ?? []) as RideRow[];
  const weekStart = startOfWeek().toISOString();
  const monthStart = startOfMonth().toISOString();
  const weekRides = list.filter((r) => (r.ended_at ?? r.requested_at) >= weekStart);
  const monthRides = list.filter((r) => (r.ended_at ?? r.requested_at) >= monthStart);
  const weekGains = weekRides.reduce((s, r) => s + r.driver_share_fcfa, 0);
  const monthGains = monthRides.reduce((s, r) => s + r.driver_share_fcfa, 0);
  const totalRides = list.length;
  const totalGains = list.reduce((s, r) => s + r.driver_share_fcfa, 0);

  const isProprietaire = driver.application_type === 'proprietaire';
  const vehicleInfo = vehicle as { brand: string; model: string; plate_number: string; category: string; color: string | null } | null;

  type ProgressRow = {
    rides_today: number;
    min_target: number;
    bonus_threshold: number;
    is_senior: boolean;
    in_bonus_zone: boolean;
    courses_until_bonus: number;
    courses_below_min: number;
  };
  const progress = ((progressData ?? []) as ProgressRow[])[0] ?? {
    rides_today: 0,
    min_target: 15,
    bonus_threshold: 16,
    is_senior: false,
    in_bonus_zone: false,
    courses_until_bonus: 16,
    courses_below_min: 15,
  };

  return (
    <main className="relative min-h-dvh bg-neutral-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-70 blur-3xl" />
        <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            aria-label="Retour"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
          <div className="w-11" />
        </header>

        <section className="mt-lg flex items-center gap-md">
          <Avatar src={profile.avatar_url} name={profile.full_name} size={56} />
          <div>
            <h1 className="text-xl font-extrabold text-neutral-900">{profile.full_name}</h1>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
              {isProprietaire ? 'Formule Propriétaire' : 'Formule Cession'} ·{' '}
              {driver.is_online ? 'En ligne' : 'Hors ligne'}
            </p>
          </div>
        </section>

        {/* Jauge courses du jour (Formule A uniquement) */}
        {!isProprietaire && (
          <TodayProgress progress={progress} />
        )}

        {/* Wallets */}
        <section className="mt-lg">
          <WalletCard
            label="Cash disponible"
            value={revenus}
            highlight
            href="/wallet"
          />
        </section>

        {/* Gains période */}
        <section className="mt-lg rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
          <h2 className="mb-md flex items-center gap-xs text-xs font-bold uppercase tracking-wider text-neutral-500">
            <ChartIcon className="h-4 w-4" />
            Mes gains
          </h2>
          <div className="grid grid-cols-3 gap-sm text-center">
            <PeriodStat label="Cette semaine" value={weekGains} count={weekRides.length} />
            <PeriodStat label="Ce mois" value={monthGains} count={monthRides.length} />
            <PeriodStat label="Total" value={totalGains} count={totalRides} highlight />
          </div>
        </section>

        {/* Véhicule */}
        {vehicleInfo && (
          <section className="mt-lg rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
            <h2 className="mb-md flex items-center gap-xs text-xs font-bold uppercase tracking-wider text-neutral-500">
              <CarIcon className="h-4 w-4" />
              Mon véhicule
            </h2>
            <dl className="space-y-sm text-sm">
              <Row label="Marque & modèle" value={`${vehicleInfo.brand} ${vehicleInfo.model}`} />
              <Row label="Plaque" value={vehicleInfo.plate_number} />
              <Row label="Catégorie" value={`TamCar ${vehicleInfo.category}`} />
              {vehicleInfo.color && <Row label="Couleur" value={vehicleInfo.color} />}
            </dl>
            <p className="mt-md rounded-md bg-warning/10 p-sm text-[11px] text-warning">
              Info non modifiable en ligne. Contacte TamCar pour toute mise à jour.
            </p>
          </section>
        )}

        {/* Raccourcis */}
        <section className="mt-lg space-y-sm">
          <ShortcutLink
            href="/history"
            Icon={HistoryIcon}
            title="Historique des courses"
            sub="Détail de chaque course et ce qu'elle t'a rapporté"
          />
          <ShortcutLink
            href="/wallet"
            Icon={WalletIcon}
            title="Portefeuille"
            sub="Recharge, retrait, transactions"
          />
          <ShortcutLink
            href="/"
            Icon={CoinsIcon}
            title="Prendre des courses"
            sub="Retour à l'écran chauffeur pour te connecter"
          />
        </section>

        {/* Déconnexion */}
        <section className="mt-2xl">
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-sm rounded-xl border border-error/30 bg-white py-md text-sm font-bold text-error hover:bg-error/5"
            >
              <LogOutIcon />
              Se déconnecter
            </button>
          </form>
        </section>

        <div className="h-2xl" />
      </div>
    </main>
  );
}

function TodayProgress({
  progress,
}: {
  progress: {
    rides_today: number;
    min_target: number;
    bonus_threshold: number;
    is_senior: boolean;
    in_bonus_zone: boolean;
    courses_until_bonus: number;
    courses_below_min: number;
  };
}) {
  const pct = Math.min(100, Math.round((progress.rides_today / progress.bonus_threshold) * 100));
  const minPct = Math.min(100, Math.round((progress.min_target / progress.bonus_threshold) * 100));

  return (
    <section className="mt-lg rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
      <div className="mb-md flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Aujourd&apos;hui
        </h2>
        {progress.is_senior && (
          <span className="rounded-full bg-gold px-sm py-0.5 text-[10px] font-bold text-neutral-900 shadow-glow-gold">
            Senior · seuil abaissé 14e
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-sm">
        <p
          className="text-4xl font-extrabold text-neutral-900"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {progress.rides_today}
        </p>
        <p className="text-sm text-neutral-500">
          / {progress.bonus_threshold} pour toucher le bonus
        </p>
      </div>

      {/* Barre de progression avec marqueurs seuil min + seuil bonus */}
      <div className="relative mt-md h-3 overflow-visible rounded-full bg-neutral-100">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${
            progress.in_bonus_zone
              ? 'bg-gradient-to-r from-gold to-warning'
              : 'bg-gradient-to-r from-primary-500 to-primary-700'
          }`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute inset-y-0 border-l-2 border-dashed border-neutral-400"
          style={{ left: `${minPct}%` }}
          aria-label="Seuil minimum"
        />
      </div>
      <div className="mt-xs flex justify-between text-[10px] text-neutral-500">
        <span>0</span>
        <span style={{ marginLeft: `${minPct - 8}%` }}>Min {progress.min_target}</span>
        <span>Bonus {progress.bonus_threshold}</span>
      </div>

      <p className="mt-md text-sm text-neutral-800">
        {progress.in_bonus_zone ? (
          <>
            <strong className="text-warning">Bonus actif</strong> — +5% cash sur chaque course
            supplémentaire de la journée.
          </>
        ) : progress.courses_below_min > 0 ? (
          <>
            Encore <strong className="text-neutral-900">{progress.courses_below_min}</strong> course
            {progress.courses_below_min > 1 ? 's' : ''} pour atteindre ton minimum quotidien de{' '}
            {progress.min_target}.
          </>
        ) : (
          <>
            <strong className="text-primary-700">Minimum atteint.</strong> Encore{' '}
            <strong>{progress.courses_until_bonus}</strong> course
            {progress.courses_until_bonus > 1 ? 's' : ''} pour déclencher le bonus +5%.
          </>
        )}
      </p>
    </section>
  );
}

function WalletCard({
  label,
  value,
  highlight,
  gold,
  href,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  gold?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl p-md shadow-sm transition hover:shadow-md ${
        highlight
          ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white'
          : gold
          ? 'bg-gold/10 ring-1 ring-gold/40'
          : 'bg-white ring-1 ring-neutral-200'
      }`}
    >
      <p
        className={`text-[10px] font-bold uppercase tracking-wider ${
          highlight ? 'text-primary-100' : 'text-neutral-500'
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-xs text-xl font-extrabold ${highlight ? 'text-white' : 'text-neutral-900'}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {formatFcfa(value)}
        <span className="ml-xs text-[10px] font-medium opacity-70">FCFA</span>
      </p>
    </Link>
  );
}

function PeriodStat({
  label,
  value,
  count,
  highlight,
}: {
  label: string;
  value: number;
  count: number;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg p-sm ${highlight ? 'bg-primary-50' : ''}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p
        className={`mt-xs text-base font-extrabold ${highlight ? 'text-primary-700' : 'text-neutral-900'}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {formatFcfa(value)}
      </p>
      <p className="text-[10px] text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {count} course{count > 1 ? 's' : ''}
      </p>
    </div>
  );
}

function ShortcutLink({
  href,
  Icon,
  title,
  sub,
}: {
  href: string;
  Icon: (p: { className?: string }) => JSX.Element;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-md rounded-xl border border-neutral-200 bg-white p-md shadow-sm transition hover:shadow-md"
    >
      <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-primary-50 text-primary-500">
        <Icon />
      </span>
      <div className="flex-1">
        <p className="text-sm font-bold text-neutral-900">{title}</p>
        <p className="text-[11px] text-neutral-600">{sub}</p>
      </div>
      <ArrowRightIcon className="h-4 w-4 text-neutral-400" />
    </Link>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-md">
      <dt className="text-neutral-600">{label}</dt>
      <dd
        className="text-right font-semibold text-neutral-900"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </dd>
    </div>
  );
}
