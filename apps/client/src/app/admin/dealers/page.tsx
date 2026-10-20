import { createServerSupabase } from '@/lib/supabase-server';
import { archiveDealer, payDealerWalletAction, rejectDealerPayoutAction, setDealerTaxAction, settleDealerPayoutAction } from './actions';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { CreateDealerForm } from './CreateDealerForm';
import { ResetPasswordControl } from '../drivers/ResetPasswordControl';

type DealerRow = {
  dealer_id: string;
  profile_id: string;
  full_name: string;
  phone: string;
  company_name: string;
  rccm: string | null;
  dealer_share_pct: number;
  is_shareholder: boolean;
  shareholder_pct: number | null;
  registered_at: string;
  archived_at: string | null;
  archive_reason: string | null;
  active_vehicles_count: number;
  total_dealer_share_fcfa: number;
  completed_rides_count: number;
};

type WalletRow = {
  dealer_id: string;
  company_name: string;
  full_name: string;
  phone: string | null;
  archived: boolean;
  balance_fcfa: number;
  earned_month: number;
  earned_total: number;
  paid_total: number;
  last_paid_at: string | null;
};

type PayoutRequestRow = {
  id: string;
  dealer_id: string;
  company_name: string;
  full_name: string;
  phone: string | null;
  ifu: string | null;
  aib_exempt: boolean;
  requested_at: string;
  amount_fcfa: number;
  aib_permille: number;
  aib_fcfa: number;
  fee_fcfa: number;
  net_fcfa: number;
  method: 'mobile_money' | 'virement';
  provider: string | null;
  account: string;
  invoice_number: string | null;
  status: 'requested' | 'paid' | 'rejected' | 'cancelled';
  reference: string | null;
  reason: string | null;
  decided_at: string | null;
};

type TaxRow = { id: string; ifu: string | null; aib_exempt: boolean; aib_exempt_reason: string | null };

const REQUEST_STATUS: Record<PayoutRequestRow['status'], string> = {
  requested: 'En attente',
  paid: 'Versé',
  rejected: 'Refusé',
  cancelled: 'Annulé',
};

function dateTimeFr(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Porto-Novo',
  });
}

function fmt(n: number): string {
  return Math.round(Number(n) || 0)
    .toLocaleString('fr-FR')
    .replace(/[  ,]/g, ' ');
}

