import { createServerSupabase } from '@/lib/supabase-server';

type DebtRow = {
  driver_id: string;
  full_name: string;
  phone: string | null;
  debt_fcfa: number;
  is_online: boolean;
  last_seen_at: string | null;
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export default async function AdminDebtsPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('admin_driver_debts');
  const debts = (data ?? []) as DebtRow[];
  const total = debts.reduce((s, d) => s + d.debt_fcfa, 0);

  return (
    <div>
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
        Dette = commissions de courses encaissées en direct (espèces / Mobile Money) non encore
        reversées. Le chauffeur est <strong>bloqué en ligne</strong> tant que son solde Revenus est
        négatif ; il régularise depuis son app (« Régler ma dette »).
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
                <p className="text-sm font-bold text-neutral-900">{d.full_name}</p>
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
