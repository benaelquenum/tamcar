'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { CalendarIcon, PassIcon, HistoryIcon, WalletIcon, UserIcon, MenuIcon } from '@/components/Icon';

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
        className="grid h-11 w-11 place-items-center rounded-full bg-neutral-100 text-neutral-900 transition hover:bg-neutral-200 active:scale-95"
      >
        <MenuIcon className="h-5 w-5" strokeWidth={2.25} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-xs w-64 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200">
          <div className="flex items-center gap-md border-b border-neutral-100 px-md py-md">
            <Avatar src={avatarUrl} name={fullName ?? undefined} size={36} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-neutral-900">
              {fullName || firstName || 'Mon compte'}
            </span>
          </div>
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
