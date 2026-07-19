import { createServerSupabase } from '@/lib/supabase-server';
import { createVehicle, activateVehicle, assignVehicle } from './actions';
import { VehicleFormFields } from './VehicleFormFields';

type VehicleRow = {
  vehicle_id: string;
  plate_number: string;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  category: string;
  status: 'pending' | 'active' | 'maintenance' | 'retired' | 'archived';
  dealer_partner_id: string | null;
  owner_profile_id: string | null;
  formula: 'cession' | 'proprietaire';
  activated_at: string | null;
  created_at: string;
  dealer_company: string | null;
  owner_full_name: string | null;
  assigned_driver_id: string | null;
  assigned_driver_name: string | null;
};

type DealerOption = { dealer_id: string; company_name: string };
type DriverOption = {
  driver_id: string; profile_id: string; full_name: string;
  application_type: 'cession' | 'proprietaire'; status: string;
};

const STATUS_BADGE: Record<VehicleRow['status'], string> = {
  pending: 'bg-warning/20 text-warning',
  active: 'bg-primary-100 text-primary-700',
  maintenance: 'bg-neutral-200 text-neutral-700',
  retired: 'bg-neutral-500 text-white',
  archived: 'bg-neutral-800 text-white',
};

const STATUS_LABEL: Record<VehicleRow['status'], string> = {
  pending: 'En attente activation',
  active: 'Actif',
  maintenance: 'Maintenance',
  retired: 'Retiré',
  archived: 'Archivé',
};

export default async function AdminVehiclesPage() {
  const supabase = createServerSupabase();
  const [{ data: vehicles }, { data: dealers }, { data: drivers }] = await Promise.all([
    supabase.from('vehicle_admin_view').select('*').order('created_at', { ascending: false }),
    supabase.from('dealer_admin_view').select('dealer_id, company_name').is('archived_at', null),
    supabase.from('driver_admin_view').select('driver_id, profile_id, full_name, application_type, status').eq('status', 'active'),
  ]);

  const V = (vehicles ?? []) as VehicleRow[];
  const D = (dealers ?? []) as DealerOption[];
  const DR = (drivers ?? []) as DriverOption[];

  const pending = V.filter((v) => v.status === 'pending');
  const active = V.filter((v) => v.status === 'active');
  const other = V.filter((v) => !['pending', 'active'].includes(v.status));

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Véhicules</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-warning">{pending.length}</strong> en attente ·{' '}
          <strong className="text-primary-700">{active.length}</strong> actifs ·{' '}
          <strong className="text-neutral-500">{other.length}</strong> autres
        </p>
      </div>

      <section className="mb-2xl rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
        <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
          Enregistrer un véhicule
        </h2>
        <form action={createVehicle} className="grid grid-cols-1 gap-md md:grid-cols-2">
          <Field label="Plaque *" name="plate" required placeholder="AA-1234-RB" />
          <Field label="Marque *" name="brand" required placeholder="Toyota" />
          <Field label="Modèle *" name="model" required placeholder="Corolla" />
          <Field label="Année" name="year" type="number" placeholder="2020" />
          <Field label="Couleur" name="color" placeholder="Blanc" />
          <Field label="Places" name="seats" type="number" defaultValue="4" />
          <Select
            label="Catégorie *" name="category"
            options={[
              { value: 'essentiel', label: 'Essentiel' },
              { value: 'confort', label: 'Confort' },
            ]}
          />
          {/* Formule dérivée automatiquement : dealer choisi → cession, sinon → propriétaire */}
          <VehicleFormFields
            dealers={D}
            ownerCandidates={DR.filter((d) => d.application_type === 'proprietaire').map((d) => ({
              driver_id: d.driver_id,
              profile_id: d.profile_id,
              full_name: d.full_name,
            }))}
          />
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-gradient-to-r from-primary-500 to-primary-700 px-lg py-sm text-sm font-bold text-white shadow-glow"
            >
              Enregistrer
            </button>
            <p className="mt-xs text-[11px] text-neutral-500">
              Le véhicule sera créé en statut &quot;pending&quot; jusqu&apos;à activation.
            </p>
          </div>
        </form>
      </section>

      {pending.length > 0 && (
        <Section title="En attente d'activation">
          <VehicleTable list={pending} drivers={DR} showActivate showAssign={false} />
        </Section>
      )}

      <Section title="Véhicules actifs">
        <VehicleTable list={active} drivers={DR} showActivate={false} showAssign />
      </Section>

      {other.length > 0 && (
        <Section title="Autres">
          <VehicleTable list={other} drivers={DR} showActivate={false} showAssign={false} />
        </Section>
      )}
    </div>
  );
}

