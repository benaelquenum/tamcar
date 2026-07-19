import { createServerSupabase } from '@/lib/supabase-server';

type VehicleRow = {
  vehicle_id: string;
  plate_number: string;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  category: string;
  status: 'pending' | 'active' | 'maintenance' | 'retired' | 'archived';
  assigned_driver_name: string | null;
  activated_at: string | null;
  created_at: string;
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

export default async function DealerVehiclesPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('vehicle_admin_view')
    .select('vehicle_id, plate_number, brand, model, year, color, category, status, assigned_driver_name, activated_at, created_at, dealer_partner_id')
    .not('dealer_partner_id', 'is', null)
    .order('created_at', { ascending: false });

  const list = (data ?? []) as (VehicleRow & { dealer_partner_id: string | null })[];

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Mes véhicules</h1>
        <p className="text-sm text-neutral-600">
          {list.length} véhicule{list.length > 1 ? 's' : ''} enregistré{list.length > 1 ? 's' : ''}
        </p>
      </div>

      <p className="mb-lg rounded-xl bg-primary-50 p-md text-xs text-primary-800">
        Pour ajouter ou modifier un véhicule, contacte TamCar. L&apos;enregistrement, l&apos;activation
        et l&apos;affectation à un chauffeur sont gérés par l&apos;administrateur.
      </p>

      {list.length === 0 ? (
        <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          Aucun véhicule enregistré.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full">
            <thead className="border-b border-neutral-200 bg-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-600">
              <tr>
                <th className="px-md py-sm">Véhicule</th>
                <th className="px-md py-sm">Statut</th>
                <th className="px-md py-sm">Chauffeur affecté</th>
                <th className="px-md py-sm text-right">Enregistré le</th>
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
                  <td className="px-md py-md">
                    <span className={`inline-flex rounded-full px-sm py-0.5 text-[10px] font-bold ${STATUS_BADGE[v.status]}`}>
                      {STATUS_LABEL[v.status]}
                    </span>
                    {v.activated_at && (
                      <p className="mt-xs text-[10px] text-neutral-500">
                        Activé le {new Date(v.activated_at).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </td>
                  <td className="px-md py-md text-sm text-neutral-700">
                    {v.assigned_driver_name || <span className="text-neutral-400">— Non affecté</span>}
                  </td>
                  <td className="px-md py-md text-right text-xs text-neutral-500">
                    {new Date(v.created_at).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
