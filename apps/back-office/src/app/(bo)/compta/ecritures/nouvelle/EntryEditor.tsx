'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { JOURNAL_LABELS, formatFcfa, type BoAccount } from '@/lib/bo';
import { PlusIcon } from '@/components/Icon';

type Line = {
  account: string;
  label: string;
  debit: string;
  credit: string;
};

const EMPTY_LINE: Line = { account: '', label: '', debit: '', credit: '' };

function toInt(v: string): number {
  const n = parseInt(v.replace(/\s/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function EntryEditor({ accounts }: { accounts: BoAccount[] }) {
  const router = useRouter();
  const [journal, setJournal] = useState('OD');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [label, setLabel] = useState('');
  const [lines, setLines] = useState<Line[]>([
    { ...EMPTY_LINE },
    { ...EMPTY_LINE },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalDebit = lines.reduce((s, l) => s + toInt(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + toInt(l.credit), 0);
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setError(null);
    if (!label.trim()) {
      setError('Renseignez le libellé de l’écriture.');
      return;
    }
    const payload = lines
      .filter((l) => l.account && (toInt(l.debit) > 0 || toInt(l.credit) > 0))
      .map((l) => ({
        account: l.account,
        label: l.label.trim() || null,
        debit: toInt(l.debit),
        credit: toInt(l.credit),
      }));
    if (payload.length < 2) {
      setError('Au moins deux lignes avec compte et montant.');
      return;
    }
    if (!balanced) {
      setError('Écriture déséquilibrée : les débits doivent égaler les crédits.');
      return;
    }

    setBusy(true);
    const { data, error: err } = await supabaseBrowser.rpc('bo_post_entry', {
      p_journal: journal,
      p_date: date,
      p_label: label.trim(),
      p_lines: payload,
    });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    router.push(`/compta/ecritures/${data.id}`);
    router.refresh();
  }

  return (
    <div className="mt-xl">
      {error && (
        <div className="mb-lg rounded-md bg-error/10 p-md text-sm text-error">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-lg sm:grid-cols-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Journal
          </label>
          <select
            value={journal}
            onChange={(e) => setJournal(e.target.value)}
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {Object.entries(JOURNAL_LABELS)
              .filter(([code]) => code !== 'PL')
              .map(([code, l]) => (
                <option key={code} value={code}>
                  {code} — {l}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Libellé
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex. : Apport en capital — libération"
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div className="mt-lg overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-md py-sm font-bold">Compte</th>
              <th className="px-md py-sm font-bold">Libellé ligne</th>
              <th className="w-32 px-md py-sm text-right font-bold">Débit</th>
              <th className="w-32 px-md py-sm text-right font-bold">Crédit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="px-md py-sm">
                  <select
                    value={l.account}
                    onChange={(e) => updateLine(i, { account: e.target.value })}
                    className="w-full rounded-md bg-neutral-50 px-sm py-sm text-xs ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">— compte —</option>
                    {accounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} — {a.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-md py-sm">
                  <input
                    value={l.label}
                    onChange={(e) => updateLine(i, { label: e.target.value })}
                    className="w-full rounded-md bg-neutral-50 px-sm py-sm text-xs ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </td>
                <td className="px-md py-sm">
                  <input
                    value={l.debit}
                    inputMode="numeric"
                    onChange={(e) =>
                      updateLine(i, { debit: e.target.value, credit: '' })
                    }
                    className="w-full rounded-md bg-neutral-50 px-sm py-sm text-right text-xs ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </td>
                <td className="px-md py-sm">
                  <input
                    value={l.credit}
                    inputMode="numeric"
                    onChange={(e) =>
                      updateLine(i, { credit: e.target.value, debit: '' })
                    }
                    className="w-full rounded-md bg-neutral-50 px-sm py-sm text-right text-xs ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50">
            <tr>
              <td className="px-md py-sm" colSpan={2}>
                <button
                  type="button"
                  onClick={() => setLines((p) => [...p, { ...EMPTY_LINE }])}
                  className="flex items-center gap-xs text-xs font-bold text-primary-600 hover:underline"
                >
                  <PlusIcon className="h-3 w-3" />
                  Ajouter une ligne
                </button>
              </td>
              <td className="px-md py-sm text-right text-xs font-bold text-neutral-700">
                {formatFcfa(totalDebit)} F
              </td>
              <td className="px-md py-sm text-right text-xs font-bold text-neutral-700">
                {formatFcfa(totalCredit)} F
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-md flex items-center justify-between">
        <p
          className={`text-xs font-bold ${balanced ? 'text-success' : 'text-warning'}`}
        >
          {balanced
            ? 'Écriture équilibrée.'
            : `Écart : ${formatFcfa(Math.abs(totalDebit - totalCredit))} F`}
        </p>
        <button
          type="button"
          disabled={busy || !balanced}
          onClick={submit}
          className="rounded-lg bg-primary-500 px-xl py-md text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Validation…' : 'Valider l’écriture'}
        </button>
      </div>
    </div>
  );
}
