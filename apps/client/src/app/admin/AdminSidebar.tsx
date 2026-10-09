'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOutIcon, MenuIcon } from '@/components/Icon';
import { logout } from '@/app/login/actions';
import { useAdminAlerts, type AdminCounts } from './AdminAlerts';
import { SITE_URL } from '@/lib/siteUrl';
import { GuideLauncher } from './guide/GuideLauncher';

const NAV: { href: string; label: string; exact?: boolean; badge?: keyof AdminCounts; external?: boolean }[] = [
  { href: '/admin', label: 'Tableau de bord', exact: true },
  { href: '/admin/sos', label: 'SOS', badge: 'sos_active' },
  { href: '/admin/rides', label: 'Courses' },
  { href: '/admin/drivers', label: 'Chauffeurs' },
  { href: '/admin/carte', label: 'Carte en direct' },
  { href: '/admin/dealers', label: 'Partenaires véhicule' },
  // Simulateur de gains : hébergé par le site (derrière connexion), pour préparer les propositions aux prospects
  { href: `${SITE_URL}/connexion?next=/espace/simulateur`, label: 'Simulateur partenaires', external: true },
  { href: '/admin/vehicles', label: 'Véhicules' },
  { href: '/admin/locations', label: 'Locations VIP' },
  { href: '/admin/candidatures', label: 'Rendez-vous' },
  { href: '/admin/dealer-advances', label: 'ADR' },
  { href: '/admin/ops', label: 'Responsables ville' },
  { href: '/admin/dettes', label: 'Dettes chauffeur', badge: 'debts' },
  { href: '/admin/bonus', label: 'Bonus chauffeur' },
  { href: '/admin/retraits', label: 'Retraits chauffeur' },
  { href: '/admin/tamassur', label: 'Retraits TamAssur', badge: 'tamassur' },
  { href: '/admin/promos', label: 'Promos' },
  { href: '/admin/banners', label: 'Bannières' },
  { href: '/admin/places', label: 'Lieux' },
  { href: '/admin/sauvegardes', label: 'Sauvegardes' },
];

export function AdminSidebar({ fullName }: { fullName: string }) {
  const pathname = usePathname();
  const { counts } = useAdminAlerts();
  // Téléphone : la barre latérale devient un tiroir ouvert par un bouton en bas à gauche (les bandeaux SOS / son, fixés en haut,
  // recouvriraient une barre supérieure). À partir de 768 px, barre latérale fixe comme avant.
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const todo = (counts.sos_active || 0) + (counts.debts || 0) + (counts.tamassur || 0);

  return (
    <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={todo > 0 ? `Ouvrir le menu (${todo} à traiter)` : 'Ouvrir le menu'}
      className="fixed bottom-md left-md z-[60] grid h-12 w-12 place-items-center rounded-full bg-primary-700 text-white shadow-xl ring-2 ring-white md:hidden"
    >
      <MenuIcon className="h-6 w-6" />
      {todo > 0 && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-error px-1 text-[10px] font-extrabold text-white ring-2 ring-white">
          {todo > 99 ? '99+' : todo}
        </span>
      )}
    </button>
    {open && <div className="fixed inset-0 z-[61] bg-neutral-900/50 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
    <aside
      className={`fixed inset-y-0 left-0 z-[62] flex w-64 flex-col bg-primary-700 text-white transition-transform md:sticky md:top-0 md:z-auto md:h-dvh md:w-56 md:shrink-0 md:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex items-center gap-sm border-b border-white/15 px-lg py-md">
        <Link href="/admin" aria-label="Tableau de bord admin">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.png" alt="TamCar" className="h-7 w-auto" />
        </Link>
        <span className="rounded-full bg-white/20 px-sm py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Admin
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fermer le menu"
          className="ml-auto rounded-full px-sm py-xs text-lg leading-none text-white/80 hover:bg-white/10 md:hidden"
        >
          ✕
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-sm py-md">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = item.external ? false : item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const n = item.badge ? counts[item.badge] : 0;
            // SOS non pris en charge : le badge clignote
            const urgent = item.badge === 'sos_active' && counts.sos > 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center justify-between gap-sm rounded-lg px-md py-sm text-sm font-semibold transition ${
                    active
                      ? 'bg-white text-primary-700'
                      : 'text-white/85 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  {n > 0 && (
                    <span
                      className={`min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[11px] font-extrabold leading-none text-white ${
                        urgent ? 'animate-pulse bg-error ring-2 ring-white' : 'bg-error'
                      }`}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                      aria-label={`${n} à traiter`}
                    >
                      {n > 99 ? '99+' : n}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/15 px-sm py-md">
        <GuideLauncher />
        <Link
          href="/compte"
          className="block truncate rounded-lg px-md py-sm text-xs text-white/75 hover:bg-white/10 hover:text-white"
          title={fullName}
        >
          {fullName}
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="mt-xs flex w-full items-center gap-xs rounded-lg px-md py-sm text-xs font-semibold text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            <LogOutIcon className="h-3.5 w-3.5" />
            Déconnexion
          </button>
        </form>
      </div>
    </aside>
    </>
  );
}
