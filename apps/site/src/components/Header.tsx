'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV = [
  { href: '/clients', label: 'Clients' },
  { href: '/chauffeurs', label: 'Chauffeurs' },
  { href: '/partenaires', label: 'Partenaires' },
  { href: '/contact', label: 'Contact' },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/70 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-lg px-lg py-md">
        <Link href="/" aria-label="TamCar, accueil" className="flex-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="TamCar" className="h-10 w-auto" />
        </Link>

        <nav className="hidden items-center gap-xl md:flex" aria-label="Navigation principale">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`text-sm font-semibold transition hover:text-primary-500 ${active ? 'text-primary-600' : 'text-neutral-900'}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-sm">
          <Link
            href="/connexion"
            className="hidden rounded-full bg-gradient-to-r from-primary-500 to-primary-700 px-lg py-sm text-sm font-bold text-white shadow-glow transition hover:brightness-110 sm:inline-block"
          >
            Espace partenaire
          </Link>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-neutral-200 md:hidden"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="relative block h-3 w-5">
              <span className={`absolute left-0 top-0 h-0.5 w-5 bg-neutral-900 transition ${open ? 'translate-y-[5px] rotate-45' : ''}`} />
              <span className={`absolute left-0 top-[5px] h-0.5 w-5 bg-neutral-900 transition ${open ? 'opacity-0' : ''}`} />
              <span className={`absolute left-0 top-[10px] h-0.5 w-5 bg-neutral-900 transition ${open ? '-translate-y-[5px] -rotate-45' : ''}`} />
            </span>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-neutral-200 bg-white px-lg py-md md:hidden" aria-label="Navigation mobile">
          <ul className="space-y-xs">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-md py-sm text-base font-semibold text-neutral-900 hover:bg-primary-50"
                >
                  {n.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/connexion"
                onClick={() => setOpen(false)}
                className="mt-sm block rounded-lg bg-primary-500 px-md py-sm text-center text-base font-bold text-white"
              >
                Espace partenaire
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
