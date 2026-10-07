import { createServerSupabase } from '@/lib/supabase-server';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { markPayoutPaid, rejectPayout } from './actions';

type Row = {
  id: string;
  created_at: string;
  profile_id: string;
  full_name: string;
  phone: string | null;
  msisdn: string;
  provider: 'mtn' | 'moov' | 'internal';
  amount_fcfa: number;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  failure_reason: string | null;
  reference: string | null;
  processed_at: string | null;
  balance_fcfa: number | null;
};

const PROVIDER: Record<string, string> = { mtn: 'MTN MoMo', moov: 'Moov Money', internal: 'Interne' };

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function ago(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return 'il y a moins d’1 h';
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export const dynamic = 'force-dynamic';

export default async function AdminPayoutsPage() {
  const supabase = createServerSupabase();
  const [{ data: openData }, { data: doneData }] = await Promise.all([
    supabase.rpc('admin_driver_payouts', { p_scope: 'open' }),
    supabase.rpc('admin_driver_payouts', { p_scope: 'done' }),
  ]);
  const open = (Array.isArray(openData) ? openData : []) as Row[];
  const done = ((Array.isArray(doneData) ? doneData : []) as Row[]).slice(0, 40);
  const openTotal = open.reduce((s, r) => s + r.amount_fcfa, 0);

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Retraits chauffeur</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-warning" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {open.length}
          </strong>{' '}
          à payer ·{' '}
          <strong className="text-error" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(openTotal)} F
          </strong>
        </p>
      </div>

      <p className="mb-lg rounded-md bg-neutral-100 p-md text-xs text-neutral-600">
        Le montant est déjà débité des revenus du chauffeur (réservé). Envoyez-le sur son Mobile Money, puis
        cliquez <strong>Payé</strong> (avec la référence de l&apos;opération si vous l&apos;avez) : le chauffeur est
        prévenu. Si vous ne pouvez pas payer, cliquez <strong>Refuser</strong> : le montant lui est recrédité.
      </p>

      {open.length === 0 ? (
        <div className="mb-2xl rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          Aucun retrait en attente.
        </div>
      ) : (
        <section className="mb-2xl space-y-sm">
          {open.map((r) => (
            <div key={r.id} className="rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
              <div className="mb-md flex items-start justify-between gap-md">
                <div>
                  <p className="text-sm font-bold text-neutral-900">{r.full_name}</p>
                  <p className="text-xs text-neutral-600">
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {PROVIDER[r.provider] ?? r.provider} · {r.msisdn}
                    </span>
                    {' · demandé '}
                    {ago(r.created_at)}
                    {r.balance_fcfa != null && ` · solde restant ${fmt(r.balance_fcfa)} F`}
                  </p>
                </div>
                <p
                  className="flex-none text-lg font-extrabold text-neutral-900"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {fmt(r.amount_fcfa)} F
                </p>
              </div>
              <div className="grid gap-md md:grid-cols-2">
                <form action={markPayoutPaid} className="flex gap-sm">
                  <input type="hidden" name="id" value={r.id} />
                  <input
                    name="reference"
                    placeholder="Référence (facultatif)"
                    className="min-w-0 flex-1 rounded-md border border-neutral-300 px-sm py-sm text-sm"
                  />
                  <ConfirmSubmit
                    message={`Confirmer l’envoi de ${fmt(r.amount_fcfa)} F à ${r.full_name} (${r.msisdn}) ?`}
                    className="flex-none rounded-md bg-success px-lg py-sm text-sm font-bold text-white hover:brightness-110"
                  >
                    Payé
                  </ConfirmSubmit>
                </form>
                <form action={rejectPayout} className="flex gap-sm">
                  <input type="hidden" name="id" value={r.id} />
                  <input
                    name="reason"
                    placeholder="Motif (facultatif)"
                    className="min-w-0 flex-1 rounded-md border border-neutral-300 px-sm py-sm text-sm"
                  />
                  <ConfirmSubmit
                    message={`Refuser ce retrait ? ${fmt(r.amount_fcfa)} F seront recrédités à ${r.full_name}.`}
                    className="flex-none rounded-md bg-neutral-200 px-lg py-sm text-sm font-bold text-neutral-800 hover:bg-neutral-300"
                  >
                    Refuser
                  </ConfirmSubmit>
                </form>
              </div>
            </div>
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">Historique</h2>
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
                      ? `Payé le ${r.processed_at ? new Date(r.processed_at).toLocaleDateString('fr-FR') : '—'}${r.reference ? ` · réf. ${r.reference}` : ''}`
                      : `Refusé${r.failure_reason ? ` · ${r.failure_reason}` : ''}`}
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
    </div>
  );
}
