'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOutIcon } from '@/components/Icon';
import { logout } from '@/app/login/actions';

const NAV: { href: string; label: string; exact?: boolean }[] = [
  { href: '/admin', label: 'Tableau de bord', exact: true },
  { href: '/admin/rides', label: 'Courses' },
  { href: '/admin/drivers', label: 'Chauffeurs' },
  { href: '/admin/dealers', label: 'Partenaires véhicule' },
  { href: '/admin/vehicles', label: 'Véhicules' },
  { href: '/admin/candidatures', label: 'Rendez-vous' },
  { href: '/admin/dealer-advances', label: 'ADR' },
  { href: '/admin/litiges', label: 'Litiges' },
  { href: '/admin/promos', label: 'Promos' },
  { href: '/admin/banners', label: 'Bannières' },
  { href: '/admin/places', label: 'Lieux' },
];

export function AdminSidebar({ fullName }: { fullName: string }) {
  const pathname = usePathname();

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
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`block rounded-lg px-md py-sm text-sm font-semibold transition ${
                    active
                      ? 'bg-white text-primary-700'
                      : 'text-white/85 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.label}
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
