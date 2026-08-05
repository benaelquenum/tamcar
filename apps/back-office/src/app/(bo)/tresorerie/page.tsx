import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  FLOAT_KIND_LABELS,
  JOURNAL_LABELS,
  formatDate,
  formatFcfa,
  type BoEntry,
} from '@/lib/bo';
import { PlusIcon, SendIcon } from '@/components/Icon';

export const dynamic = 'force-dynamic';

type TreasuryRow = { account_code: string; account_label: string; balance_fcfa: number };
type FloatRow = { kind: string; balance_fcfa: number; wallet_count: number };

export default async function TresoreriePage() {
  const supabase = createServerSupabase();

  const [{ data: position }, { data: float }, { data: recent }] =
    await Promise.all([
      supabase.rpc('bo_treasury_position'),
      supabase.rpc('bo_platform_float'),
      supabase
        .from('bo_entries_view')
        .select('*')
        .in('journal_code', ['BQ', 'CS', 'MM'])
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

  const rows = (position ?? []) as TreasuryRow[];
  const nonZero = rows.filter((r) => r.balance_fcfa !== 0);
  const total = rows.reduce((s, r) => s + r.balance_fcfa, 0);
  const floats = (float ?? []) as FloatRow[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900">
            Trésorerie
          </h1>
          <p className="mt-xs text-sm text-neutral-600">
            Soldes des comptes société (issus des écritures) et encours des
            wallets plateforme.
          </p>
        </div>
        <div className="flex gap-sm">
          <Link
            href="/tresorerie/depense"
            className="flex items-center gap-sm rounded-lg bg-primary-500 px-lg py-md text-sm font-bold text-white shadow-md transition hover:brightness-110"
          >
            <PlusIcon className="h-4 w-4" />
            Nouvelle dépense
          </Link>
          <Link
            href="/compta/plateforme"
            className="flex items-center gap-sm rounded-lg bg-neutral-900 px-lg py-md text-sm font-bold text-white transition hover:brightness-110"
          >
            <SendIcon className="h-4 w-4" />
            Sync plateforme
          </Link>
        </div>
      </div>

      <div className="mt-xl rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
            Position société
          </h2>
          <p className="text-lg font-extrabold text-neutral-900">
            {formatFcfa(total)} F
          </p>
        </div>
        {nonZero.length === 0 ? (
          <p className="mt-md text-sm text-neutral-500">
            Aucun mouvement de trésorerie enregistré pour le moment. Passez
            l&apos;écriture d&apos;ouverture (apports en capital) via «
            Écritures → Nouvelle écriture », ou enregistrez une première
            dépense.
          </p>
        ) : (
          <ul className="mt-md divide-y divide-neutral-100">
            {nonZero.map((r) => (
              <li
                key={r.account_code}
                className="flex items-center justify-between py-sm"
              >
                <p className="text-sm text-neutral-700">
                  <span className="font-mono text-xs text-neutral-400">
                    {r.account_code}
                  </span>{' '}
                  {r.account_label}
                </p>
                <p
                  className={`text-sm font-bold ${r.balance_fcfa < 0 ? 'text-error' : 'text-neutral-900'}`}
                >
                  {formatFcfa(r.balance_fcfa)} F
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-lg rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
          Encours wallets plateforme (temps réel)
        </h2>
        <p className="mt-xs text-xs text-neutral-500">
          Fonds de tiers : ces montants appartiennent aux clients, chauffeurs
          et partenaires — à ne jamais confondre avec la trésorerie société.
        </p>
        <ul className="mt-md divide-y divide-neutral-100">
          {floats.map((f) => (
            <li key={f.kind} className="flex items-center justify-between py-sm">
              <p className="text-sm text-neutral-700">
                {FLOAT_KIND_LABELS[f.kind] ?? f.kind}
                <span className="ml-sm text-xs text-neutral-400">
                  {f.wallet_count} wallets
                </span>
              </p>
              <p className="text-sm font-bold text-neutral-900">
                {formatFcfa(f.balance_fcfa)} F
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-lg rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
            Derniers mouvements de trésorerie
          </h2>
          <Link
            href="/compta/ecritures"
            className="text-xs font-bold text-primary-600 hover:underline"
          >
            Toutes les écritures
          </Link>
        </div>
        {((recent ?? []) as BoEntry[]).length === 0 ? (
          <p className="mt-md text-sm text-neutral-500">Aucun mouvement.</p>
        ) : (
          <ul className="mt-md divide-y divide-neutral-100">
            {((recent ?? []) as BoEntry[]).map((e) => (
              <li key={e.id} className="py-sm">
                <Link
                  href={`/compta/ecritures/${e.id}`}
                  className="flex items-center justify-between gap-md hover:opacity-80"
                >
                  <p className="min-w-0 truncate text-sm text-neutral-800">
                    <span className="font-mono text-xs text-neutral-400">
                      {e.entry_no}
                    </span>{' '}
                    {e.label}
                  </p>
                  <p className="shrink-0 text-xs text-neutral-500">
                    {JOURNAL_LABELS[e.journal_code]} — {formatDate(e.entry_date)}{' '}
                    —{' '}
                    <span className="font-bold text-neutral-800">
                      {formatFcfa(e.total_fcfa ?? 0)} F
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
