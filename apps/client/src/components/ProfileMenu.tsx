'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { CalendarIcon, PassIcon, HistoryIcon, WalletIcon, UserIcon } from '@/components/Icon';

type Props = {
  avatarUrl: string | null;
  fullName: string | null;
  firstName: string;
};

const ITEMS: { href: string; label: string; Icon: typeof CalendarIcon }[] = [
  { href: '/history', label: 'Mes réservations', Icon: CalendarIcon },
  { href: '/tampass', label: 'Mes abonnements TamPass', Icon: PassIcon },
  { href: '/history', label: 'Historique', Icon: HistoryIcon },
  { href: '/wallet', label: 'Wallet / Crédit', Icon: WalletIcon },
  { href: '/compte', label: 'Mon compte', Icon: UserIcon },
];

export function ProfileMenu({ avatarUrl, fullName, firstName }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu du compte"
        aria-expanded={open}
        className="flex items-center gap-sm rounded-full bg-white p-xs pr-md shadow-md ring-1 ring-neutral-200 transition hover:shadow-lg"
      >
        <Avatar src={avatarUrl} name={fullName ?? undefined} size={36} />
        <span className="hidden text-sm font-bold text-neutral-900 sm:inline">
          {firstName || 'Compte'}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-xs w-64 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200">
          <ul className="py-xs">
            {ITEMS.map((it) => (
              <li key={it.label}>
                <Link
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-md px-md py-sm text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50"
                >
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-primary-50 text-primary-700">
                    <it.Icon className="h-4 w-4" />
                  </span>
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
