'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { PaperclipIcon } from '@/components/Icon';

type DocOption = {
  id: string;
  reg_number: string;
  title: string;
};

export function AttachDocumentForm({
  employeeId,
  documents,
}: {
  employeeId: string;
  documents: DocOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const documentId = String(fd.get('document_id') || '');
    if (!documentId) {
      setError('Choisissez une pièce à rattacher.');
      return;
    }

    setBusy(true);
    const { error: err } = await supabaseBrowser
      .from('bo_employee_documents')
      .insert({
        employee_id: employeeId,
        document_id: documentId,
        note: String(fd.get('note') || '').trim() || null,
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

  if (documents.length === 0) {
    return (
      <p className="mt-md text-xs text-neutral-400">
        Toutes les pièces enregistrées sont déjà rattachées, ou la GED est vide.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-lg border-t border-neutral-100 pt-md">
      {error && (
        <div className="mb-md rounded-md bg-error/10 p-md text-sm text-error">
          {error}
        </div>
      )}
      <div className="flex flex-col gap-md sm:flex-row">
        <select
          name="document_id"
          defaultValue=""
          className="w-full rounded-lg bg-neutral-50 px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Rattacher une pièce du coffre…</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.reg_number} — {d.title}
            </option>
          ))}
        </select>
        <input
          name="note"
          placeholder="Note (opt.)"
          className="w-full rounded-lg bg-neutral-50 px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500 sm:w-56"
        />
        <button
          type="submit"
          disabled={busy}
          className="flex shrink-0 items-center justify-center gap-sm rounded-lg bg-neutral-900 px-lg py-md text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          <PaperclipIcon className="h-4 w-4" />
          {busy ? 'Ajout…' : 'Rattacher'}
        </button>
      </div>
    </form>
  );
}
