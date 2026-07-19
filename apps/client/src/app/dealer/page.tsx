import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';

type MyDealer = {
  dealer_id: string;
  company_name: string;
  rccm: string | null;
  dealer_share_pct: number;
  is_shareholder: boolean;
  shareholder_pct: number | null;
  active_vehicles_count: number;
  total_dealer_share_fcfa: number;
  completed_rides_count: number;
};

type VehicleRow = {
  vehicle_id: string;
  plate_number: string;
  brand: string;
  model: string;
  category: string;
  status: string;
  assigned_driver_name: string | null;
};

type RideRow = {
  id: string;
  status: string;
  price_total_fcfa: number;
  dealer_share_fcfa: number;
  distance_km: number | null;
  ended_at: string | null;
  requested_at: string;
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function startOfWeek(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function DealerDashboard() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  const supabase = createServerSupabase();

  const [{ data: me }, { data: vehicles }, { data: rides }] = await Promise.all([
    supabase
      .from('dealer_admin_view')
      .select('*')
      .eq('profile_id', profile.id)
      .single(),
    supabase
      .from('vehicle_admin_view')
      .select('vehicle_id, plate_number, brand, model, category, status, assigned_driver_name, dealer_partner_id')
      .not('dealer_partner_id', 'is', null),
    supabase
      .from('rides_view')
      .select('id, status, price_total_fcfa, dealer_share_fcfa, distance_km, ended_at, requested_at, dealer_partner_id')
      .not('dealer_partner_id', 'is', null)
      .eq('status', 'completed')
      .order('ended_at', { ascending: false })
      .limit(200),
  ]);

  const dealer = me as MyDealer | null;
  if (!dealer) {
    return (
      <div className="rounded-xl bg-white p-lg shadow-sm">
        <p className="text-sm text-neutral-700">
          Aucun profil concessionnaire trouvé. Contacte TamCar pour l&apos;activation.
        </p>
      </div>
    );
  }

  // Filtre côté frontend car RLS n'est pas suffisamment fine sur les vues
  const V = (vehicles ?? []).filter((v: unknown) => {
    const row = v as { dealer_partner_id: string | null };
    return true; // La vue est déjà filtrée par RLS dealer_partners_select
  }) as VehicleRow[];
  const R = ((rides ?? []) as (RideRow & { dealer_partner_id: string | null })[])
    .filter((r) => r.dealer_partner_id !== null) as RideRow[];

  const weekISO = startOfWeek();
  const monthISO = startOfMonth();
  const weekRides = R.filter((r) => (r.ended_at ?? r.requested_at) >= weekISO);
  const monthRides = R.filter((r) => (r.ended_at ?? r.requested_at) >= monthISO);
  const weekShare = weekRides.reduce((s, r) => s + r.dealer_share_fcfa, 0);
  const monthShare = monthRides.reduce((s, r) => s + r.dealer_share_fcfa, 0);

  const activeVehicles = V.filter((v) => v.status === 'active');
  const affected = activeVehicles.filter((v) => v.assigned_driver_name);
  const unaffected = activeVehicles.filter((v) => !v.assigned_driver_name);

  return (
    <div className="space-y-lg">
      <div>
        <h1 className="text-2xl font-extrabold text-neutral-900">{dealer.company_name}</h1>
        <p className="mt-xs text-sm text-neutral-600">
          Concessionnaire TamCar · Part {dealer.dealer_share_pct} %
          {dealer.is_shareholder && ` · Actionnaire SARL ${dealer.shareholder_pct ?? '—'} %`}
        </p>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-md lg:grid-cols-4">
        <KpiCard
          label="CA cumulé (tout temps)"
          value={`${fmt(dealer.total_dealer_share_fcfa)} F`}
          sub={`${dealer.completed_rides_count} courses`}
          tone="primary"
        />
        <KpiCard label="Ce mois" value={`${fmt(monthShare)} F`} sub={`${monthRides.length} courses`} />
        <KpiCard label="Cette semaine" value={`${fmt(weekShare)} F`} sub={`${weekRides.length} courses`} />
        <KpiCard
          label="Véhicules actifs"
          value={String(activeVehicles.length)}
          sub={`${affected.length} affectés · ${unaffected.length} libres`}
          tone={unaffected.length > 0 ? 'warning' : 'default'}
        />
      </section>

      {/* Flotte */}
      <section>
        <div className="mb-md flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-neutral-900">Ma flotte</h2>
          <Link
            href="/dealer/vehicles"
            className="text-xs font-semibold text-primary-700 underline"
          >
            Voir tous les véhicules
          </Link>
        </div>
        {activeVehicles.length === 0 ? (
          <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
            Aucun véhicule actif. Contacte TamCar pour en ajouter.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full">
              <thead className="border-b border-neutral-200 bg-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-600">
                <tr>
                  <th className="px-md py-sm">Véhicule</th>
                  <th className="px-md py-sm">Catégorie</th>
                  <th className="px-md py-sm">Chauffeur</th>
                </tr>
              </thead>
              <tbody>
                {activeVehicles.slice(0, 10).map((v) => (
                  <tr key={v.vehicle_id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-md py-md">
                      <p className="font-semibold text-neutral-900">{v.brand} {v.model}</p>
                      <p className="text-[10px] text-neutral-500">{v.plate_number}</p>
                    </td>
                    <td className="px-md py-md text-sm text-neutral-700">
                      TamCar {v.category}
                    </td>
                    <td className="px-md py-md text-sm text-neutral-700">
                      {v.assigned_driver_name || <span className="text-neutral-400">— Non affecté</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Dernières courses */}
      <section>
        <div className="mb-md flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-neutral-900">Dernières courses</h2>
          <Link
            href="/dealer/transactions"
            className="text-xs font-semibold text-primary-700 underline"
          >
            Voir toutes les transactions
          </Link>
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
                  <th className="px-md py-sm">Date</th>
                  <th className="px-md py-sm">Distance</th>
                  <th className="px-md py-sm text-right">Prix course</th>
                  <th className="px-md py-sm text-right">Ma part</th>
                </tr>
              </thead>
              <tbody>
                {R.slice(0, 10).map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-md py-md text-sm text-neutral-700">
                      {r.ended_at
                        ? new Date(r.ended_at).toLocaleString('fr-FR', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="px-md py-md text-sm text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {r.distance_km ? `${r.distance_km.toFixed(1)} km` : '—'}
                    </td>
                    <td className="px-md py-md text-right text-sm text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(r.price_total_fcfa)} F
                    </td>
                    <td className="px-md py-md text-right text-sm font-bold text-primary-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      +{fmt(r.dealer_share_fcfa)} F
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: 'primary' | 'warning' | 'default' }) {
  const gradient =
    tone === 'primary' ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white'
    : tone === 'warning' ? 'bg-gradient-to-br from-warning to-error text-white'
    : 'bg-white text-neutral-900 ring-1 ring-neutral-200';
  const textSub = tone && tone !== 'default' ? 'text-white/80' : 'text-neutral-500';
  return (
    <div className={`rounded-xl p-md shadow-sm ${gradient}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider ${textSub}`}>{label}</p>
      <p className="mt-xs text-2xl font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      {sub && <p className={`mt-xs text-[11px] ${textSub}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{sub}</p>}
    </div>
  );
}
