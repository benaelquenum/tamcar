import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  formatDate,
  formatFcfa,
  type BoExpenseCategory,
  type BoPendingOperation,
} from '@/lib/bo';
import { DecideButtons } from './DecideButtons';

export const dynamic = 'force-dynamic';

export default async function ValidationsPage() {
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

  const [{ data: pending }, { data: decided }, { data: categories }] =
    await Promise.all([
      supabase
        .from('bo_pending_operations')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('bo_pending_operations')
        .select('*')
        .neq('status', 'pending')
        .order('decided_at', { ascending: false })
        .limit(15),
      supabase.from('bo_expense_categories').select('*'),
    ]);

  const catLabel = (code: string) =>
    ((categories ?? []) as BoExpenseCategory[]).find((c) => c.code === code)
      ?.label ?? code;

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-neutral-900">Validations</h1>
      <p className="mt-xs text-sm text-neutral-600">
        Opérations au-dessus du seuil automatique (100 000 F) ou d&apos;analyse
        incertaine — {isAdmin
          ? 'à valider ou rejeter par vous.'
          : 'en attente de décision du fondateur.'}
      </p>

      <div className="mt-xl overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        {((pending ?? []) as BoPendingOperation[]).length === 0 ? (
          <p className="p-xl text-center text-sm text-neutral-500">
            Aucune opération en attente.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {((pending ?? []) as BoPendingOperation[]).map((op) => (
              <li key={op.id} className="p-lg">
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div className="min-w-0">
                    <p className="text-lg font-extrabold text-neutral-900">
                      {formatFcfa(op.amount_fcfa)} F
                      <span className="ml-sm text-sm font-semibold text-neutral-500">
                        {catLabel(op.category)}
                      </span>
                    </p>
                    <p className="mt-xs text-sm text-neutral-600">
                      {op.supplier ? `${op.supplier} — ` : ''}
                      {formatDate(op.op_date)}
                      {op.confidence != null &&
                        ` — confiance IA ${Math.round(op.confidence * 100)} %`}
                    </p>
                    {op.raw_text && (
                      <p className="mt-xs text-xs italic text-neutral-500">
                        « {op.raw_text} »
                      </p>
                    )}
                    {op.notes && (
                      <p className="mt-xs text-xs text-neutral-500">{op.notes}</p>
                    )}
                    {op.document_id && (
                      <Link
                        href={`/courrier/${op.document_id}`}
                        className="mt-xs inline-block text-xs font-bold text-primary-600 hover:underline"
                      >
                        Voir le justificatif
                      </Link>
                    )}
                  </div>
                  {isAdmin && <DecideButtons opId={op.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {((decided ?? []) as BoPendingOperation[]).length > 0 && (
        <div className="mt-lg">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-neutral-400">
            Décisions récentes
          </h2>
          <ul className="mt-sm space-y-xs">
            {((decided ?? []) as BoPendingOperation[]).map((op) => (
              <li key={op.id} className="text-xs text-neutral-500">
                <span
                  className={`font-bold ${op.status === 'posted' ? 'text-success' : 'text-error'}`}
                >
                  {op.status === 'posted' ? 'Comptabilisée' : 'Rejetée'}
                </span>{' '}
                — {formatFcfa(op.amount_fcfa)} F, {catLabel(op.category)}
                {op.entry_id && (
                  <Link
                    href={`/compta/ecritures/${op.entry_id}`}
                    className="ml-xs font-bold text-primary-600 hover:underline"
                  >
                    écriture
                  </Link>
                )}
                {op.reject_reason && ` — motif : ${op.reject_reason}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
