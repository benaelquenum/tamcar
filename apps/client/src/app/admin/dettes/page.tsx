import { createServerSupabase } from '@/lib/supabase-server';
import { MarkAlertsSeen } from '../AdminAlerts';

type DebtRow = {
  driver_id: string;
  full_name: string;
  phone: string | null;
  debt_fcfa: number;
  is_online: boolean;
  last_seen_at: string | null;
  driver_status: string;
  suspended_for_debt: boolean;
  suspended_at: string | null;
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export const dynamic = 'force-dynamic';

export default async function AdminDebtsPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('admin_driver_debts');
  const debts = (data ?? []) as DebtRow[];
  const total = debts.reduce((s, d) => s + d.debt_fcfa, 0);

  return (
    <div>
      <MarkAlertsSeen kind="driver_debt" />
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Dettes chauffeur</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-warning" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {debts.length}
          </strong>{' '}
          chauffeurs ·{' '}
          <strong className="text-error" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(total)} F
          </strong>{' '}
          à recouvrer
        </p>
      </div>

      <p className="mb-lg rounded-md bg-neutral-100 p-md text-xs text-neutral-600">
        Dette = commissions de courses encaissées en direct (espèces / Mobile Money) et cotisation
        TamAssur non encore couvertes. Dès que la dette atteint <strong>5 000 F</strong>, le chauffeur est{' '}
        <strong>suspendu automatiquement</strong> (hors ligne) et vous recevez une alerte ; dès qu&apos;il
        règle, il est <strong>réactivé automatiquement</strong>. Aucune action de votre part n&apos;est nécessaire.
      </p>

      {debts.length === 0 ? (
        <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          Aucune dette en cours. Tous les chauffeurs ont un solde Revenus positif ou nul.
        </div>
      ) : (
        <div className="space-y-sm">
          {debts.map((d) => (
            <div
              key={d.driver_id}
              className="flex items-center justify-between gap-md rounded-xl border border-neutral-200 bg-white p-lg shadow-sm"
            >
              <div>
                <p className="flex items-center gap-xs text-sm font-bold text-neutral-900">
                  {d.full_name}
                  {d.suspended_for_debt && (
                    <span className="rounded-full bg-error/15 px-sm py-0.5 text-[10px] font-bold uppercase tracking-wider text-error">
                      Suspendu automatiquement
                    </span>
                  )}
                </p>
                <p className="text-xs text-neutral-600">
                  {d.phone ? (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{d.phone}</span>
                  ) : (
                    '—'
                  )}
                  {' · '}
                  {d.is_online ? (
                    <span className="font-semibold text-primary-700">En ligne</span>
                  ) : (
                    'Hors ligne'
                  )}
                  {d.last_seen_at &&
                    ` · vu le ${new Date(d.last_seen_at).toLocaleDateString('fr-FR')}`}
                </p>
              </div>
              <div className="flex-none text-right">
                <p
                  className="text-lg font-extrabold text-error"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {fmt(d.debt_fcfa)} F
                </p>
                {d.phone && (
                  <a href={`tel:${d.phone}`} className="text-xs font-bold text-primary-700">
                    Appeler
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
