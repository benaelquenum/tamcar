import { createServerSupabase } from '@/lib/supabase-server';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { markTamassurPaid } from './actions';

type Row = {
  id: string;
  driver_id: string;
  full_name: string;
  phone: string | null;
  amount_fcfa: number;
  status: 'pending' | 'paid' | 'rejected';
  requested_at: string;
  due_at: string;
  paid_at: string | null;
  method: string | null;
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function daysLeft(due: string): number {
  return Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000);
}

export default async function AdminTamassurPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('admin_tamassur_withdrawals');
  const rows = (data ?? []) as Row[];
  const pending = rows.filter((r) => r.status === 'pending');
  const done = rows.filter((r) => r.status !== 'pending');
  const pendingTotal = pending.reduce((s, r) => s + r.amount_fcfa, 0);

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Retraits épargne TamAssur</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-warning" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {pending.length}
          </strong>{' '}
          en attente ·{' '}
          <strong className="text-error" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(pendingTotal)} F
          </strong>{' '}
          à payer
        </p>
      </div>

      <p className="mb-lg rounded-md bg-neutral-100 p-md text-xs text-neutral-600">
        Le montant est déjà réservé (débité de la poche Épargne du chauffeur). Réglez en espèces ou
        par Mobile Money <strong>sous 30 jours</strong>, puis marquez la demande comme payée.
      </p>

      {pending.length > 0 && (
        <section className="mb-2xl">
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
            À régler
          </h2>
          <div className="space-y-sm">
            {pending.map((r) => {
              const dl = daysLeft(r.due_at);
              return (
                <div key={r.id} className="rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
                  <div className="mb-md flex items-start justify-between gap-md">
                    <div>
                      <p className="text-sm font-bold text-neutral-900">{r.full_name}</p>
                      <p className="text-xs text-neutral-600">
                        {r.phone ? (
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.phone}</span>
                        ) : (
                          '—'
                        )}
                        {' · demandé le '}
                        {new Date(r.requested_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className="text-lg font-extrabold text-neutral-900"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {fmt(r.amount_fcfa)} F
                      </p>
                      <p className={`text-[11px] font-bold ${dl < 0 ? 'text-error' : dl <= 7 ? 'text-warning' : 'text-neutral-500'}`}>
                        {dl < 0 ? `En retard de ${-dl} j` : `${dl} j restants`}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-md">
                    <form action={markTamassurPaid}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="method" value="cash" />
                      <ConfirmSubmit
                        message={`Confirmer le paiement de ${fmt(r.amount_fcfa)} F en espèces à ${r.full_name} ?`}
                        className="w-full rounded-md bg-success py-sm text-sm font-bold text-white hover:brightness-110"
                      >
                        Payé en espèces
                      </ConfirmSubmit>
                    </form>
                    <form action={markTamassurPaid}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="method" value="mobile_money" />
                      <ConfirmSubmit
                        message={`Confirmer le paiement de ${fmt(r.amount_fcfa)} F par Mobile Money à ${r.full_name} ?`}
                        className="w-full rounded-md bg-primary-500 py-sm text-sm font-bold text-white hover:brightness-110"
                      >
                        Payé par Mobile Money
                      </ConfirmSubmit>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
            Historique
          </h2>
          <div className="space-y-sm">
            {done.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-md text-sm shadow-sm"
              >
                <div>
                  <p className="font-semibold text-neutral-900">{r.full_name}</p>
                  <p className="text-xs text-neutral-500">
                    {r.status === 'paid'
                      ? `Payé le ${r.paid_at ? new Date(r.paid_at).toLocaleDateString('fr-FR') : '—'} · ${r.method === 'mobile_money' ? 'Mobile Money' : 'Espèces'}`
                      : 'Rejeté'}
                  </p>
                </div>
                <p className="font-bold text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(r.amount_fcfa)} F
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {rows.length === 0 && (
        <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          Aucune demande de retrait épargne pour l&apos;instant.
        </div>
      )}
    </div>
  );
}
