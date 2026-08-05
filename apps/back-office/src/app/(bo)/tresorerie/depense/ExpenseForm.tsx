'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { PAYMENT_ACCOUNTS, type BoExpenseCategory } from '@/lib/bo';

const MAX_SIZE = 25 * 1024 * 1024;

export function ExpenseForm({
  categories,
}: {
  categories: BoExpenseCategory[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    const amountRaw = String(fd.get('amount') || '').replace(/\s/g, '');
    const amount = parseInt(amountRaw, 10);
    const date = String(fd.get('date') || '');
    const category = String(fd.get('category') || '');
    const supplier = String(fd.get('supplier') || '').trim();
    const payment = String(fd.get('payment') || '');
    const notes = String(fd.get('notes') || '').trim();
    const file = fd.get('file') as File | null;

    if (!amount || amount <= 0 || !date || !category) {
      setError('Renseignez la date, la catégorie et un montant valide.');
      return;
    }
    if (file && file.size > MAX_SIZE) {
      setError('Justificatif trop lourd (25 Mo max).');
      return;
    }

    setBusy(true);
    try {
      // 1. Justificatif → GED (pièce comptable numérotée PC-…)
      let documentId: string | null = null;
      if (file && file.size > 0) {
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const year = new Date().getFullYear();
        const path = `${year}/piece_comptable/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabaseBrowser.storage
          .from('backoffice')
          .upload(path, file, { contentType: file.type || undefined });
        if (upErr) throw new Error(`Envoi du justificatif impossible : ${upErr.message}`);

        const { data: doc, error: docErr } = await supabaseBrowser.rpc(
          'bo_create_document',
          {
            p_kind: 'piece_comptable',
            p_title: `Justificatif — ${categories.find((c) => c.code === category)?.label ?? category}${supplier ? ` (${supplier})` : ''}`,
            p_correspondent: supplier || null,
            p_doc_date: date,
            p_storage_path: path,
            p_mime_type: file.type || null,
            p_size_bytes: file.size,
            p_notes: notes || null,
          },
        );
        if (docErr) throw new Error(docErr.message);
        documentId = doc.id;
      }

      // 2. Écriture comptable
      const { data: entry, error: rpcErr } = await supabaseBrowser.rpc(
        'bo_record_expense',
        {
          p_date: date,
          p_category: category,
          p_amount_fcfa: amount,
          p_supplier: supplier || null,
          p_payment_account: payment || null,
          p_document_id: documentId,
          p_notes: notes || null,
        },
      );
      if (rpcErr) throw new Error(rpcErr.message);

      router.push(`/compta/ecritures/${entry.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-xl flex flex-col gap-lg">
      {error && (
        <div className="rounded-md bg-error/10 p-md text-sm text-error">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-lg sm:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Date
          </label>
          <input
            name="date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Montant (FCFA)
          </label>
          <input
            name="amount"
            required
            inputMode="numeric"
            placeholder="Ex. : 50 000"
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Catégorie
        </label>
        <select
          name="category"
          required
          className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label} ({c.account_code})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-lg sm:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Fournisseur / bénéficiaire
          </label>
          <input
            name="supplier"
            placeholder="Ex. : SBEE, propriétaire bureau…"
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Payé par
          </label>
          <select
            name="payment"
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {PAYMENT_ACCOUNTS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Justificatif (photo ou PDF)
        </label>
        <input
          name="file"
          type="file"
          accept="image/*,application/pdf"
          className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 file:mr-md file:rounded-md file:border-0 file:bg-primary-50 file:px-md file:py-xs file:text-xs file:font-bold file:text-primary-700"
        />
        <p className="mt-xs text-xs text-neutral-400">
          Fortement recommandé : la pièce est numérotée (PC-…) et rattachée à
          l&apos;écriture — exigible en cas de contrôle fiscal.
        </p>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Notes
        </label>
        <input
          name="notes"
          placeholder="Précision utile (période, contexte…)"
          className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-primary-500 py-md text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Enregistrement…' : 'Enregistrer la dépense'}
      </button>
    </form>
  );
}
