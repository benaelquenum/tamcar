import { createServerSupabase } from '@/lib/supabase-server';

type RideRow = {
  id: string;
  status: string;
  price_total_fcfa: number;
  dealer_share_fcfa: number;
  driver_share_fcfa: number;
  distance_km: number | null;
  pickup_address: string;
  dropoff_address: string;
  vehicle_id: string | null;
  requested_at: string;
  ended_at: string | null;
};

type VehicleRow = { id: string; plate_number: string; brand: string; model: string };

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export default async function DealerTransactionsPage() {
  const supabase = createServerSupabase();
  const [{ data: rides }, { data: vehicles }] = await Promise.all([
    supabase
      .from('rides_view')
      .select('id, status, price_total_fcfa, dealer_share_fcfa, driver_share_fcfa, distance_km, pickup_address, dropoff_address, vehicle_id, requested_at, ended_at, dealer_partner_id')
      .not('dealer_partner_id', 'is', null)
      .eq('status', 'completed')
      .order('ended_at', { ascending: false })
      .limit(500),
    supabase
      .from('vehicles')
      .select('id, plate_number, brand, model'),
  ]);

  const R = ((rides ?? []) as (RideRow & { dealer_partner_id: string | null })[])
    .filter((r) => r.dealer_partner_id !== null) as RideRow[];
  const V = (vehicles ?? []) as VehicleRow[];
  const vehicleById = new Map(V.map((v) => [v.id, v]));

  const totalGross = R.reduce((s, r) => s + r.price_total_fcfa, 0);
  const totalShare = R.reduce((s, r) => s + r.dealer_share_fcfa, 0);

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Transactions</h1>
        <p className="text-sm text-neutral-600">
          {R.length} course{R.length > 1 ? 's' : ''} terminée{R.length > 1 ? 's' : ''}
        </p>
      </div>

      <div className="mb-lg grid grid-cols-2 gap-md">
        <div className="rounded-xl bg-white p-md ring-1 ring-neutral-200">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            CA total (prix courses)
          </p>
          <p className="mt-xs text-2xl font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(totalGross)} F
          </p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 p-md text-white shadow-glow">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary-100">
            Ma part cumulée
          </p>
          <p className="mt-xs text-2xl font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(totalShare)} F
          </p>
        </div>
      </div>

      {R.length === 0 ? (
        <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          Aucune course encore.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full">
            <thead className="border-b border-neutral-200 bg-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-600">
              <tr>
                <th className="px-md py-sm">Terminée le</th>
                <th className="px-md py-sm">Trajet</th>
                <th className="px-md py-sm">Véhicule</th>
                <th className="px-md py-sm text-right">Prix</th>
                <th className="px-md py-sm text-right">Ma part</th>
              </tr>
            </thead>
            <tbody>
              {R.map((r) => {
                const v = r.vehicle_id ? vehicleById.get(r.vehicle_id) : null;
                return (
                  <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-md py-md text-xs text-neutral-600">
                      {r.ended_at
                        ? new Date(r.ended_at).toLocaleString('fr-FR', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="px-md py-md text-sm">
                      <p className="truncate font-medium text-neutral-900" title={r.pickup_address}>
                        {r.pickup_address}
                      </p>
                      <p className="truncate text-[10px] text-neutral-500" title={r.dropoff_address}>
                        → {r.dropoff_address}
                      </p>
                      {r.distance_km && (
                        <p className="mt-xs text-[10px] text-neutral-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {r.distance_km.toFixed(1)} km
                        </p>
                      )}
                    </td>
                    <td className="px-md py-md text-xs text-neutral-700">
                      {v ? (
                        <>
                          <p className="font-medium">{v.brand} {v.model}</p>
                          <p className="text-[10px] text-neutral-500">{v.plate_number}</p>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-md py-md text-right text-sm text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(r.price_total_fcfa)} F
                    </td>
                    <td className="px-md py-md text-right text-sm font-bold text-primary-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      +{fmt(r.dealer_share_fcfa)} F
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
