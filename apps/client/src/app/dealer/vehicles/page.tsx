import { createServerSupabase } from '@/lib/supabase-server';
import { LiveAmount } from '../LiveAmount';
import {
  CAT_LABEL,
  VEHICLE_STATUS_LABEL,
  fmt,
  previewParam,
  type DealerVehicle,
} from '../lib';

export const dynamic = 'force-dynamic';

export default async function DealerVehiclesPage({
  searchParams,
}: {
  searchParams: { as?: string | string[] };
}) {
  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('dealer_my_vehicles', { p_dealer_id: previewParam(searchParams.as) });
  const list = (data ?? []) as DealerVehicle[];

  const monthTotal = list.reduce((s, v) => s + v.month_fcfa, 0);

  return (
    <div>
      <div className="mb-xl flex flex-wrap items-baseline justify-between gap-md">
        <h1 className="text-2xl font-extrabold text-neutral-900">Mes véhicules</h1>
        <p className="text-sm text-neutral-600">
          {list.length} véhicule{list.length > 1 ? 's' : ''} · part du mois :{' '}
          <strong className="text-primary-700">
            <LiveAmount value={monthTotal} />
          </strong>
        </p>
      </div>

      <p className="mb-lg rounded-xl bg-primary-50 p-md text-xs text-primary-800">
        Pour ajouter ou modifier un véhicule, contactez TamCar. L’enregistrement, l’activation et l’affectation à un
        chauffeur sont gérés par l’administrateur.
      </p>

      {list.length === 0 ? (
        <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          Aucun véhicule enregistré.
        </div>
      ) : (
        <ul className="grid gap-md sm:grid-cols-2">
          {list.map((v) => (
            <li key={v.vehicle_id} className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
              <div className="flex items-start justify-between gap-md">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900">
                    {v.brand} {v.model}
                  </p>
                  <p className="text-[11px] text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {v.plate_number} · TamCar {CAT_LABEL[v.category] ?? v.category}
                    {v.color && ` · ${v.color}`}
                    {v.vehicle_year && ` · ${v.vehicle_year}`}
                  </p>
                </div>
                <span
                  className={`flex-none rounded-full px-sm py-0.5 text-[10px] font-bold ${
                    v.status === 'active' ? 'bg-primary-100 text-primary-700' : 'bg-neutral-200 text-neutral-700'
                  }`}
                >
                  {VEHICLE_STATUS_LABEL[v.status]}
                </span>
              </div>

              <dl className="mt-md grid grid-cols-2 gap-sm text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <div>
                  <dt className="text-neutral-500">Chauffeur affecté</dt>
                  <dd className="font-semibold text-neutral-900">
                    {v.driver_name ?? <span className="text-warning">Non affecté</span>}
                    {v.driver_name && (
                      <span className="ml-xs font-normal text-neutral-500">
                        {v.driver_status === 'suspended' ? '· suspendu' : v.driver_online ? '· en ligne' : '· hors ligne'}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Mise en service</dt>
                  <dd className="font-semibold text-neutral-900">
                    {v.activated_at ? new Date(v.activated_at).toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo' }) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Votre part aujourd’hui</dt>
                  <dd className="font-semibold text-neutral-900">
                    {fmt(v.today_fcfa)} F <span className="font-normal text-neutral-500">· {v.today_rides} course{v.today_rides > 1 ? 's' : ''}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Votre part ce mois</dt>
                  <dd className="font-semibold text-primary-700">
                    {fmt(v.month_fcfa)} F <span className="font-normal text-neutral-500">· {v.month_rides} course{v.month_rides > 1 ? 's' : ''}</span>
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
