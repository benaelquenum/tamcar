'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * Bulle globale « messages non lus » affichée sur l'accueil chauffeur.
 * Compte via my_unread_messages_count + rafraîchissement temps réel sur
 * ride_messages (RLS restreint aux courses de l'utilisateur). Masquée si 0.
 */
export function UnreadMessagesChip({ bottomClass = 'bottom-28' }: { bottomClass?: string }) {
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
      .channel('global_unread_messages')
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
      className={`fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-sm rounded-full bg-primary-600 px-lg py-sm text-sm font-bold text-white shadow-glow ring-2 ring-white ${bottomClass}`}
    >
      <span aria-hidden>💬</span>
      {count} nouveau{count > 1 ? 'x' : ''} message{count > 1 ? 's' : ''}
      <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-white px-1 text-xs font-extrabold text-primary-700">
        {count > 9 ? '9+' : count}
      </span>
    </Link>
  );
}
