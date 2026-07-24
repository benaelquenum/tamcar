'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { MessageIcon } from '@/components/Icon';

/**
 * Icône de messages en haut à gauche de l'accueil chauffeur.
 * N'apparaît QUE s'il y a des messages non lus (le RPC exclut déjà les
 * courses terminées / annulées). Ouvre la course concernée au clic.
 */
export function MessagesFab() {
  const [count, setCount] = useState(0);
  const [rideId, setRideId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      const { data } = await supabaseBrowser.rpc('my_unread_messages_count');
      if (!mounted) return;
      const row = Array.isArray(data)
        ? (data[0] as { unread_count: number; ride_id: string | null } | undefined)
        : null;
      setCount(row?.unread_count ?? 0);
      setRideId(row?.ride_id ?? null);
    }
    refresh();
    const channel = supabaseBrowser
      .channel('driver_unread_fab')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_messages' }, () => refresh())
      .subscribe();
    return () => {
      mounted = false;
      supabaseBrowser.removeChannel(channel);
    };
  }, []);

  if (count <= 0 || !rideId) return null;

  return (
    <Link
      href={`/ride/${rideId}`}
      aria-label={`${count} message${count > 1 ? 's' : ''} non lu${count > 1 ? 's' : ''}`}
      className="pointer-events-auto fixed left-4 top-20 z-20 grid h-12 w-12 place-items-center rounded-full bg-white text-primary-700 shadow-lg ring-1 ring-neutral-200 hover:bg-primary-50"
    >
      <MessageIcon className="h-6 w-6" />
      <span className="absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-error px-1 text-[10px] font-extrabold text-white ring-2 ring-white">
        {count > 9 ? '9+' : count}
      </span>
    </Link>
  );
}
