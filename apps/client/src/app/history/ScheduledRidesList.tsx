'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

type Scheduled = {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  scheduled_at: string;
  price_total_fcfa: number;
  requested_category: string | null;
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

const CAT_LABEL: Record<string, string> = {
  moto: 'Moto',
  tricycle: 'Tricycle',
  essentiel: 'Essentiel',
  confort: 'Confort',
};

export function ScheduledRidesList({ initial, justScheduled }: { initial: Scheduled[]; justScheduled: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<Scheduled[]>(initial);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function handleCancel(id: string) {
    if (cancellingId) return;
    if (!confirm('Annuler cette réservation ? Gratuit tant que le chauffeur n\'a pas été appelé.')) return;
    setCancellingId(id);
    const { error } = await supabaseBrowser.rpc('cancel_scheduled_ride', { p_ride_id: id });
    setCancellingId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setItems((prev) => prev.filter((r) => r.id !== id));
    router.refresh();
  }

  if (items.length === 0 && !justScheduled) return null;

  return (
    <section className="mt-lg">
      {justScheduled && items.length > 0 && (
        <div className="mb-md rounded-xl bg-primary-500 p-md text-white shadow-glow">
          <p className="text-sm font-bold">✓ Réservation enregistrée</p>
          <p className="mt-xs text-xs">
            Un chauffeur te sera assigné automatiquement 15 min avant le départ.
          </p>
        </div>
      )}

      <h2 className="mb-md text-xs font-bold uppercase tracking-wider text-violet-700">
        📅 Réservations à venir ({items.length})
      </h2>

      <ul className="space-y-sm">
        {items.map((r) => (
          <li key={r.id} className="rounded-xl bg-white p-md shadow-sm ring-1 ring-violet-500/30">
            <div className="flex items-baseline justify-between gap-sm">
              <p className="text-sm font-bold text-violet-700">{fmtDate(r.scheduled_at)}</p>
              <p className="text-sm font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtFcfa(r.price_total_fcfa)} F
              </p>
            </div>
            {r.requested_category && (
              <p className="mt-xs text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                {CAT_LABEL[r.requested_category] ?? r.requested_category}
              </p>
            )}
            <p className="mt-sm truncate text-xs text-neutral-700">{r.pickup_address}</p>
            <p className="truncate text-xs text-neutral-500">→ {r.dropoff_address}</p>
            <button
              type="button"
              onClick={() => handleCancel(r.id)}
              disabled={cancellingId === r.id}
              className="mt-md w-full rounded-lg bg-neutral-100 py-xs text-[11px] font-bold text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
            >
              {cancellingId === r.id ? 'Annulation…' : 'Annuler la réservation'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
