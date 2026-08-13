import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { getT } from '@/lib/i18n-server';
import {
  ArrowRightIcon,
  CarIcon,
  PinIcon,
  PlusIcon,
  WalletIcon,
} from '@/components/Icon';
import { firstNameOf, getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { UnreadMessagesChip } from '@/components/UnreadMessagesChip';
import { BannerCarousel } from '@/components/BannerCarousel';
import { ProfileMenu } from '@/components/ProfileMenu';
import { BottomTabBar } from '@/components/BottomTabBar';
import {
  QuickDestinations,
  type FavoritePlace,
  type RecentDestination,
} from '@/components/QuickDestinations';

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

/**
 * Accueil client — refonte du 2026-08-13.
 *
 * L'écran n'est plus un menu de raccourcis mais la PREMIÈRE ÉTAPE de la
 * commande : carte vivante en haut, un seul champ « Où allez-vous ? », les
 * lieux du client sous la main, le solde juste avant le bouton. Les
 * rubriques secondaires descendent dans /menu, atteignable par la barre
 * d'onglets — dont le bouton central porte la réservation.
 */
export default async function HomePage() {
  const t = getT();
  const profile = await getCurrentProfile();

  // Force onboarding si le profil est loggé mais pas encore complété
  if (profile && (!profile.full_name || DEFAULT_NAMES.has(profile.full_name.trim()))) {
    redirect('/onboarding');
  }

  // Redirect partenaire véhicule vers son portail dédié
  if (profile && profile.role === 'dealer') {
    redirect('/dealer');
  }

  const firstName = firstNameOf(profile);
  const isLoggedIn = profile !== null;

  let creditBalance = 0;
  let activeRide: ActiveRideRow | null = null;
  let favorites: FavoritePlace[] = [];
  let recents: RecentDestination[] = [];

  const supabase = createServerSupabase();

  // Une seule vague parallèle : bannières, puis les données du compte.
  const [bannersRes, driversRes, personal] = await Promise.all([
    supabase
      .from('home_banners')
      .select('id, title, subtitle, image_url, link_url, cta_text, gradient')
      .eq('is_active', true)
      .eq('audience', 'client')
      .order('display_order', { ascending: true })
      .limit(6),
    // Sans carte, on n'a plus la position du client : on ne peut donc plus
    // écrire « à proximité » sans mentir. Simple décompte des chauffeurs en
    // service, comme avant la refonte — la promesse reste vérifiable.
    supabase
      .from('drivers')
      .select('*', { count: 'exact', head: true })
      .eq('is_online', true)
      .eq('status', 'active'),
    isLoggedIn
      ? Promise.all([
          supabase.rpc('my_wallets'),
          supabase.rpc('my_active_ride'),
          supabase.rpc('my_favorite_places'),
          supabase.rpc('my_recent_destinations', { p_limit: 4 }),
        ])
      : Promise.resolve(null),
  ]);

  if (personal) {
    const [{ data: wallets }, { data: activeData }, { data: favData }, { data: recentData }] =
      personal;
    const credit = (wallets as Array<{ kind: string; balance_fcfa: number }> | null)?.find(
      (w) => w.kind === 'tamcar_credit',
    );
    if (credit) creditBalance = credit.balance_fcfa;
    const rows = (activeData ?? []) as ActiveRideRow[];
    if (rows[0]) activeRide = rows[0];
    favorites = (Array.isArray(favData) ? favData : []) as FavoritePlace[];
    recents = (Array.isArray(recentData) ? recentData : []) as RecentDestination[];
  }

  const banners = (bannersRes.data ?? []) as BannerRow[];
  const onlineCount = driversRes.count ?? 0;

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="relative z-10 mx-auto max-w-md px-lg pt-lg">
        <header className="flex items-center justify-between">
          <Logo className="h-8 w-auto" />
          {profile && (
            <ProfileMenu
              avatarUrl={profile.avatar_url}
              fullName={profile.full_name}
              firstName={firstName ?? ''}
            />
          )}
        </header>

        {banners.length > 0 && <BannerCarousel banners={banners} className="mt-md" />}

        {activeRide && <ActiveRideBanner ride={activeRide} t={t} />}

        <section className="mt-lg">
          <p className="text-sm font-medium text-neutral-600">
            {firstName ? `${t('home.greeting')} ${firstName}` : t('home.greeting')}
          </p>
          <h1 className="mt-xs text-3xl font-extrabold leading-tight tracking-tight text-neutral-900">
            Où allez-vous&nbsp;?
          </h1>

          {onlineCount > 0 && (
            <div className="mt-md inline-flex items-center gap-sm rounded-full bg-success/10 px-md py-xs">
              <span className="relative grid h-2 w-2 place-items-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <span
                className="text-xs font-semibold text-success"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {onlineCount} chauffeur{onlineCount > 1 ? 's' : ''} en service
              </span>
            </div>
          )}
        </section>

        {/* Champ unique : le départ est déduit du GPS, une seule décision. */}
        <section className="mt-md">
          <Link
            href="/commande"
            className="group flex w-full items-center gap-md rounded-xl bg-white p-md text-left ring-2 ring-primary-500 transition hover:shadow-md"
          >
            <PinIcon className="h-5 w-5 flex-none text-primary-500" />
            <span className="flex-1 text-sm text-neutral-400 group-hover:text-neutral-600">
              Entrez votre destination
            </span>
            <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white">
              <ArrowRightIcon className="h-4 w-4" />
            </span>
          </Link>
        </section>

        {isLoggedIn && <QuickDestinations favorites={favorites} recents={recents} />}

        {isLoggedIn && (
          <section className="mt-lg">
            <Link
              href="/wallet"
              className="flex items-center gap-sm rounded-xl bg-primary-50 px-md py-sm transition hover:bg-primary-100"
            >
              <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-primary-500 text-white">
                <WalletIcon className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                  {t('home.credit')}
                </span>
                <span
                  className="block text-lg font-extrabold text-neutral-900"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatFcfaHome(creditBalance)}
                  <span className="ml-xs text-xs font-medium text-neutral-500">F</span>
                </span>
              </span>
              <span className="inline-flex items-center gap-xs rounded-lg bg-white px-md py-xs text-[11px] font-bold text-primary-700 shadow-sm">
                {t('home.recharge')}
                <PlusIcon className="h-3 w-3" strokeWidth={3} />
              </span>
            </Link>
          </section>
        )}

        <section className="mt-lg">
          <Link
            href="/commande"
            className="flex w-full items-center justify-center gap-sm rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
          >
            <CarIcon className="h-5 w-5" />
            {t('home.book_now')}
          </Link>
        </section>

        <BottomTabBar />
      </div>

      <UnreadMessagesChip />
    </main>
  );
}

function ActiveRideBanner({
  ride,
  t,
}: {
  ride: ActiveRideRow;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const tint = ACTIVE_STATUS_TINT[ride.status];
  const label =
    ride.status === 'requested'
      ? t('ride.status.requested')
      : ride.status === 'matched'
        ? t('ride.status.matched')
        : ride.status === 'arrived'
          ? t('ride.status.arrived')
          : t('ride.status.in_progress');

  return (
    <Link
      href={`/ride/${ride.id}`}
      className={`mb-md flex items-center gap-md rounded-xl bg-gradient-to-r ${tint} p-md text-white shadow-glow`}
    >
      <span className="relative grid h-2.5 w-2.5 flex-none place-items-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{label}</span>
        <span className="block truncate text-[11px] opacity-90">
          {ride.dropoff_address}
        </span>
      </span>
      <ArrowRightIcon className="h-4 w-4 flex-none" />
    </Link>
  );
}
