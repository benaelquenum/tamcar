import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  APPLICATION_TYPE_META,
  STATUS_META,
  formatSlotFull,
  type DriverAppointment,
} from '@/lib/appointment';

export default async function AdminAppointmentsPage() {
  const supabase = createServerSupabase();

  const nowIso = new Date().toISOString();

  const { data: upcoming } = await supabase
    .from('driver_appointments')
    .select('*')
    .in('status', ['scheduled', 'confirmed'])
    .order('slot_at', { ascending: true })
    .limit(50);

  const { data: recent } = await supabase
    .from('driver_appointments')
    .select('*')
    .in('status', ['no_show', 'completed_approved', 'completed_rejected', 'cancelled_by_user'])
    .order('updated_at', { ascending: false })
    .limit(30);

  const upcomingList = (upcoming ?? []) as DriverAppointment[];
  const recentList = (recent ?? []) as DriverAppointment[];

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Rendez-vous chauffeurs</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-primary-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {upcomingList.length}
          </strong>{' '}
          à venir ·{' '}
          <strong className="text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {recentList.length}
          </strong>{' '}
          traités récemment
        </p>
      </div>

      <section>
        <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
          À venir (planning)
        </h2>
        {upcomingList.length === 0 ? (
          <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
            Aucun rendez-vous à venir.
          </div>
        ) : (
          <div className="space-y-sm">
            {upcomingList.map((app) => {
              const isPast = new Date(app.slot_at) < new Date(nowIso);
              return <AppointmentRow key={app.id} app={app} highlightPast={isPast} />;
            })}
          </div>
        )}
      </section>

      {recentList.length > 0 && (
        <section className="mt-2xl">
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
            Récemment traités
          </h2>
          <div className="space-y-sm opacity-70">
            {recentList.map((app) => (
              <AppointmentRow key={app.id} app={app} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AppointmentRow({
  app,
  highlightPast,
}: {
  app: DriverAppointment;
  highlightPast?: boolean;
}) {
  const status = STATUS_META[app.status];
  const typeMeta = APPLICATION_TYPE_META[app.application_type];
  return (
    <Link
      href={`/admin/candidatures/${app.id}`}
      className={`flex items-center gap-md rounded-xl border p-md shadow-sm transition hover:shadow-md ${
        highlightPast ? 'border-warning/40 bg-warning/5' : 'border-neutral-200 bg-white'
      }`}
    >
      <div className="grid h-12 w-16 flex-none place-items-center rounded-lg bg-primary-500 text-xs font-bold text-white">
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{app.visitor_number}</span>
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-neutral-900">
          {app.first_name} {app.last_name}
        </p>
        <p className="text-xs text-neutral-600">
          {typeMeta.label} · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{app.phone}</span>
        </p>
        <p className="text-[10px] text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatSlotFull(app.slot_at)}
        </p>
      </div>
      <span className={`inline-flex rounded-full px-sm py-0.5 text-[10px] font-bold ${status.color}`}>
        {status.label}
      </span>
    </Link>
  );
}
