'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { formatDate } from '@/lib/bo';
import {
  LEAVE_KIND_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_STYLES,
  type BoLeave,
} from '@/lib/rh';
import { AlertIcon, CheckIcon } from '@/components/Icon';

export function LeaveList({
  rows,
  names,
}: {
  rows: BoLeave[];
  names: Record<string, string>;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, status: 'approuve' | 'refuse') {
    setBusyId(id);
    setError(null);
    const { error: err } = await supabaseBrowser.rpc('bo_decide_leave', {
      p_id: id,
      p_status: status,
    });
    if (err) setError(err.message);
    router.refresh();
    setBusyId(null);
  }

  const pending = rows.filter((l) => l.status === 'demande');
  const decided = rows.filter((l) => l.status !== 'demande');

  return (
    <div>
      {error && (
        <div className="mb-md rounded-md bg-error/10 p-md text-sm text-error">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        <div className="border-b border-neutral-100 px-lg py-md">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
            Demandes à traiter
          </h2>
        </div>
        {pending.length === 0 ? (
          <p className="p-xl text-center text-sm text-neutral-500">
            Aucune demande en attente.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {pending.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-md px-lg py-md"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-900">
                    {names[l.employee_id] ?? 'Employé'}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {LEAVE_KIND_LABELS[l.kind]} — du {formatDate(l.start_on)} au{' '}
                    {formatDate(l.end_on)} ({l.days} j ouvrables)
                    {l.reason ? ` — ${l.reason}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-sm">
                  <button
                    type="button"
                    disabled={busyId === l.id}
                    onClick={() => decide(l.id, 'approuve')}
                    title="Approuver"
                    className="grid h-8 w-8 place-items-center rounded-full bg-success/10 text-success transition hover:bg-success hover:text-white disabled:opacity-50"
                  >
                    <CheckIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busyId === l.id}
                    onClick={() => decide(l.id, 'refuse')}
                    title="Refuser"
                    className="grid h-8 w-8 place-items-center rounded-full bg-error/10 text-error transition hover:bg-error hover:text-white disabled:opacity-50"
                  >
                    <AlertIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {decided.length > 0 && (
        <div className="mt-lg overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
          <div className="border-b border-neutral-100 px-lg py-md">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
              Historique
            </h2>
          </div>
          <ul className="divide-y divide-neutral-100">
            {decided.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-md px-lg py-sm"
              >
                <p className="min-w-0 truncate text-sm text-neutral-700">
                  <span className="font-semibold text-neutral-900">
                    {names[l.employee_id] ?? 'Employé'}
                  </span>{' '}
                  — {LEAVE_KIND_LABELS[l.kind]}, du {formatDate(l.start_on)} au{' '}
                  {formatDate(l.end_on)} ({l.days} j)
                </p>
                <span
                  className={`shrink-0 rounded-full px-md py-xs text-xs font-bold ${LEAVE_STATUS_STYLES[l.status]}`}
                >
                  {LEAVE_STATUS_LABELS[l.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
