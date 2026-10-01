import Link from 'next/link';
import {
  BriefcaseIcon,
  ChevronRightIcon,
  ClockIcon,
  HomeIcon,
  PinIcon,
  StarOutlineIcon,
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
 * Les quatre raccourcis (maison, travail, favoris, historique) tiennent sur
 * une seule ligne dans la carte de recherche ; les récentes forment une liste
 * à part, en dessous.
 *
 * Chaque lieu pointe vers /commande avec la destination pré-remplie — les
 * mêmes paramètres que les liens de localisation ouverts depuis WhatsApp,
 * déjà gérés par l'écran de commande.
 */

function destHref(lat: number, lng: number, label: string): string {
  const p = new URLSearchParams({
    dest_lat: String(lat),
    dest_lng: String(lng),
    dest: label,
  });
  return `/commande?${p.toString()}`;
}

function Shortcut({
  href,
  Icon,
  title,
  subtitle,
}: {
  href: string;
  Icon: (props: { className?: string; strokeWidth?: number }) => JSX.Element;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-col items-center gap-xs px-xs text-center transition active:scale-95"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-50 text-primary-500">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="block text-[12px] font-bold leading-tight text-neutral-900">{title}</span>
      <span className="line-clamp-2 block text-[10px] leading-tight text-neutral-400">
        {subtitle}
      </span>
    </Link>
  );
}

/** Maison · Travail · Favoris · Historique, pour la carte « Où allez-vous ? ». */
export function ShortcutsRow({ favorites }: { favorites: FavoritePlace[] }) {
  const home = favorites.find((f) => f.kind === 'home');
  const work = favorites.find((f) => f.kind === 'work');

  return (
    <div className="mt-md grid grid-cols-4 divide-x divide-neutral-200/70 rounded-2xl bg-neutral-100/70 py-md">
      <Shortcut
        href={home ? destHref(home.lat, home.lng, home.label) : '/lieux?kind=home'}
        Icon={HomeIcon}
        title="Maison"
        subtitle={home ? home.address : 'Ajouter une adresse'}
      />
      <Shortcut
        href={work ? destHref(work.lat, work.lng, work.label) : '/lieux?kind=work'}
        Icon={BriefcaseIcon}
        title="Travail"
        subtitle={work ? work.address : 'Ajouter une adresse'}
      />
      <Shortcut href="/lieux" Icon={StarOutlineIcon} title="Favoris" subtitle="Vos lieux enregistrés" />
      <Shortcut href="/history" Icon={ClockIcon} title="Historique" subtitle="Vos dernières courses" />
    </div>
  );
}

/** Dernières destinations (déduites des courses terminées). */
export function RecentDestinations({ recents }: { recents: RecentDestination[] }) {
  if (recents.length === 0) return null;

  return (
    <section className="mt-xl">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold text-neutral-900">Destinations récentes</h2>
        <Link
          href="/history"
          className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary-600"
        >
          Voir tout
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      </div>
      <ul className="mt-md space-y-sm">
        {recents.slice(0, 3).map((r) => (
          <li key={`${r.lat},${r.lng}`}>
            <Link
              href={destHref(r.lat, r.lng, r.address)}
              className="flex items-center gap-md rounded-2xl bg-white px-md py-md shadow-sm ring-1 ring-neutral-100 transition active:scale-[0.99]"
            >
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-primary-50 text-primary-500">
                <PinIcon className="h-5 w-5" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] text-neutral-800">
                {r.address}
              </span>
              <ChevronRightIcon className="h-4 w-4 flex-none text-neutral-400" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
