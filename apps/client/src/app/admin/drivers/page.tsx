import { createServerSupabase } from '@/lib/supabase-server';
import { AlertTriangleIcon, TargetIcon2 } from '@/components/Icon';
import { suspendDriver, unsuspendDriver, archiveDriver } from './actions';
import { CreateDriverForm } from './CreateDriverForm';

type DriverRow = {
  driver_id: string;
  profile_id: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  application_type: 'cession' | 'proprietaire';
  status: 'pending' | 'active' | 'suspended' | 'archived';
  kyc_status: string;
  is_online: boolean;
  license_number: string | null;
  id_card_number: string | null;
  rating_avg: number;
  rating_count: number;
  current_vehicle_id: string | null;
  registered_at: string;
  archived_at: string | null;
  archive_reason: string | null;
  total_cash_fcfa: number;
  total_rachat_fcfa: number;
  completed_rides_count: number;
  cancelled_by_driver_count: number;
  driver_fault_strikes: number;
  pending_disputes_count: number;
};

function strikesBadge(strikes: number, pending: number): { className: string; label: string; warn: boolean } | null {
  const total = strikes + pending;
  if (total === 0) return null;
  if (total >= 5) return { className: 'bg-error text-white', label: String(total), warn: true };
  if (total >= 3) return { className: 'bg-error/15 text-error', label: `${total}`, warn: false };
  return { className: 'bg-warning/15 text-warning', label: `${total}`, warn: false };
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

const STATUS_BADGE: Record<DriverRow['status'], string> = {
  pending: 'bg-neutral-200 text-neutral-700',
  active: 'bg-primary-100 text-primary-700',
  suspended: 'bg-warning/20 text-warning',
  archived: 'bg-neutral-800 text-white',
};

const STATUS_LABEL: Record<DriverRow['status'], string> = {
  pending: 'En attente',
  active: 'Actif',
  suspended: 'Suspendu',
  archived: 'Archivé',
};

export default async function AdminDriversPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('driver_admin_view')
    .select('*')
    .order('registered_at', { ascending: false });
  const list = (data ?? []) as DriverRow[];
  const active = list.filter((d) => d.status !== 'archived');
  const archived = list.filter((d) => d.status === 'archived');
  const watchList = active
    .filter((d) => (d.driver_fault_strikes ?? 0) + (d.pending_disputes_count ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.driver_fault_strikes + b.pending_disputes_count) -
        (a.driver_fault_strikes + a.pending_disputes_count),
    );

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Chauffeurs</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-neutral-900">{active.filter((d) => d.status === 'active').length}</strong> actifs ·{' '}
          <strong className="text-warning">{list.filter((d) => d.status === 'suspended').length}</strong> suspendus ·{' '}
          <strong className="text-neutral-500">{archived.length}</strong> archivés
        </p>
      </div>

      <CreateDriverForm />

      {watchList.length > 0 && (
        <section className="mb-2xl">
          <div className="mb-md flex items-baseline justify-between">
            <h2 className="flex items-center gap-xs text-lg font-bold text-neutral-900">
              <TargetIcon2 className="h-5 w-5 text-error" />
              Chauffeurs à surveiller
            </h2>
            <p className="text-xs text-neutral-600">
              Strikes prouvés + litiges en attente
            </p>
          </div>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-error/20">
            <table className="w-full">
              <thead className="border-b border-neutral-200 bg-error/5 text-left text-xs font-bold uppercase tracking-wider text-neutral-600">
                <tr>
                  <th className="px-md py-sm">Chauffeur</th>
                  <th className="px-md py-sm text-right">Strikes prouvés</th>
                  <th className="px-md py-sm text-right">Litiges en attente</th>
                  <th className="px-md py-sm text-right">Annul. chauffeur</th>
                  <th className="px-md py-sm text-right">Note</th>
                </tr>
              </thead>
              <tbody>
                {watchList.map((d) => (
                  <tr key={d.driver_id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-md py-md">
                      <p className="font-semibold text-neutral-900">{d.full_name}</p>
                      <p className="text-[10px] text-neutral-500">{d.phone}</p>
                    </td>
                    <td className="px-md py-md text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <span className={`inline-block rounded-full px-sm py-0.5 text-xs font-bold ${
                        d.driver_fault_strikes >= 3 ? 'bg-error text-white' : 'bg-error/15 text-error'
                      }`}>
                        {d.driver_fault_strikes}
                      </span>
                    </td>
                    <td className="px-md py-md text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {d.pending_disputes_count > 0 ? (
                        <a
                          href="/admin/litiges"
                          className="inline-block rounded-full bg-warning/15 px-sm py-0.5 text-xs font-bold text-warning hover:bg-warning/30"
                        >
                          {d.pending_disputes_count} →
                        </a>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-md py-md text-right text-sm text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {d.cancelled_by_driver_count}
                    </td>
                    <td className="px-md py-md text-right text-sm text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {d.rating_count > 0 ? `${d.rating_avg.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-md text-lg font-bold text-neutral-900">Chauffeurs</h2>
        {active.length === 0 ? (
          <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
            Aucun chauffeur.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full">
              <thead className="border-b border-neutral-200 bg-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-600">
                <tr>
                  <th className="px-md py-sm">Chauffeur</th>
                  <th className="px-md py-sm">Formule</th>
                  <th className="px-md py-sm">Statut</th>
                  <th className="px-md py-sm text-right">Courses</th>
                  <th className="px-md py-sm text-right">Strikes</th>
                  <th className="px-md py-sm text-right">Cash cumulé</th>
                  <th className="px-md py-sm text-right">Note</th>
                  <th className="px-md py-sm text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {active.map((d) => (
                  <tr key={d.driver_id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-md py-md">
                      <p className="font-semibold text-neutral-900">{d.full_name}</p>
                      <p className="text-[10px] text-neutral-500">{d.phone}</p>
                      {d.license_number && (
                        <p className="text-[10px] text-neutral-400">Permis {d.license_number}</p>
                      )}
                    </td>
                    <td className="px-md py-md text-sm text-neutral-700">
                      {d.application_type === 'cession' ? 'Cession' : 'Propriétaire'}
                    </td>
                    <td className="px-md py-md">
                      <span className={`inline-flex rounded-full px-sm py-0.5 text-[10px] font-bold ${STATUS_BADGE[d.status]}`}>
                        {STATUS_LABEL[d.status]}
                      </span>
                      {d.is_online && (
                        <span className="ml-xs inline-flex items-center gap-xs rounded-full bg-primary-500/10 px-sm py-0.5 text-[10px] font-bold text-primary-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary-500 animate-pulse" />
                          En ligne
                        </span>
                      )}
                    </td>
                    <td className="px-md py-md text-right text-sm text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {d.completed_rides_count}
                      {d.cancelled_by_driver_count > 0 && (
                        <p className="text-[10px] text-error">
                          −{d.cancelled_by_driver_count} annul.
                        </p>
                      )}
                    </td>
                    <td className="px-md py-md text-right text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {(() => {
                        const b = strikesBadge(d.driver_fault_strikes, d.pending_disputes_count);
                        return b ? (
                          <span className={`inline-flex items-center gap-xs rounded-full px-sm py-0.5 text-[11px] font-bold ${b.className}`}>
                            {b.warn && <AlertTriangleIcon className="h-3 w-3" />}
                            {b.label}
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        );
                      })()}
                    </td>
                    <td className="px-md py-md text-right text-sm font-bold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(d.total_cash_fcfa)} F
                    </td>
                    <td className="px-md py-md text-right text-sm text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {d.rating_count > 0 ? `${d.rating_avg.toFixed(2)} (${d.rating_count})` : '—'}
                    </td>
                    <td className="px-md py-md text-right">
                      <div className="flex flex-wrap justify-end gap-xs">
                        {d.status === 'active' && (
                          <form action={suspendDriver} className="inline">
                            <input type="hidden" name="id" value={d.driver_id} />
                            <input type="hidden" name="reason" value="Suspendu depuis l'admin" />
                            <button
                              type="submit"
                              className="rounded-md bg-warning/10 px-md py-xs text-xs font-bold text-warning hover:bg-warning/20"
                            >
                              Suspendre
                            </button>
                          </form>
                        )}
                        {d.status === 'suspended' && (
                          <form action={unsuspendDriver} className="inline">
                            <input type="hidden" name="id" value={d.driver_id} />
                            <button
                              type="submit"
                              className="rounded-md bg-primary-500 px-md py-xs text-xs font-bold text-white hover:brightness-110"
                            >
                              Réactiver
                            </button>
                          </form>
                        )}
                        <form action={archiveDriver} className="inline">
                          <input type="hidden" name="id" value={d.driver_id} />
                          <input type="hidden" name="reason" value="Archivé depuis l'admin" />
                          <button
                            type="submit"
                            className="rounded-md bg-neutral-800 px-md py-xs text-xs font-bold text-white hover:brightness-110"
                          >
                            Archiver
                          </button>
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
              <li key={d.driver_id} className="rounded-lg bg-white p-md text-sm ring-1 ring-neutral-200">
                <p className="font-semibold text-neutral-700">{d.full_name}</p>
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
  label, name, type = 'text', required, defaultValue, placeholder,
}: {
  label: string; name: string; type?: string; required?: boolean;
  defaultValue?: string; placeholder?: string;
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
        className="mt-xs w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </label>
  );
}
