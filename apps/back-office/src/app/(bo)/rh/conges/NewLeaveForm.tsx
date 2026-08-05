'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { LEAVE_KIND_LABELS, employeeName, type BoEmployee } from '@/lib/rh';

const INPUT =
  'w-full rounded-lg bg-neutral-50 px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500';

/** Jours ouvrables (dimanches exclus) — même règle que bo_working_days. */
function workingDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (end < start) return 0;
  let n = 0;
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) n += 1;
  }
  return n;
}

export function NewLeaveForm({ employees }: { employees: BoEmployee[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const days = workingDays(from, to);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);

    const employeeId = String(fd.get('employee_id') || '');
    if (!employeeId || !from || !to) {
      setError('Choisissez un employé et les dates de congé.');
      return;
    }
    if (days <= 0) {
      setError('La période saisie ne compte aucun jour ouvrable.');
      return;
    }

    setBusy(true);
    const { error: err } = await supabaseBrowser.from('bo_leaves').insert({
      employee_id: employeeId,
      kind: String(fd.get('kind') || 'annuel'),
      start_on: from,
      end_on: to,
      days,
      reason: String(fd.get('reason') || '').trim() || null,
    });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    form.reset();
    setFrom('');
    setTo('');
    router.refresh();
    setBusy(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200"
    >
      <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
        Nouvelle demande
      </h2>

      {error && (
        <div className="mt-md rounded-md bg-error/10 p-md text-sm text-error">
          {error}
        </div>
      )}

      {employees.length === 0 ? (
        <p className="mt-md text-sm text-neutral-500">
          Aucun employé actif au registre.
        </p>
      ) : (
        <div className="mt-md flex flex-col gap-md">
          <select name="employee_id" required className={INPUT}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {employeeName(e)}
              </option>
            ))}
          </select>
          <select name="kind" defaultValue="annuel" className={INPUT}>
            {Object.entries(LEAVE_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-md">
            <input
              type="date"
              value={from}
              onChange={(ev) => setFrom(ev.target.value)}
              required
              className={INPUT}
            />
            <input
              type="date"
              value={to}
              onChange={(ev) => setTo(ev.target.value)}
              required
              className={INPUT}
            />
          </div>
          <p className="text-xs text-neutral-500">
            {days > 0
              ? `${days} jour${days > 1 ? 's' : ''} ouvrable${days > 1 ? 's' : ''} décompté${days > 1 ? 's' : ''}.`
              : 'Sélectionnez les dates pour connaître le décompte.'}
          </p>
          <input name="reason" placeholder="Motif (opt.)" className={INPUT} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-primary-500 py-md text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Enregistrement…' : 'Enregistrer la demande'}
          </button>
        </div>
      )}
    </form>
  );
}
