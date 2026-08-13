import Link from 'next/link';
import {
  BriefcaseIcon,
  ClockIcon,
  HomeIcon,
  PinIcon,
  PlusIcon,
  StarIcon,
} from '@/components/Icon';

export type FavoritePlace = {
  id: string;
  kind: 'home' | 'work' | 'other';
  label: string;
  address: string;
  lat: number;
  lng: number;
};

export type RecentDestination = {
  address: string;
  lat: number;
  lng: number;
};

/**
 * Raccourcis de destination de l'accueil.
 *
 * Favoris et récentes sont DEUX choses : les premiers sont enregistrés
 * explicitement et nommés, les secondes déduites des courses terminées.
 * On les affiche dans cet ordre, sans les mélanger sous un titre unique.
 *
 * Chaque carte pointe vers /commande avec la destination pré-remplie —
 * les mêmes paramètres que les liens de localisation ouverts depuis
 * WhatsApp, déjà gérés par l'écran de commande.
 */

function destHref(lat: number, lng: number, label: string): string {
  const p = new URLSearchParams({
    dest_lat: String(lat),
    dest_lng: String(lng),
    dest: label,
  });
  return `/commande?${p.toString()}`;
}

function iconFor(kind: FavoritePlace['kind']) {
  if (kind === 'home') return HomeIcon;
  if (kind === 'work') return BriefcaseIcon;
  return StarIcon;
}

function Card({
  href,
  Icon,
  title,
  subtitle,
}: {
  href: string;
  Icon: (props: { className?: string }) => JSX.Element;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-[9.5rem] flex-none items-center gap-sm rounded-xl border border-neutral-200 bg-white p-md shadow-sm transition hover:border-primary-300 hover:shadow-md"
    >
      <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-primary-50 text-primary-700">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-neutral-900">{title}</span>
        <span className="block truncate text-[11px] text-neutral-500">{subtitle}</span>
      </span>
    </Link>
  );
}

export function QuickDestinations({
  favorites,
  recents,
}: {
  favorites: FavoritePlace[];
  recents: RecentDestination[];
}) {
  const hasHome = favorites.some((f) => f.kind === 'home');
  const hasWork = favorites.some((f) => f.kind === 'work');

  if (favorites.length === 0 && recents.length === 0) {
    // Premier lancement : on invite à enregistrer plutôt que d'afficher un vide.
    return (
      <section className="mt-lg">
        <Link
          href="/lieux"
          className="flex items-center gap-md rounded-xl border border-dashed border-neutral-300 bg-white p-md text-left transition hover:border-primary-300"
        >
          <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-primary-50 text-primary-700">
            <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-bold text-neutral-900">
              Enregistrez votre maison
            </span>
            <span className="block text-[11px] text-neutral-500">
              Une adresse enregistrée, c&apos;est une course en deux touches.
            </span>
          </span>
        </Link>
      </section>
    );
  }

  return (
    <>
      {favorites.length > 0 && (
        <section className="mt-lg">
          <div className="mb-sm flex items-baseline justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Mes lieux
            </h2>
            <Link href="/lieux" className="text-xs font-semibold text-primary-700">
              Gérer
            </Link>
          </div>
          <div className="-mx-lg flex gap-sm overflow-x-auto px-lg pb-xs">
            {favorites.map((f) => {
              const Icon = iconFor(f.kind);
              return (
                <Card
                  key={f.id}
                  href={destHref(f.lat, f.lng, f.label)}
                  Icon={Icon}
                  title={f.label}
                  subtitle={f.address}
                />
              );
            })}
            {/* Domicile et travail absents : on propose de les définir, ce
                sont les deux qui font gagner le plus de temps. */}
            {!hasHome && (
              <Card href="/lieux?kind=home" Icon={HomeIcon} title="Maison" subtitle="À définir" />
            )}
            {!hasWork && (
              <Card href="/lieux?kind=work" Icon={BriefcaseIcon} title="Travail" subtitle="À définir" />
            )}
          </div>
        </section>
      )}

      {recents.length > 0 && (
        <section className="mt-lg">
          <div className="mb-sm flex items-baseline justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Destinations récentes
            </h2>
            <Link href="/history" className="text-xs font-semibold text-primary-700">
              Voir tout
            </Link>
          </div>
          <ul className="space-y-xs">
            {recents.slice(0, 3).map((r) => (
              <li key={`${r.lat},${r.lng}`}>
                <Link
                  href={destHref(r.lat, r.lng, r.address)}
                  className="flex items-center gap-sm rounded-xl border border-neutral-200 bg-white px-md py-sm transition hover:border-primary-300"
                >
                  <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-neutral-100 text-neutral-500">
                    <ClockIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">
                    {r.address}
                  </span>
                  <PinIcon className="h-4 w-4 flex-none text-neutral-300" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
