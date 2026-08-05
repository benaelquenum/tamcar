'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export function ExitEmployeeForm({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const exitOn = String(fd.get('exit_on') || '');
    const reason = String(fd.get('exit_reason') || '').trim();
    if (!exitOn) {
      setError('Renseignez la date de sortie.');
      return;
    }

    setBusy(true);
    const { error: err } = await supabaseBrowser
      .from('bo_employees')
      .update({ status: 'sorti', exit_on: exitOn, exit_reason: reason || null })
      .eq('id', employeeId);
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    setOpen(false);
    router.refresh();
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-lg text-xs font-bold text-neutral-400 transition hover:text-error"
      >
        Enregistrer une sortie des effectifs
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-lg rounded-xl bg-white p-lg shadow-sm ring-1 ring-error/30"
    >
      <h2 className="text-sm font-extrabold uppercase tracking-wider text-error">
        Sortie des effectifs
      </h2>
      <p className="mt-xs text-xs text-neutral-500">
        L&apos;employé reste au registre et ses bulletins sont conservés ; il
        n&apos;apparaîtra simplement plus dans la paie des mois suivants.
      </p>

      {error && (
        <div className="mt-md rounded-md bg-error/10 p-md text-sm text-error">
          {error}
        </div>
      )}

      <div className="mt-md flex flex-col gap-md sm:flex-row">
        <input
          name="exit_on"
          type="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="rounded-lg bg-neutral-50 px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <input
          name="exit_reason"
          placeholder="Motif (démission, fin de CDD, licenciement…)"
          className="w-full rounded-lg bg-neutral-50 px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-lg bg-error px-lg py-md text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? 'Enregistrement…' : 'Confirmer'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 rounded-lg px-lg py-md text-sm font-bold text-neutral-500 hover:text-neutral-800"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
