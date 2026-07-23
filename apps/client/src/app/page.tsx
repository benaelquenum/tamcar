import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { getT } from '@/lib/i18n-server';
import {
  ArrowRightIcon,
  CalendarIcon,
  CarIcon,
  GiftIcon,
  HistoryIcon,
  LifeBuoyIcon,
  PinIcon,
  PlusIcon,
  RouteIcon,
  WalletIcon,
  WaveIcon,
} from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { firstNameOf, getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';

type BannerRow = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  cta_text: string | null;
  gradient: string | null;
};

type ActiveRideRow = {
  id: string;
  status: 'requested' | 'matched' | 'arrived' | 'in_progress';
  pickup_address: string;
  dropoff_address: string;
  price_total_fcfa: number;
  requested_at: string;
  matched_at: string | null;
  driver_full_name: string | null;
};

const ACTIVE_STATUS_TINT: Record<ActiveRideRow['status'], string> = {
  requested: 'from-primary-500 to-primary-700',
  matched: 'from-primary-500 to-primary-700',
  arrived: 'from-primary-700 to-cyan-500',
  in_progress: 'from-primary-500 to-primary-700',
};

const DEFAULT_NAMES = new Set(['utilisateur', 'Nouveau client', 'Ami TamCar']);

function formatFcfaHome(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export default async function HomePage() {
  const t = getT();
  const profile = await getCurrentProfile();

  // Force onboarding si le profil est loggé mais pas encore complété
  if (profile && (!profile.full_name || DEFAULT_NAMES.has(profile.full_name.trim()))) {
    redirect('/onboarding');
  }

  // Redirect concessionnaire vers son portail dédié
  if (profile && profile.role === 'dealer') {
    redirect('/dealer');
  }

  const firstName = firstNameOf(profile);
  const isLoggedIn = profile !== null;

  // Fetch balance TamCar Crédit + course active + chauffeurs en ligne réels
  let creditBalance = 0;
  let activeRide: ActiveRideRow | null = null;
  let onlineDrivers: { count: number; label: string } | null = null;
  const supabase = createServerSupabase();

  // Nombre de chauffeurs actuellement online (globalement — hors géoloc précise)
  const { count: driverCount } = await supabase
    .from('drivers')
    .select('*', { count: 'exact', head: true })
    .eq('is_online', true)
    .eq('status', 'active');
  if ((driverCount ?? 0) > 0) {
    onlineDrivers = {
      count: driverCount ?? 0,
      label: `${driverCount} chauffeur${(driverCount ?? 0) > 1 ? 's' : ''} en ligne`,
    };
  }

  if (isLoggedIn) {
    const [{ data: wallets }, { data: activeData }] = await Promise.all([
      supabase.rpc('my_wallets'),
      supabase.rpc('my_active_ride'),
    ]);
    const credit = (wallets as Array<{ kind: string; balance_fcfa: number }> | null)?.find(
      (w) => w.kind === 'tamcar_credit',
    );
    if (credit) creditBalance = credit.balance_fcfa;
    const rows = (activeData ?? []) as ActiveRideRow[];
    if (rows[0]) activeRide = rows[0];
  }

  // Bannières actives
  const { data: bannersData } = await supabase
    .from('home_banners')
    .select('id, title, subtitle, image_url, link_url, cta_text, gradient')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(6);
  const banners = (bannersData ?? []) as BannerRow[];

  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      {/* Blobs décoratifs en fond (subtils, flous) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-96 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-80 blur-3xl" />
        <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="absolute right-20 top-40 h-32 w-32 rounded-full bg-cyan-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-xl">
        {/* Header : le middleware garantit que l'user est loggé sur cette page */}
        <header className="flex items-center justify-between">
          <Logo className="h-9 w-auto" />
          {profile && (
            <Link
              href="/compte"
              aria-label="Mon compte"
              className="flex items-center gap-sm rounded-full bg-white p-xs pr-md shadow-md ring-1 ring-neutral-200 transition hover:shadow-lg"
            >
              <Avatar
                src={profile.avatar_url}
                name={profile.full_name}
                size={36}
              />
              <span className="hidden text-sm font-bold text-neutral-900 sm:inline">
                {firstName ?? 'Compte'}
              </span>
            </Link>
          )}
        </header>

        {/* Onglet notification course active */}
        {activeRide && <ActiveRideBanner ride={activeRide} t={t} />}

        {/* Greeting + hero */}
        <section className="mt-xl">
          <p className="flex items-center gap-xs text-base font-medium text-neutral-600">
            <WaveIcon className="h-5 w-5 text-primary-500" />
            <span>{firstName ? `${t('home.greeting')} ${firstName}` : t('home.greeting')}</span>
          </p>
          <h1 className="mt-xs text-4xl font-extrabold leading-[1.05] tracking-tight text-neutral-900">
            {t('home.hero')}
            <br />
            <span className="bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">
              {t('home.hero.today')}
            </span>
            &nbsp;?
          </h1>

          {/* Live status — affiché uniquement si des chauffeurs sont réellement online */}
          {onlineDrivers && (
            <div className="mt-md inline-flex items-center gap-sm rounded-full bg-primary-50 px-md py-xs">
              <span className="relative grid h-2 w-2 place-items-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-500/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
              </span>
              <span
                className="text-xs font-semibold text-primary-700"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {onlineDrivers.label}
              </span>
            </div>
          )}
        </section>

        {/* Search field */}
        <section className="mt-lg">
          <Link
            href="/commande"
            className="group flex w-full items-center gap-md rounded-xl bg-white p-lg text-left shadow-md ring-1 ring-neutral-200 transition hover:shadow-lg hover:ring-primary-300"
          >
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-glow">
              <PinIcon />
            </span>
            <span className="flex-1 text-neutral-400 group-hover:text-neutral-600">
              {t('home.search')}
            </span>
            <ArrowRightIcon />
          </Link>
        </section>

        {/* Wallet compact — remonté juste sous la barre "Où voulez-vous aller ?" */}
        {isLoggedIn && (
          <section className="mt-md">
            <Link
              href="/wallet"
              className="flex items-center gap-sm rounded-lg border border-neutral-200 bg-white px-md py-xs shadow-sm transition hover:shadow-md"
            >
              <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-primary-500 text-white">
                <WalletIcon className="h-4 w-4" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                {t('home.credit')}
              </span>
              <span
                className="flex-1 text-right text-sm font-extrabold text-neutral-900"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatFcfaHome(creditBalance)}
                <span className="ml-xs text-[10px] font-medium text-neutral-500">F</span>
              </span>
              <span className="inline-flex items-center gap-xs rounded-md bg-primary-500 px-sm py-xs text-[11px] font-bold text-white">
                <PlusIcon className="h-3 w-3" strokeWidth={3} />
                {t('home.recharge')}
              </span>
            </Link>
          </section>
        )}

        {/* CTAs */}
        <section className="mt-lg space-y-md">
          <Link
            href="/commande"
            className="flex w-full items-center justify-center gap-sm rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
          >
            <CarIcon className="h-5 w-5" />
            {t('home.book_now')}
          </Link>
          <Link
            href="/commande?scheduled=1"
            className="flex w-full items-center justify-center gap-sm rounded-xl border-2 border-primary-500 bg-white py-lg text-base font-semibold text-primary-700 transition hover:bg-primary-50"
          >
            <CalendarIcon className="h-5 w-5" />
            {t('home.book_later')}
          </Link>
        </section>

        {/* Quick actions row — remontées haut : accès direct aux fonctions courantes */}
        <section className="mt-lg grid grid-cols-4 gap-sm">
          <QuickActionLink href="/tampass" Icon={RouteIcon} label="TamPass" tint="cyan" />
          <QuickActionLink href="/history" Icon={HistoryIcon} label={t('home.history')} tint="primary" />
          <QuickActionLink href="/parrainer" Icon={GiftIcon} label={t('home.refer')} tint="violet" />
          <QuickAction Icon={LifeBuoyIcon} label={t('home.help')} tint="cyan" />
        </section>

        {/* Bannières de communication */}
        {banners.length > 0 && (
          <section className="mt-xl">
            <div className="-mx-lg overflow-x-auto pb-xs">
              <div className="flex gap-md px-lg">
                {banners.map((b) => (
                  <BannerCard key={b.id} banner={b} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Devenir chauffeur */}
        <section className="mt-lg">
          <Link
            href="/devenir-chauffeur"
            className="flex items-center gap-md rounded-xl border border-neutral-200 bg-white p-md shadow-sm transition hover:shadow-md"
          >
            <div className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white">
              <CarIcon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-neutral-900">{t('home.become_driver')}</p>
              <p className="text-[10px] text-neutral-600">
                2 formules · cession 24 mois ou propriétaire libre
              </p>
            </div>
            <span className="text-neutral-400">→</span>
          </Link>
        </section>

        <div className="h-2xl" />
      </div>
    </main>
  );
}

function BannerCard({ banner }: { banner: BannerRow }) {
  const gradient = banner.gradient || 'from-primary-500 to-primary-700';
  const inner = (
    <div
      className={`relative flex min-h-32 w-72 flex-none flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-lg text-white shadow-glow`}
    >
      {banner.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={banner.image_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
      )}
      <div className="relative">
        <h3 className="text-base font-extrabold leading-tight">{banner.title}</h3>
        {banner.subtitle && (
          <p className="mt-xs text-xs text-white/85">{banner.subtitle}</p>
        )}
      </div>
      {banner.cta_text && (
        <span className="relative mt-md inline-flex w-fit items-center gap-xs rounded-full bg-white/25 px-md py-xs text-[11px] font-bold backdrop-blur-sm">
          {banner.cta_text}
          <ArrowRightIcon className="h-3 w-3" />
        </span>
      )}
    </div>
  );
  return banner.link_url ? (
    <a href={banner.link_url} className="flex-none">
      {inner}
    </a>
  ) : (
    <div className="flex-none">{inner}</div>
  );
}

function ActiveRideBanner({ ride, t }: { ride: ActiveRideRow; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const tint = ACTIVE_STATUS_TINT[ride.status];
  const label = t(`ride.status.${ride.status}`);
  return (
    <Link
      href={`/ride/${ride.id}`}
      className={`mt-lg block overflow-hidden rounded-2xl bg-gradient-to-r ${tint} text-white shadow-glow transition hover:brightness-110`}
    >
      <div className="flex items-center gap-md p-md">
        <span className="relative grid h-10 w-10 flex-none place-items-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/40" />
          <span className="relative grid h-10 w-10 place-items-center rounded-full bg-white/20 backdrop-blur">
            <CarIcon className="h-5 w-5" />
          </span>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">
            {t('home.active_ride')}
          </p>
          <p className="truncate text-sm font-extrabold">{label}</p>
          <p className="truncate text-[11px] text-white/90">
            {ride.status === 'in_progress' || ride.status === 'arrived'
              ? `→ ${ride.dropoff_address}`
              : ride.driver_full_name
                ? `${ride.driver_full_name.split(' ')[0]} · ${ride.pickup_address}`
                : ride.pickup_address}
          </p>
        </div>
        <div className="text-right">
          <p
            className="text-lg font-extrabold leading-none"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {ride.price_total_fcfa.toLocaleString('fr-FR').replace(/,/g, ' ')}
          </p>
          <p className="text-[9px] text-white/80">FCFA</p>
        </div>
        <ArrowRightIcon className="h-5 w-5 flex-none opacity-90" />
      </div>
    </Link>
  );
}

type Tint = 'primary' | 'violet' | 'cyan';

const TINT_CLASSES: Record<Tint, string> = {
  primary: 'text-primary-500 bg-primary-50',
  violet: 'text-violet-500 bg-violet-500/10',
  cyan: 'text-cyan-500 bg-cyan-500/10',
};

function QuickAction({
  Icon,
  label,
  tag,
  tint,
}: {
  Icon: (props: { className?: string }) => JSX.Element;
  label: string;
  tag?: string;
  tint: Tint;
}) {
  return (
    <button
      type="button"
      className="relative flex flex-col items-center gap-xs rounded-xl border border-neutral-200 bg-white p-md text-center shadow-sm transition hover:shadow-md"
    >
      <span className={`grid h-10 w-10 place-items-center rounded-lg ${TINT_CLASSES[tint]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-xs font-semibold text-neutral-900">{label}</span>
      {tag && (
        <span className="absolute -right-1 -top-1 rounded-full bg-violet-500 px-xs py-0.5 text-[10px] font-bold text-white shadow-glow-violet">
          {tag}
        </span>
      )}
    </button>
  );
}

function QuickActionLink({
  href,
  Icon,
  label,
  tint,
}: {
  href: string;
  Icon: (props: { className?: string }) => JSX.Element;
  label: string;
  tint: Tint;
}) {
  return (
    <Link
      href={href}
      className="relative flex flex-col items-center gap-xs rounded-xl border border-neutral-200 bg-white p-md text-center shadow-sm transition hover:shadow-md"
    >
      <span className={`grid h-10 w-10 place-items-center rounded-lg ${TINT_CLASSES[tint]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-xs font-semibold text-neutral-900">{label}</span>
    </Link>
  );
}
