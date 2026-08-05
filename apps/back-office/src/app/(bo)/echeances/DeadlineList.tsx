'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import {
  RECURRENCE_LABELS,
  formatDate,
  formatFcfa,
  type BoDeadline,
} from '@/lib/bo';
import { CheckIcon } from '@/components/Icon';

export function DeadlineList({
  pending,
  done,
}: {
  pending: BoDeadline[];
  done: BoDeadline[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function complete(id: string) {
    setBusyId(id);
    setError(null);
    const { error: err } = await supabaseBrowser.rpc('bo_complete_deadline', {
      p_id: id,
    });
    if (err) setError(err.message);
    router.refresh();
    setBusyId(null);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      {error && (
        <div className="mb-md rounded-md bg-error/10 p-md text-sm text-error">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        {pending.length === 0 ? (
          <p className="p-xl text-center text-sm text-neutral-500">
            Aucune échéance en attente. Ajoutez-en une à droite.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {pending.map((d) => {
              const late = d.due_date < today;
              return (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-md px-lg py-md"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">
                      {d.label}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {d.category} — {RECURRENCE_LABELS[d.recurrence]}
                      {d.amount_fcfa ? ` — ${formatFcfa(d.amount_fcfa)} F` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-md">
                    <span
                      className={`rounded-full px-md py-xs text-xs font-bold ${
                        late ? 'bg-error/10 text-error' : 'bg-info/10 text-info'
                      }`}
                    >
                      {late ? 'En retard — ' : ''}
                      {formatDate(d.due_date)}
                    </span>
                    <button
                      type="button"
                      disabled={busyId === d.id}
                      onClick={() => complete(d.id)}
                      title="Marquer comme faite"
                      className="grid h-8 w-8 place-items-center rounded-full bg-success/10 text-success transition hover:bg-success hover:text-white disabled:opacity-50"
                    >
                      <CheckIcon className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {done.length > 0 && (
        <div className="mt-lg">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-neutral-400">
            Faites récemment
          </h2>
          <ul className="mt-sm space-y-xs">
            {done.map((d) => (
              <li key={d.id} className="text-xs text-neutral-500">
                <span className="font-semibold text-neutral-600">{d.label}</span>{' '}
                — faite le {formatDate(d.done_at)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
