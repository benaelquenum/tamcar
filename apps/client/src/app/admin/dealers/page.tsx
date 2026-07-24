import { createServerSupabase } from '@/lib/supabase-server';
import { archiveDealer } from './actions';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { CreateDealerForm } from './CreateDealerForm';

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

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export default async function AdminDealersPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('dealer_admin_view')
    .select('*')
    .order('registered_at', { ascending: false });
  const list = (data ?? []) as DealerRow[];
  const active = list.filter((d) => d.archived_at === null);
  const archived = list.filter((d) => d.archived_at !== null);

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Concessionnaires</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-neutral-900">{active.length}</strong> actifs ·{' '}
          <strong className="text-neutral-500">{archived.length}</strong> archivés
        </p>
      </div>

      <CreateDealerForm />

      <section>
        <h2 className="mb-md text-lg font-bold text-neutral-900">
          Concessionnaires actifs
        </h2>
        {active.length === 0 ? (
          <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
            Aucun concessionnaire actif.
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
                      <form action={archiveDealer} className="inline">
                        <input type="hidden" name="id" value={d.dealer_id} />
                        <input type="hidden" name="reason" value="Archivé depuis l'admin" />
                        <ConfirmSubmit
                          message={`Archiver le concessionnaire ${d.full_name} ?`}
                          className="rounded-md bg-error/10 px-md py-xs text-xs font-bold text-error hover:bg-error/20"
                        >
                          Archiver
                        </ConfirmSubmit>
                      </form>
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
