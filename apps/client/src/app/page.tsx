import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoHorizontal } from '@/components/Logo';
import { getT } from '@/lib/i18n-server';
import {
  ArrowRightIcon,
  PinIcon,
  PlusIcon,
} from '@/components/Icon';
import { firstNameOf, getCurrentProfile } from '@/lib/session';
import { PARTNER_LOGIN_URL } from '@/lib/siteUrl';
import { createServerSupabase } from '@/lib/supabase-server';
import { UnreadMessagesChip } from '@/components/UnreadMessagesChip';
import { BannerCarousel } from '@/components/BannerCarousel';
import { resolveHomeBanners, type HomeBannerRow } from '@/lib/home-banners';
import { NotificationBell } from '@/components/NotificationBell';
import { ProfileMenu } from '@/components/ProfileMenu';
import { BottomTabBar } from '@/components/BottomTabBar';
import {
  RecentDestinations,
  ShortcutsRow,
  type FavoritePlace,
  type RecentDestination,
} from '@/components/QuickDestinations';

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
 * commande : un seul champ « Où allez-vous ? », les lieux du client sous la
 * main, le solde juste après. Les rubriques secondaires descendent dans
 * /menu, atteignable par la barre d'onglets — dont le bouton central porte
 * la réservation.
 *
 * Aération du 2026-10-01 : plus de salutation ni de décompte de chauffeurs,
 * plus de bouton « Commander maintenant » en double du champ de destination ;
 * la bannière est un carrousel (3 s) des deux visuels de la marque.
 */
export default async function HomePage() {
  const t = getT();
  const profile = await getCurrentProfile();

  // Force onboarding si le profil est loggé mais pas encore complété
  if (profile && (!profile.full_name || DEFAULT_NAMES.has(profile.full_name.trim()))) {
    redirect('/onboarding');
  }

  // Partenaire véhicule : son espace est sur le site web TamCar (plus dans cette application)
  if (profile && profile.role === 'dealer') {
    redirect(PARTNER_LOGIN_URL);
  }

  const firstName = firstNameOf(profile);
  const isLoggedIn = profile !== null;

  let creditBalance = 0;
  let activeRide: ActiveRideRow | null = null;
  let favorites: FavoritePlace[] = [];
  let recents: RecentDestination[] = [];

  const supabase = createServerSupabase();

  // Bannières de l'accueil : pilotées depuis /admin/banners (audience « Client »).
  // Sans aucune bannière active avec image, les deux bannières par défaut du site s'affichent.
  const { data: bannerRows } = await supabase
    .from('home_banners')
    .select('id, title, subtitle, image_url, link_url, cta_text, gradient, is_active, active_from, active_until')
    .eq('audience', 'client')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(10);
  const { banners: homeBanners } = resolveHomeBanners((bannerRows ?? []) as HomeBannerRow[]);

  const personal = isLoggedIn
    ? await Promise.all([
        supabase.rpc('my_wallets'),
        supabase.rpc('my_active_ride'),
        supabase.rpc('my_favorite_places'),
        supabase.rpc('my_recent_destinations', { p_limit: 4 }),
      ])
    : null;

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

  return (
    <main className="relative min-h-dvh bg-gradient-to-b from-primary-50/70 via-white to-white">
      <div className="relative z-10 mx-auto max-w-md px-lg pt-lg">
        <header className="flex items-center justify-between">
          {/* Sous 380 px, seul le sigle reste : la pastille du portefeuille a besoin de la place. */}
          <LogoHorizontal className="max-[380px]:[&>span]:hidden" />
          {profile && (
            <div className="flex items-center gap-sm">
              {/* Portefeuille : montant et petit bouton + pour recharger, à gauche de la cloche. */}
              <Link
                href="/wallet"
                aria-label={`${t('home.credit')} ${formatFcfaHome(creditBalance)} F : ${t('home.recharge')}`}
                className="inline-flex items-center gap-xs whitespace-nowrap rounded-full bg-primary-50 py-0.5 pl-sm pr-0.5 text-sm font-extrabold text-neutral-900 ring-1 ring-primary-100 transition hover:bg-primary-100"
              >
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatFcfaHome(creditBalance)}
                  <span className="ml-0.5 text-xs font-medium text-neutral-500">F</span>
                </span>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-500 text-white">
                  <PlusIcon className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              </Link>
              <NotificationBell />
              <ProfileMenu
                avatarUrl={profile.avatar_url}
                fullName={profile.full_name}
                firstName={firstName ?? ''}
              />
            </div>
          )}
        </header>

        <BannerCarousel banners={homeBanners} aspectClass="aspect-[5/2]" className="mt-lg" />

        {activeRide && (
          <div className="mt-lg">
            <ActiveRideBanner ride={activeRide} t={t} />
          </div>
        )}

        {/* Carte unique : le départ est déduit du GPS, une seule décision. */}
        <section className="mt-lg rounded-[26px] bg-white p-lg shadow-md ring-1 ring-primary-100/60">
          <div className="flex items-center gap-md">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-primary-50 text-primary-500">
              <PinIcon className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <h1 className="text-xl font-extrabold tracking-tight text-neutral-900">
              Où allez-vous&nbsp;?
            </h1>
          </div>

          <Link
            href="/commande"
            className="group mt-md flex w-full items-center gap-md rounded-full bg-white py-xs pl-lg pr-xs text-left ring-2 ring-primary-100 transition hover:ring-primary-300"
          >
            <span className="flex-1 truncate text-[15px] text-neutral-400 group-hover:text-neutral-600">
              Entrez votre destination
            </span>
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-primary-500 text-white shadow-glow">
              <ArrowRightIcon className="h-5 w-5" />
            </span>
          </Link>

          {isLoggedIn && <ShortcutsRow favorites={favorites} />}
        </section>

        {isLoggedIn && <RecentDestinations recents={recents} />}

        {/* Zone du portefeuille retirée (déplacé en haut) : volontairement laissée vide, fond inchangé. */}
        {isLoggedIn && <div aria-hidden className="mt-lg h-20" />}

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
      className={`flex items-center gap-md rounded-2xl bg-gradient-to-r ${tint} p-md text-white shadow-glow`}
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
