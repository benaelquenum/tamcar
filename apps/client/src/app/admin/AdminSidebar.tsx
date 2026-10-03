'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOutIcon } from '@/components/Icon';
import { logout } from '@/app/login/actions';
import { useAdminAlerts, type AdminCounts } from './AdminAlerts';

const NAV: { href: string; label: string; exact?: boolean; badge?: keyof AdminCounts }[] = [
  { href: '/admin', label: 'Tableau de bord', exact: true },
  { href: '/admin/sos', label: 'SOS', badge: 'sos_active' },
  { href: '/admin/rides', label: 'Courses' },
  { href: '/admin/drivers', label: 'Chauffeurs' },
  { href: '/admin/carte', label: 'Carte en direct' },
  { href: '/admin/dealers', label: 'Partenaires véhicule' },
  { href: '/admin/vehicles', label: 'Véhicules' },
  { href: '/admin/locations', label: 'Locations VIP' },
  { href: '/admin/candidatures', label: 'Rendez-vous' },
  { href: '/admin/dealer-advances', label: 'ADR' },
  { href: '/admin/ops', label: 'Responsables ville' },
  { href: '/admin/litiges', label: 'Litiges', badge: 'disputes' },
  { href: '/admin/dettes', label: 'Dettes chauffeur', badge: 'debts' },
  { href: '/admin/tamassur', label: 'Retraits TamAssur' },
  { href: '/admin/promos', label: 'Promos' },
  { href: '/admin/banners', label: 'Bannières' },
  { href: '/admin/places', label: 'Lieux' },
  { href: '/admin/sauvegardes', label: 'Sauvegardes' },
];

export function AdminSidebar({ fullName }: { fullName: string }) {
  const pathname = usePathname();
  const { counts } = useAdminAlerts();

  return (
    <aside className="sticky top-0 flex h-dvh w-56 shrink-0 flex-col bg-primary-700 text-white">
      <div className="flex items-center gap-sm border-b border-white/15 px-lg py-md">
        <Link href="/admin" aria-label="Tableau de bord admin">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.png" alt="TamCar" className="h-7 w-auto" />
        </Link>
        <span className="rounded-full bg-white/20 px-sm py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Admin
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-sm py-md">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const n = item.badge ? counts[item.badge] : 0;
            // SOS non pris en charge : le badge clignote
            const urgent = item.badge === 'sos_active' && counts.sos > 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
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
  );
}