export default async function AdminDealersPage() {
  const supabase = createServerSupabase();
  const [{ data }, { data: walletsData }, { data: reqData }, { data: taxData }] = await Promise.all([
    supabase.from('dealer_admin_view').select('*').order('registered_at', { ascending: false }),
    supabase.rpc('admin_dealer_wallets'),
    supabase.rpc('admin_dealer_payout_requests', { p_status: 'all' }),
    supabase.from('dealer_partners').select('id, ifu, aib_exempt, aib_exempt_reason'),
  ]);
  const requests = (reqData ?? []) as PayoutRequestRow[];
  const pendingRequests = requests.filter((r) => r.status === 'requested');
  const recentRequests = requests.filter((r) => r.status !== 'requested').slice(0, 8);
  const taxById = new Map(((taxData ?? []) as TaxRow[]).map((t) => [t.id, t]));
  const list = (data ?? []) as DealerRow[];
  const wallets = ((walletsData ?? []) as WalletRow[]).filter((w) => !w.archived);
  const totalDue = wallets.reduce((sum, w) => sum + Math.max(0, w.balance_fcfa), 0);
  const active = list.filter((d) => d.archived_at === null);
  const archived = list.filter((d) => d.archived_at !== null);

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Partenaires véhicules</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-neutral-900">{active.length}</strong> actifs ·{' '}
          <strong className="text-neutral-500">{archived.length}</strong> archivés
        </p>
      </div>

      <CreateDealerForm />

      {/* ---------- Demandes de versement ---------- */}
      {(pendingRequests.length > 0 || recentRequests.length > 0) && (
        <section className="mb-2xl">
          <div className="mb-sm flex flex-wrap items-baseline justify-between gap-sm">
            <h2 className="text-lg font-bold text-neutral-900">Demandes de versement</h2>
            <p className="text-sm text-neutral-600">
              <strong className="text-neutral-900">{pendingRequests.length}</strong> en attente
            </p>
          </div>
          <p className="mb-md rounded-md bg-neutral-100 p-md text-xs leading-relaxed text-neutral-600">
            Le partenaire demande lui-même le versement de sa part disponible (un mois après la première course de ses véhicules). Le montant
            est déjà réservé sur son portefeuille. Vous réglez le <strong>montant net</strong> hors application (Mobile Money, virement), puis vous
            cliquez sur « Marquer réglé » en indiquant la référence et le n° de la facture normalisée, qui est exigé. L&apos;AIB retenu reste chez
            TamCar et se reverse à l&apos;administration fiscale ; les frais de transaction sont à la charge du partenaire.
          </p>
          <ul className="space-y-sm">
            {pendingRequests.map((r) => (
              <li key={r.id} className="rounded-xl border border-warning/40 bg-white p-lg shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-neutral-900">
                      {r.company_name} <span className="font-normal text-neutral-500">· {r.full_name}</span>
                    </p>
                    <p className="text-xs text-neutral-600">
                      Demandé le {dateTimeFr(r.requested_at)} · {r.method === 'mobile_money' ? `Mobile Money ${String(r.provider ?? '').toUpperCase()}` : 'Virement bancaire'} :{' '}
                      <strong className="text-neutral-900">{r.account}</strong>
                    </p>
                    <p className="mt-xs text-xs text-neutral-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      Facture normalisée : <strong className="text-neutral-900">{r.invoice_number ?? 'non indiquée'}</strong> · IFU :{' '}
                      {r.aib_exempt ? 'exonération d’AIB constatée' : r.ifu ?? 'non renseigné'}
                    </p>
                  </div>
                  <div className="text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <p className="text-[11px] text-neutral-500">
                      {fmt(r.amount_fcfa)} F demandés − AIB {r.aib_permille / 10} % ({fmt(r.aib_fcfa)} F) − frais ({fmt(r.fee_fcfa)} F)
                    </p>
                    <p className="text-xl font-extrabold text-primary-700">{fmt(r.net_fcfa)} F à envoyer</p>
                  </div>
                </div>
                <div className="mt-md flex flex-wrap items-end gap-md border-t border-neutral-100 pt-md">
                  <form action={settleDealerPayoutAction} className="flex flex-wrap items-center gap-xs">
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      type="text"
                      name="reference"
                      placeholder="Référence du règlement"
                      className="w-44 rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                    />
                    <input
                      type="text"
                      name="invoice_number"
                      defaultValue={r.invoice_number ?? ''}
                      placeholder="N° de facture normalisée"
                      className="w-48 rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                    />
                    <ConfirmSubmit
                      message={`Marquer réglé : ${fmt(r.net_fcfa)} F envoyés à ${r.company_name} ?`}
                      className="rounded-md bg-neutral-800 px-md py-xs text-xs font-bold text-white hover:bg-neutral-900"
                    >
                      Marquer réglé
                    </ConfirmSubmit>
                  </form>
                  <form action={rejectDealerPayoutAction} className="flex flex-wrap items-center gap-xs">
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      type="text"
                      name="reason"
                      placeholder="Motif du refus"
                      className="w-44 rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                    />
                    <ConfirmSubmit
                      message={`Refuser la demande de ${r.company_name} ? Le montant redevient disponible pour lui.`}
                      className="rounded-md bg-error/10 px-md py-xs text-xs font-bold text-error hover:bg-error/20"
                    >
                      Refuser
                    </ConfirmSubmit>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          {recentRequests.length > 0 && (
            <ul className="mt-md divide-y divide-neutral-100 overflow-hidden rounded-xl bg-white text-xs shadow-sm ring-1 ring-neutral-200">
              {recentRequests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-sm px-md py-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <span className="text-neutral-600">
                    {dateTimeFr(r.requested_at)} · <strong className="text-neutral-900">{r.company_name}</strong>
                    {r.invoice_number && ` · facture ${r.invoice_number}`}
                    {r.reference && ` · réf. ${r.reference}`}
                    {r.reason && ` · ${r.reason}`}
                  </span>
                  <span>
                    {fmt(r.amount_fcfa)} F (AIB {fmt(r.aib_fcfa)}, frais {fmt(r.fee_fcfa)}) → <strong className="text-neutral-900">{fmt(r.net_fcfa)} F</strong>{' '}
                    <span className="font-bold text-neutral-700">{REQUEST_STATUS[r.status]}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---------- Versements ---------- */}
      {wallets.length > 0 && (
        <section className="mb-2xl">
          <div className="mb-sm flex flex-wrap items-baseline justify-between gap-sm">
            <h2 className="text-lg font-bold text-neutral-900">Versements aux partenaires</h2>
            <p className="text-sm text-neutral-600">
              À verser au total :{' '}
              <strong className="text-primary-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(totalDue)} F
              </strong>
            </p>
          </div>
          <p className="mb-md rounded-md bg-neutral-100 p-md text-xs leading-relaxed text-neutral-600">
            Le solde de chaque partenaire augmente à chaque course terminée sur ses véhicules. Il demande son versement lui-même (voir ci-dessus).
            Le formulaire « Enregistrer un versement exceptionnel » ci-dessous est un règlement hors demande : <strong>il ne retient pas d&apos;AIB
            et n&apos;exige pas de facture</strong>, à n&apos;utiliser qu&apos;en dernier recours.
          </p>
          <ul className="space-y-sm">
            {wallets.map((w) => (
              <li
                key={w.dealer_id}
                className="flex flex-wrap items-end justify-between gap-md rounded-xl border border-neutral-200 bg-white p-lg shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-neutral-900">
                    {w.company_name}{' '}
                    <span className="font-normal text-neutral-500">· {w.full_name}</span>
                  </p>
                  <p className="text-xs text-neutral-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    Gagné ce mois : {fmt(w.earned_month)} F · depuis le début : {fmt(w.earned_total)} F · déjà versé :{' '}
                    {fmt(w.paid_total)} F
                    {w.last_paid_at &&
                      ` (dernier versement le ${new Date(w.last_paid_at).toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo' })})`}
                  </p>
                  {w.balance_fcfa >= 0 ? (
                    <p
                      className="mt-xs text-lg font-extrabold text-primary-700"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {fmt(w.balance_fcfa)} F à verser
                    </p>
                  ) : (
                    <>
                      <p
                        className="mt-xs text-lg font-extrabold text-error"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        −{fmt(Math.abs(w.balance_fcfa))} F : ce compte doit de l&apos;argent à TamCar
                      </p>
                      <p className="mt-xs max-w-md text-[11px] leading-relaxed text-neutral-500">
                        Ce contact est aussi chauffeur : son portefeuille Revenus est unique, et les commissions des
                        courses payées en espèces s&apos;y déduisent de sa part de partenaire. Rien à lui verser tant
                        que le solde est négatif.
                      </p>
                    </>
                  )}
                </div>
                {w.balance_fcfa > 0 && (
                  <form action={payDealerWalletAction} className="flex flex-wrap items-center gap-xs">
                    <input type="hidden" name="dealer_id" value={w.dealer_id} />
                    <input
                      type="number"
                      name="amount"
                      min={1}
                      max={w.balance_fcfa}
                      defaultValue={w.balance_fcfa}
                      className="w-28 rounded-md border border-neutral-200 bg-white px-md py-xs text-right text-sm"
                    />
                    <input
                      type="text"
                      name="note"
                      placeholder="Note (ex. MoMo du 05/01)"
                      className="w-44 rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                    />
                    <ConfirmSubmit
                      message={`Enregistrer ce versement à ${w.company_name} ? Le montant sera débité de son portefeuille.`}
                      className="rounded-md bg-neutral-800 px-md py-xs text-xs font-bold text-white hover:bg-neutral-900"
                    >
                      Enregistrer un versement exceptionnel
                    </ConfirmSubmit>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-md text-lg font-bold text-neutral-900">
          Partenaires véhicules actifs
        </h2>
        {active.length === 0 ? (
          <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
            Aucun partenaire véhicule actif.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full">
              <thead className="border-b border-neutral-200 bg-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-600">
                <tr>
                  <th className="px-md py-sm">Société</th>
                  <th className="px-md py-sm">Contact</th>
                  <th className="px-md py-sm">Véhicules</th>
                  <th className="px-md py-sm text-right">Part</th>
                  <th className="px-md py-sm text-right">CA cumulé</th>
                  <th className="px-md py-sm text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {active.map((d) => (
                  <tr key={d.dealer_id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-md py-md">
                      <p className="font-semibold text-neutral-900">{d.company_name}</p>
                      {d.rccm && <p className="text-[10px] text-neutral-500">RCCM {d.rccm}</p>}
                    </td>
                    <td className="px-md py-md text-sm text-neutral-700">
                      <p>{d.full_name}</p>
                      <p className="text-[10px] text-neutral-500">{d.phone}</p>
                    </td>
                    <td className="px-md py-md text-sm text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {d.active_vehicles_count}
                    </td>
                    <td className="px-md py-md text-right text-sm text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {d.dealer_share_pct} %
                    </td>
                    <td className="px-md py-md text-right text-sm font-bold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(d.total_dealer_share_fcfa)} F
                      <p className="text-[10px] font-normal text-neutral-500">
                        {d.completed_rides_count} courses
                      </p>
                    </td>
                    <td className="px-md py-md text-right">
                      <div className="flex flex-wrap items-start justify-end gap-xs">
                      <a
                        href={`/dealer?as=${d.dealer_id}`}
                        className="inline-block rounded-md bg-primary-50 px-md py-xs text-xs font-bold text-primary-700 hover:bg-primary-100"
                      >
                        Voir son espace
                      </a>
                      <ResetPasswordControl profileId={d.profile_id} name={d.full_name} />
                      <details className="w-full text-left">
                        <summary className="cursor-pointer rounded-md bg-neutral-100 px-md py-xs text-center text-xs font-bold text-neutral-700 hover:bg-neutral-200">
                          Fiscalité (IFU, AIB)
                        </summary>
                        <form action={setDealerTaxAction} className="mt-xs space-y-xs rounded-md bg-neutral-50 p-sm">
                          <input type="hidden" name="dealer_id" value={d.dealer_id} />
                          <input
                            type="text"
                            name="ifu"
                            defaultValue={taxById.get(d.dealer_id)?.ifu ?? ''}
                            placeholder="Identifiant fiscal unique (IFU)"
                            className="w-full rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                          />
                          <label className="flex items-center gap-xs text-[11px] text-neutral-700">
                            <input type="checkbox" name="aib_exempt" defaultChecked={taxById.get(d.dealer_id)?.aib_exempt ?? false} />
                            Exonération d&apos;AIB constatée
                          </label>
                          <input
                            type="text"
                            name="reason"
                            defaultValue={taxById.get(d.dealer_id)?.aib_exempt_reason ?? ''}
                            placeholder="Motif de l'exonération (obligatoire si cochée)"
                            className="w-full rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                          />
                          <button type="submit" className="rounded-md bg-neutral-800 px-md py-xs text-xs font-bold text-white hover:bg-neutral-900">
                            Enregistrer
                          </button>
                          <p className="text-[10px] text-neutral-500">AIB retenu : 3 % avec IFU, 5 % sans (réglages dans Bonus et réglages).</p>
                        </form>
                      </details>
                      <form action={archiveDealer} className="inline">
                        <input type="hidden" name="id" value={d.dealer_id} />
                        <input type="hidden" name="reason" value="Archivé depuis l'admin" />
                        <ConfirmSubmit
                          message={`Archiver le partenaire véhicule ${d.full_name} ?`}
                          className="rounded-md bg-error/10 px-md py-xs text-xs font-bold text-error hover:bg-error/20"
                        >
                          Archiver
                        </ConfirmSubmit>
                      </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {archived.length > 0 && (
        <section className="mt-2xl">
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
            Archivés
          </h2>
          <ul className="space-y-xs">
            {archived.map((d) => (
              <li key={d.dealer_id} className="rounded-lg bg-white p-md text-sm ring-1 ring-neutral-200">
                <p className="font-semibold text-neutral-700">{d.company_name}</p>
                <p className="text-[11px] text-neutral-500">
                  Archivé le {d.archived_at && new Date(d.archived_at).toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo' })}
                  {d.archive_reason && ` · ${d.archive_reason}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Field({
  label, name, type = 'text', required, defaultValue, placeholder, step,
}: {
  label: string; name: string; type?: string; required?: boolean;
  defaultValue?: string; placeholder?: string; step?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</span>
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        step={step}
        className="mt-xs w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </label>
  );
}
