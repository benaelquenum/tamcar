'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { DEADLINE_CATEGORIES, RECURRENCE_LABELS } from '@/lib/bo';

export function NewDeadlineForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);

    const label = String(fd.get('label') || '').trim();
    const dueDate = String(fd.get('due_date') || '');
    if (!label || !dueDate) {
      setError("Renseignez au moins l'intitulé et la date.");
      return;
    }

    setBusy(true);
    const amountRaw = String(fd.get('amount') || '').replace(/\s/g, '');
    const { error: err } = await supabaseBrowser.from('bo_deadlines').insert({
      label,
      category: String(fd.get('category') || 'Autre'),
      due_date: dueDate,
      amount_fcfa: amountRaw ? parseInt(amountRaw, 10) : null,
      recurrence: String(fd.get('recurrence') || 'none'),
      notes: String(fd.get('notes') || '').trim() || null,
    });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    form.reset();
    router.refresh();
    setBusy(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200"
    >
      <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
        Nouvelle échéance
      </h2>

      {error && (
        <div className="mt-md rounded-md bg-error/10 p-md text-sm text-error">
          {error}
        </div>
      )}

      <div className="mt-md flex flex-col gap-md">
        <input
          name="label"
          required
          placeholder="Ex. : Autorisation ANATT — renouvellement"
          className="w-full rounded-lg bg-neutral-50 px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <select
          name="category"
          className="w-full rounded-lg bg-neutral-50 px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {DEADLINE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-md">
          <input
            name="due_date"
            type="date"
            required
            className="w-full rounded-lg bg-neutral-50 px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            name="amount"
            inputMode="numeric"
            placeholder="Montant F (opt.)"
            className="w-full rounded-lg bg-neutral-50 px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          name="recurrence"
          defaultValue="none"
          className="w-full rounded-lg bg-neutral-50 px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <textarea
          name="notes"
          rows={2}
          placeholder="Notes (opt.)"
          className="w-full rounded-lg bg-neutral-50 px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary-500 py-md text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? 'Ajout…' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}
