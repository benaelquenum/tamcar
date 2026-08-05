import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  employeeName,
  type BoEmployee,
  type BoLeave,
  type BoLeaveBalance,
} from '@/lib/rh';
import { ChevronLeftIcon } from '@/components/Icon';
import { LeaveList } from './LeaveList';
import { NewLeaveForm } from './NewLeaveForm';

export const dynamic = 'force-dynamic';

export default async function CongesPage() {
  const supabase = createServerSupabase();

  const [{ data: employees }, { data: leaves }, { data: balances }] =
    await Promise.all([
      supabase
        .from('bo_employees')
        .select('*')
        .eq('status', 'actif')
        .order('matricule'),
      supabase
        .from('bo_leaves')
        .select('*')
        .order('start_on', { ascending: false })
        .limit(200),
      supabase.rpc('bo_leave_balances'),
    ]);

  const emps = (employees ?? []) as BoEmployee[];
  const rows = (leaves ?? []) as BoLeave[];
  const bal = (balances ?? []) as BoLeaveBalance[];
  const names = new Map(emps.map((e) => [e.id, employeeName(e)]));
  for (const b of bal) names.set(b.employee_id, b.employee_name);

  return (
    <div>
      <Link
        href="/rh"
        className="flex w-fit items-center gap-xs text-sm font-semibold text-neutral-500 hover:text-neutral-800"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Personnel
      </Link>

      <h1 className="mt-lg text-2xl font-extrabold text-neutral-900">
        Congés
      </h1>
      <p className="mt-xs text-sm text-neutral-600">
        Droit béninois : 24 jours ouvrables par an, acquis à raison de 2 jours
        par mois de service effectif. Les jours sont décomptés dimanches exclus
        — retranchez les jours fériés à la main le cas échéant.
      </p>

      <div className="mt-xl grid grid-cols-1 gap-xl lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LeaveList rows={rows} names={Object.fromEntries(names)} />
        </div>
        <div className="flex flex-col gap-lg">
          <NewLeaveForm employees={emps} />

          <div className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
              Soldes par employé
            </h2>
            {bal.length === 0 ? (
              <p className="mt-md text-sm text-neutral-500">
                Aucun employé au registre.
              </p>
            ) : (
              <ul className="mt-md divide-y divide-neutral-100">
                {bal.map((b) => (
                  <li
                    key={b.employee_id}
                    className="flex items-center justify-between gap-md py-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">
                        {b.employee_name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {b.acquired_days} acquis — {b.taken_days} pris
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-md py-xs text-xs font-bold ${
                        b.balance_days < 0
                          ? 'bg-error/10 text-error'
                          : 'bg-success/10 text-success'
                      }`}
                    >
                      {b.balance_days} j
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