function VehicleTable({
  list, drivers, showActivate, showAssign,
}: {
  list: VehicleRow[]; drivers: DriverOption[];
  showActivate: boolean; showAssign: boolean;
}) {
  if (list.length === 0) {
    return (
      <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
        Aucun véhicule.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <table className="w-full">
        <thead className="border-b border-neutral-200 bg-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-600">
          <tr>
            <th className="px-md py-sm">Véhicule</th>
            <th className="px-md py-sm">Formule / Propriété</th>
            <th className="px-md py-sm">Statut</th>
            <th className="px-md py-sm">Chauffeur affecté</th>
            <th className="px-md py-sm text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.map((v) => (
            <tr key={v.vehicle_id} className="border-b border-neutral-100 last:border-0">
              <td className="px-md py-md">
                <p className="font-semibold text-neutral-900">{v.brand} {v.model}</p>
                <p className="text-[10px] text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {v.plate_number} · TamCar {v.category}
                  {v.color && ` · ${v.color}`}
                  {v.year && ` · ${v.year}`}
                </p>
              </td>
              <td className="px-md py-md text-sm text-neutral-700">
                {v.formula === 'cession'
                  ? <>Cession · <strong>{v.dealer_company || '—'}</strong></>
                  : <>Propriétaire · <strong>{v.owner_full_name || '—'}</strong></>}
              </td>
              <td className="px-md py-md">
                <span className={`inline-flex rounded-full px-sm py-0.5 text-[10px] font-bold ${STATUS_BADGE[v.status]}`}>
                  {STATUS_LABEL[v.status]}
                </span>
              </td>
              <td className="px-md py-md text-sm text-neutral-700">
                {v.assigned_driver_name || <span className="text-neutral-400">Non affecté</span>}
              </td>
              <td className="px-md py-md text-right">
                <div className="flex flex-wrap justify-end gap-xs">
                  {showActivate && (
                    <form action={activateVehicle} className="inline">
                      <input type="hidden" name="id" value={v.vehicle_id} />
                      <button
                        type="submit"
                        className="rounded-md bg-primary-500 px-md py-xs text-xs font-bold text-white hover:brightness-110"
                      >
                        Activer
                      </button>
                    </form>
                  )}
                  {showAssign && (
                    <form action={assignVehicle} className="inline-flex gap-xs">
                      <input type="hidden" name="vehicle_id" value={v.vehicle_id} />
                      <select
                        name="driver_id"
                        required
                        defaultValue=""
                        className="rounded-md bg-neutral-100 px-sm py-xs text-xs ring-1 ring-neutral-200"
                      >
                        <option value="" disabled>Choisir chauffeur…</option>
                        {drivers
                          .filter((d) => d.application_type === v.formula)
                          .map((d) => (
                            <option key={d.driver_id} value={d.driver_id}>{d.full_name}</option>
                          ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md bg-neutral-800 px-md py-xs text-xs font-bold text-white hover:brightness-110"
                      >
                        Affecter
                      </button>
                    </form>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-2xl">
      <h2 className="mb-md text-lg font-bold text-neutral-900">{title}</h2>
      {children}
    </section>
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

function Select({
  label, name, options,
}: { label: string; name: string; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</span>
      <select
        name={name}
        className="mt-xs w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
