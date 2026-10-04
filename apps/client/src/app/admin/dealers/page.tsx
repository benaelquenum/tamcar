import { createServerSupabase } from '@/lib/supabase-server';
import { archiveDealer, payDealerWalletAction } from './actions';
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

function fmt(n: number): string {
  return Math.round(Number(n) || 0)
    .toLocaleString('fr-FR')
    .replace(/[  ,]/g, ' ');
}

export default async function AdminDealersPage() {
  const supabase = createServerSupabase();
  const [{ data }, { data: walletsData }] = await Promise.all([
    supabase.from('dealer_admin_view').select('*').order('registered_at', { ascending: false }),
    supabase.rpc('admin_dealer_wallets'),
  ]);
  const list = (data ?? []) as DealerRow[];
  const wallets = ((walletsData ?? []) as WalletRow[]).filter((w) => !w.archived);
  const totalDue = wallets.reduce((sum, w) => sum + w.balance_fcfa, 0);
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
            Le solde de chaque partenaire augmente à chaque course terminée sur ses véhicules. Vous réglez
            hors application (Mobile Money, virement), puis vous enregistrez le versement ici : le montant est
            débité de son portefeuille et apparaît dans son espace.
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
                  <p
                    className="mt-xs text-lg font-extrabold text-primary-700"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {fmt(w.balance_fcfa)} F à verser
                  </p>
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
                      Enregistrer le versement
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
                  Archivé le {d.archived_at && new Date(d.archived_at).toLocaleDateString('fr-FR')}
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
