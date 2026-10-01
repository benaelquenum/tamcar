'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarIcon,
  HomeIcon,
  MenuIcon,
  PinIcon,
  WalletIcon,
} from '@/components/Icon';

/**
 * Barre d'onglets du client.
 *
 * Cinq emplacements pour une dizaine de rubriques : le choix a été arbitré
 * avec Terence le 2026-08-13.
 *   • « Courses » fusionne l'historique et les réservations à venir — une
 *     réservation EST une course future, les séparer avait rendu les tests
 *     confus.
 *   • Le bouton central porte la RÉSERVATION, pas la commande immédiate,
 *     qui a déjà son grand bouton sur l'accueil. Sans quoi deux actions
 *     primaires pour la même chose, et la réservation sans porte d'entrée.
 *   • Le portefeuille est au premier niveau : c'est le nerf du modèle
 *     cash/crédit et le déclencheur des recharges.
 *   • L'aide descend dans « Menu » : c'est un lien WhatsApp, peu fréquent.
 */

type Tab = {
  href: string;
  label: string;
  Icon: (props: { className?: string; strokeWidth?: number }) => JSX.Element;
  /** Préfixes considérés comme « dans cet onglet ». */
  match: string[];
};

const LEFT: Tab[] = [
  { href: '/', label: 'Accueil', Icon: HomeIcon, match: ['/'] },
  { href: '/history', label: 'Courses', Icon: PinIcon, match: ['/history', '/reservation', '/ride'] },
];

const RIGHT: Tab[] = [
  { href: '/wallet', label: 'Portefeuille', Icon: WalletIcon, match: ['/wallet'] },
  { href: '/menu', label: 'Menu', Icon: MenuIcon, match: ['/menu', '/compte', '/tampass', '/parrainer', '/chauffeurs'] },
];

function isActive(pathname: string, tab: Tab): boolean {
  return tab.match.some((m) => (m === '/' ? pathname === '/' : pathname.startsWith(m)));
}

function TabLink({ tab, pathname }: { tab: Tab; pathname: string }) {
  const active = isActive(pathname, tab);
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className="relative flex flex-1 flex-col items-center gap-0.5 py-sm"
    >
      {active && (
        <span className="absolute -top-px h-0.5 w-8 rounded-full bg-primary-500" />
      )}
      <tab.Icon
        className={`h-6 w-6 ${active ? 'text-primary-500' : 'text-neutral-400'}`}
        strokeWidth={active ? 2.5 : 2}
      />
      <span
        className={`text-[11px] font-semibold ${
          active ? 'text-primary-500' : 'text-neutral-500'
        }`}
      >
        {tab.label}
      </span>
    </Link>
  );
}

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <>
      {/* Réserve la hauteur de la barre : sans quoi le dernier élément de
          chaque page passe dessous, y compris sur les petits écrans. */}
      <div aria-hidden className="h-[76px]" />

      <nav className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-neutral-100 bg-white/95 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="mx-auto flex max-w-md items-stretch px-sm pb-[env(safe-area-inset-bottom)]">
          {LEFT.map((tab) => (
            <TabLink key={tab.href} tab={tab} pathname={pathname} />
          ))}

          {/* Bouton central : réserver à l'avance. Pas de libellé sous le
              bouton — l'icône calendrier et l'aria-label suffisent. Le bloc
              conserve sa largeur pour ménager la place entre les onglets. */}
          <div className="relative w-[4.5rem] flex-none">
            <Link
              href="/commande?scheduled=1"
              aria-label="Réserver une course à l'avance"
              className="absolute -top-6 left-1/2 grid h-16 w-16 -translate-x-1/2 place-items-center rounded-full bg-primary-500 text-white shadow-glow ring-4 ring-white transition active:scale-95"
            >
              <CalendarIcon className="h-7 w-7" />
            </Link>
          </div>

          {RIGHT.map((tab) => (
            <TabLink key={tab.href} tab={tab} pathname={pathname} />
          ))}
        </div>
      </nav>
    </>
  );
}
