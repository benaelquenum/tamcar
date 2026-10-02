'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useVisibleInterval } from '@/lib/useVisibleInterval';
import { CalendarIcon, ClockIcon } from './Icon';

type Rental = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  block_from: string;
  hours: number;
  pickup_address: string;
  client_first_name: string | null;
};

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * Location VIP : bandeau « véhicule réservé » pendant la location (et le tampon qui la
 * précède), sinon rappel de la prochaine location. Pendant la fenêtre de blocage, le
 * serveur met le véhicule hors ligne et ne propose plus de courses.
 */
export function RentalBanner({ onBlocked }: { onBlocked?: () => void }) {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const onBlockedRef = useRef(onBlocked);
  onBlockedRef.current = onBlocked;

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser.rpc('driver_my_vehicle_rentals', { p_scope: 'upcoming' });
    // Base pas encore à jour : pas de bandeau, rien d'autre.
    if (!error && Array.isArray(data)) setRentals(data as Rental[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useVisibleInterval(() => void load(), 120_000);
  useVisibleInterval(() => setNow(Date.now()), 30_000);

  const current = rentals.find(
    (r) => now >= new Date(r.block_from).getTime() && now < new Date(r.ends_at).getTime(),
  );
  const next = rentals.find((r) => !current || r.id !== current.id);
  const nextSoon = next && new Date(next.starts_at).getTime() - now < 48 * 3_600_000 ? next : null;

  const currentId = current?.id ?? null;
  useEffect(() => {
    if (currentId) onBlockedRef.current?.();
  }, [currentId]);

  if (current) {
    const started = now >= new Date(current.starts_at).getTime();
    return (
      <Link
        href="/reservations"
        className="mb-md block rounded-xl bg-neutral-900 p-md text-white shadow-md"
      >
        <p className="flex items-center gap-xs text-xs font-bold uppercase tracking-wider text-gold-500">
          <ClockIcon className="h-3.5 w-3.5" />
          Véhicule réservé · location VIP
        </p>
        <p className="mt-xs text-sm font-bold">
          {started
            ? `Jusqu’à ${hhmm(current.ends_at)} · ${current.client_first_name ?? 'client'}`
            : `Début à ${hhmm(current.starts_at)} · ${current.client_first_name ?? 'client'}`}
        </p>
        <p className="mt-xs text-xs text-white/70">
          Vous ne recevez plus de demandes de course. {current.pickup_address}
        </p>
      </Link>
    );
  }

  if (nextSoon) {
    return (
      <Link
        href="/reservations"
        className="mb-md block rounded-xl border border-violet-500/30 bg-violet-500/10 p-md"
      >
        <p className="flex items-center gap-xs text-xs font-bold uppercase tracking-wider text-violet-700">
          <CalendarIcon className="h-3.5 w-3.5" />
          Prochaine location VIP
        </p>
        <p className="mt-xs text-sm font-bold text-neutral-900">
          {dayLabel(nextSoon.starts_at)} à {hhmm(nextSoon.starts_at)} · {nextSoon.hours} h
          {nextSoon.client_first_name ? ` · ${nextSoon.client_first_name}` : ''}
        </p>
        <p className="mt-xs text-xs text-neutral-600">
          Plus de demandes de course dès {hhmm(nextSoon.block_from)}. {nextSoon.pickup_address}
        </p>
      </Link>
    );
  }

  return null;
}
