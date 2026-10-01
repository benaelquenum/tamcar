'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellIcon } from '@/components/Icon';
import { currentPermission, subscribeToPush } from '@/lib/push-subscribe';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * Cloche de l'en-tête de l'accueil.
 *
 * Il n'existe pas de centre de notifications : la cloche porte donc les deux
 * seules choses réelles qu'elle peut annoncer.
 *   • Notifications du téléphone pas encore autorisées → pastille, et un
 *     toucher lance l'autorisation (même geste que la bannière du haut).
 *   • Messages d'un chauffeur non lus → pastille chiffrée, un toucher ouvre la
 *     course concernée.
 * Sinon, un toucher mène à « Courses » : c'est là que vivent les mises à jour
 * de réservation.
 */
export function NotificationBell() {
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported' | 'loading'>('loading');
  const [unread, setUnread] = useState(0);
  const [rideId, setRideId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await currentPermission();
      if (alive) setPerm(p);
      const { data } = await supabaseBrowser.rpc('my_unread_messages_count');
      if (!alive) return;
      const row = Array.isArray(data)
        ? (data[0] as { unread_count: number; ride_id: string | null } | undefined)
        : undefined;
      setUnread(row?.unread_count ?? 0);
      setRideId(row?.ride_id ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const needsEnable = perm === 'default';
  const cls =
    'relative grid h-11 w-11 place-items-center rounded-full bg-neutral-100 text-neutral-900 transition hover:bg-neutral-200 active:scale-95';

  const badge =
    unread > 0 ? (
      <span
        className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-error px-1 text-[10px] font-bold text-white ring-2 ring-white"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {unread > 9 ? '9+' : unread}
      </span>
    ) : needsEnable ? (
      <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-error ring-2 ring-white" />
    ) : null;

  if (unread > 0 && rideId) {
    return (
      <Link href={`/ride/${rideId}`} aria-label={`${unread} message(s) non lu(s)`} className={cls}>
        <BellIcon className="h-5 w-5" strokeWidth={2.25} />
        {badge}
      </Link>
    );
  }

  if (needsEnable) {
    return (
      <button
        type="button"
        aria-label="Activer les notifications"
        className={cls}
        onClick={async () => {
          setPerm('loading');
          const sub = await subscribeToPush();
          setPerm(sub ? 'granted' : await currentPermission());
        }}
      >
        <BellIcon className="h-5 w-5" strokeWidth={2.25} />
        {badge}
      </button>
    );
  }

  return (
    <Link href="/history" aria-label="Mes courses" className={cls}>
      <BellIcon className="h-5 w-5" strokeWidth={2.25} />
    </Link>
  );
}
