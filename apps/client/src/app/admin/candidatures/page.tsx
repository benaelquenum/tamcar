import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import { STATUS_META, type DriverApplication } from '@/lib/driver-application';

type Row = Pick<
  DriverApplication,
  'id' | 'first_name' | 'last_name' | 'phone' | 'dealer_company_name' | 'vehicle_plate' | 'vehicle_brand' | 'vehicle_model' | 'vehicle_category' | 'status' | 'submitted_at' | 'created_at'
>;

export default async function AdminCandidaturesPage() {
  const supabase = createServerSupabase();

  const { data: pending } = await supabase
    .from('driver_applications')
    .select('id, first_name, last_name, phone, dealer_company_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_category, status, submitted_at, created_at')
    .in('status', ['submitted', 'in_review'])
    .order('submitted_at', { ascending: false })
    .limit(50);

  const { data: recent } = await supabase
    .from('driver_applications')
    .select('id, first_name, last_name, phone, dealer_company_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_category, status, submitted_at, created_at')
    .in('status', ['approved', 'rejected'])
    .order('submitted_at', { ascending: false })
    .limit(20);

  const pendingList = (pending ?? []) as Row[];
  const recentList = (recent ?? []) as Row[];

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Candidatures chauffeurs</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-primary-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {pendingList.length}
          </strong> en attente ·{' '}
          <strong className="text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {recentList.length}
          </strong> récentes traitées
        </p>
      </div>

      <section>
        <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
          À modérer
        </h2>
        {pendingList.length === 0 ? (
          <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
            Aucune candidature en attente. 👌
          </div>
        ) : (
          <div className="space-y-sm">
            {pendingList.map((a) => (
              <CandidatureRow key={a.id} app={a} />
            ))}
          </div>
        )}
      </section>

      {recentList.length > 0 && (
        <section className="mt-2xl">
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
            Récemment traitées
          </h2>
          <div className="space-y-sm opacity-70">
            {recentList.map((a) => (
              <CandidatureRow key={a.id} app={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CandidatureRow({ app }: { app: Row }) {
  const status = STATUS_META[app.status];
  return (
    <Link
      href={`/admin/candidatures/${app.id}`}
      className="flex items-center gap-md rounded-xl border border-neutral-200 bg-white p-md shadow-sm transition hover:shadow-md"
    >
      <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-neutral-100 text-lg font-bold text-neutral-600">
        {app.first_name.charAt(0)}{app.last_name.charAt(0)}
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-neutral-900">
          {app.first_name} {app.last_name}
        </p>
        <p className="text-xs text-neutral-600">
          {app.vehicle_brand} {app.vehicle_model} · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{app.vehicle_plate}</span> · TamCar {app.vehicle_category}
        </p>
        <p className="text-[10px] text-neutral-500">
          {app.dealer_company_name} · {new Date(app.submitted_at).toLocaleString('fr-FR', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </div>
      <span className={`inline-flex rounded-full px-sm py-0.5 text-[10px] font-bold ${status.color}`}>
        {status.label}
      </span>
    </Link>
  );
}
