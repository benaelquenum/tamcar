import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  JOURNAL_LABELS,
  formatDate,
  formatFcfa,
  type BoEntry,
  type BoEntryLine,
} from '@/lib/bo';
import { ChevronLeftIcon, FileIcon } from '@/components/Icon';
import { ReverseButton } from './ReverseButton';

export const dynamic = 'force-dynamic';

export default async function EcritureDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id ?? '')
    .maybeSingle();
  const isAdmin = profile?.role === 'admin';

  const [{ data: entry }, { data: lines }] = await Promise.all([
    supabase.from('bo_entries').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('bo_entry_lines')
      .select('*, bo_accounts(label)')
      .eq('entry_id', params.id)
      .order('line_no'),
  ]);

  if (!entry) notFound();
  const e = entry as BoEntry;
  const ls = (lines ?? []) as (BoEntryLine & {
    bo_accounts: { label: string } | null;
  })[];
  const total = ls.reduce((s, l) => s + l.debit_fcfa, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/compta/ecritures"
        className="flex w-fit items-center gap-xs text-sm font-semibold text-neutral-500 hover:text-neutral-800"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Écritures
      </Link>

      <div className="mt-lg rounded-xl bg-white p-xl shadow-sm ring-1 ring-neutral-200">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <p className="font-mono text-xs text-neutral-400">{e.entry_no}</p>
            <h1 className="mt-xs text-xl font-extrabold text-neutral-900">
              {e.label}
            </h1>
            <p className="mt-xs text-sm text-neutral-500">
              {JOURNAL_LABELS[e.journal_code]} — {formatDate(e.entry_date)} —{' '}
              {formatFcfa(total)} F
            </p>
          </div>
          <div className="flex items-center gap-sm">
            {e.reversed_by && (
              <span className="rounded-full bg-warning/10 px-md py-xs text-xs font-bold text-warning">
                Extournée
              </span>
            )}
            {e.source === 'platform' && (
              <span className="rounded-full bg-info/10 px-md py-xs text-xs font-bold text-info">
                Automatique
              </span>
            )}
          </div>
        </div>

        <div className="mt-lg overflow-hidden rounded-lg ring-1 ring-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-md py-sm font-bold">Compte</th>
                <th className="px-md py-sm font-bold">Libellé</th>
                <th className="px-md py-sm text-right font-bold">Débit</th>
                <th className="px-md py-sm text-right font-bold">Crédit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {ls.map((l) => (
                <tr key={l.id}>
                  <td className="px-md py-sm">
                    <span className="font-mono text-xs text-neutral-500">
                      {l.account_code}
                    </span>{' '}
                    <span className="text-neutral-800">
                      {l.bo_accounts?.label}
                    </span>
                  </td>
                  <td className="px-md py-sm text-neutral-600">
                    {l.label ?? '—'}
                  </td>
                  <td className="px-md py-sm text-right font-semibold text-neutral-900">
                    {l.debit_fcfa ? `${formatFcfa(l.debit_fcfa)} F` : ''}
                  </td>
                  <td className="px-md py-sm text-right font-semibold text-neutral-900">
                    {l.credit_fcfa ? `${formatFcfa(l.credit_fcfa)} F` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-lg flex items-center justify-between border-t border-neutral-100 pt-lg">
          {e.document_id ? (
            <Link
              href={`/courrier/${e.document_id}`}
              className="flex items-center gap-sm text-sm font-bold text-primary-600 hover:underline"
            >
              <FileIcon className="h-4 w-4" />
              Voir le justificatif
            </Link>
          ) : (
            <p className="text-xs text-neutral-400">
              {e.source === 'platform'
                ? 'Écriture générée par la synchronisation plateforme.'
                : 'Aucun justificatif lié.'}
            </p>
          )}
          {isAdmin && !e.reversed_by && e.source !== 'reversal' && (
            <ReverseButton entryId={e.id} />
          )}
        </div>
      </div>
    </div>
  );
}
