'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { PAYMENT_ACCOUNTS } from '@/lib/bo';
import { BookIcon, CheckIcon, WalletIcon } from '@/components/Icon';

export function PayrollActions({
  period,
  periodLabel,
  draftCount,
  slipCount,
  posted,
  allValidated,
  entryId,
  activeCount,
}: {
  period: string;
  periodLabel: string;
  draftCount: number;
  slipCount: number;
  posted: boolean;
  allValidated: boolean;
  entryId: string | null;
  activeCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [account, setAccount] = useState('5211');

  async function generate() {
    setBusy('generate');
    setError(null);
    setNotice(null);
    const { data, error: err } = await supabaseBrowser.rpc(
      'bo_generate_payroll',
      { p_period: period },
    );
    if (err) setError(err.message);
    else
      setNotice(
        `${data} bulletin${Number(data) > 1 ? 's' : ''} calculé${Number(data) > 1 ? 's' : ''}.`,
      );
    router.refresh();
    setBusy(null);
  }

  async function post() {
    setBusy('post');
    setError(null);
    setNotice(null);
    const { data, error: err } = await supabaseBrowser.rpc('bo_post_payroll', {
      p_period: period,
    });
    if (err) setError(err.message);
    else {
      setNotice(`Écriture ${data?.entry_no ?? ''} passée au journal OD.`);
      if (data?.id) router.push(`/compta/ecritures/${data.id}`);
    }
    router.refresh();
    setBusy(null);
  }

  async function pay() {
    setBusy('pay');
    setError(null);
    setNotice(null);
    const { data, error: err } = await supabaseBrowser.rpc(
      'bo_mark_payroll_paid',
      { p_period: period, p_payment_account: account },
    );
    if (err) setError(err.message);
    else {
      setNotice(`Règlement enregistré — écriture ${data?.entry_no ?? ''}.`);
      if (data?.id) router.push(`/compta/ecritures/${data.id}`);
    }
    router.refresh();
    setBusy(null);
  }

  return (
    <div className="mt-lg rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200 print:hidden">
      {error && (
        <div className="mb-md rounded-md bg-error/10 p-md text-sm text-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-md rounded-md bg-success/10 p-md text-sm text-success">
          {notice}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-md">
        <button
          type="button"
          onClick={generate}
          disabled={busy !== null || activeCount === 0}
          className="flex items-center gap-sm rounded-lg bg-primary-500 px-lg py-md text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <WalletIcon className="h-4 w-4" />
          {busy === 'generate'
            ? 'Calcul…'
            : slipCount > 0
              ? 'Recalculer les bulletins'
              : 'Générer les bulletins'}
        </button>

        <button
          type="button"
          onClick={post}
          disabled={busy !== null || draftCount === 0}
          className="flex items-center gap-sm rounded-lg bg-neutral-900 px-lg py-md text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <BookIcon className="h-4 w-4" />
          {busy === 'post'
            ? 'Comptabilisation…'
            : `Comptabiliser la paie du mois (${periodLabel})`}
        </button>

        {entryId && (
          <Link
            href={`/compta/ecritures/${entryId}`}
            className="text-xs font-bold text-primary-600 hover:underline"
          >
            Voir l&apos;écriture de paie
          </Link>
        )}
      </div>

      {allValidated && (
        <div className="mt-md flex flex-wrap items-center gap-sm border-t border-neutral-100 pt-md">
          <p className="text-sm text-neutral-600">
            Paie comptabilisée. Enregistrer le règlement du net depuis :
          </p>
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="rounded-lg bg-neutral-50 px-md py-sm text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {PAYMENT_ACCOUNTS.filter((p) => p.code).map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={pay}
            disabled={busy !== null}
            className="flex items-center gap-sm rounded-lg bg-success px-lg py-sm text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <CheckIcon className="h-4 w-4" />
            {busy === 'pay' ? 'Enregistrement…' : 'Marquer les salaires payés'}
          </button>
        </div>
      )}

      {activeCount === 0 && (
        <p className="mt-md text-sm text-neutral-500">
          Aucun employé actif : rien à payer ce mois-ci.
        </p>
      )}
      {posted && draftCount === 0 && !allValidated && (
        <p className="mt-md text-xs text-neutral-500">
          Les bulletins de ce mois sont figés. Pour les recalculer, extournez
          d&apos;abord l&apos;écriture de paie depuis le journal.
        </p>
      )}
    </div>
  );
}
