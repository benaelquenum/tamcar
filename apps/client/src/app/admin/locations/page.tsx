import { createServerSupabase } from '@/lib/supabase-server';
import { ConfirmRentalForm } from './ConfirmRentalForm';
import { CreateRentalForm } from './CreateRentalForm';
import { KmReview } from './KmReview';
import { RentalRowActions } from './RentalRowActions';

type AdminRental = {
  id: string;
  status: 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  source: 'client' | 'team';
  starts_at: string;
  ends_at: string;
  hours: number;
  pickup_address: string;
  notes: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  client_full_name: string;
  client_phone: string | null;
  driver_full_name: string | null;
  driver_phone: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  price_fcfa: number;
  paid_fcfa: number;
  km_used: number | null;
  extra_km: number | null;
  extra_fcfa: number | null;
  late_cancel: boolean;
  cancel_reason: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
  odometer_start_photo: string | null;
  odometer_end_photo: string | null;
  km_status: 'none' | 'pending' | 'validated';
  extra_settled: boolean;
  km_included_per_day: number;
  km_extra_fcfa: number;
};

const STATUS: Record<AdminRental['status'], { label: string; cls: string }> = {
  requested: { label: 'À confirmer', cls: 'bg-warning/15 text-warning' },
  confirmed: { label: 'Confirmée', cls: 'bg-violet-500/15 text-violet-700' },
  in_progress: { label: 'En cours', cls: 'bg-success/20 text-success' },
  completed: { label: 'Terminée', cls: 'bg-success/10 text-success' },
  cancelled: { label: 'Annulée', cls: 'bg-neutral-200 text-neutral-600' },
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}
function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Porto-Novo',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Africa/Porto-Novo', hour: '2-digit', minute: '2-digit' });
}

function Head({ r }: { r: AdminRental }) {
  const st = STATUS[r.status];
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-sm">
      <p className="text-sm font-bold text-neutral-900">
        {fmtWhen(r.starts_at)} → {fmtTime(r.ends_at)} <span className="font-normal text-neutral-500">({r.hours} h)</span>
      </p>
      <div className="flex items-center gap-sm">
        <span className={`rounded-full px-sm py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
        <span className="text-sm font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmt(r.price_fcfa)} F
        </span>
        {(r.status === 'requested' || r.status === 'confirmed' || r.status === 'in_progress') && (
          <span
            className={`rounded-full px-sm py-0.5 text-[10px] font-bold ${
              r.paid_fcfa >= r.price_fcfa ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
            }`}
          >
            {r.paid_fcfa >= r.price_fcfa ? 'Réglée' : `Réglé ${fmt(r.paid_fcfa)} / ${fmt(r.price_fcfa)} F`}
          </span>
        )}
      </div>
    </div>
  );
}

function Who({ r }: { r: AdminRental }) {
  return (
    <div className="mt-xs space-y-0.5 text-xs text-neutral-700">
      <p>
        <strong>{r.client_full_name}</strong> · {r.client_phone ?? '—'}
        {r.source === 'team' ? <span className="ml-xs text-neutral-400">(créée par l’équipe)</span> : null}
      </p>
      <p>{r.pickup_address}</p>
      {r.contact_name && (
        <p>
          Contact sur place : {r.contact_name} {r.contact_phone ?? ''}
        </p>
      )}
      {r.notes && <p className="italic text-neutral-500">{r.notes}</p>}
      {r.driver_full_name && (
        <p>
          Chauffeur : <strong>{r.driver_full_name}</strong> · {[r.vehicle_brand, r.vehicle_model].filter(Boolean).join(' ')}
          {r.vehicle_plate ? ` (${r.vehicle_plate})` : ''}
        </p>
      )}
    </div>
  );
}

export default async function AdminLocationsPage() {
  const supabase = createServerSupabase();
  const [{ data: openData }, { data: pastData }, { data: rateData }] = await Promise.all([
    supabase.rpc('admin_vehicle_rentals', { p_scope: 'open' }),
    supabase.rpc('admin_vehicle_rentals', { p_scope: 'past' }),
    supabase.from('rental_rates').select('hour_fcfa, day_fcfa, min_hours').eq('category', 'premium').maybeSingle(),
  ]);
  const open = (Array.isArray(openData) ? openData : []) as AdminRental[];
  const past = ((Array.isArray(pastData) ? pastData : []) as AdminRental[]).slice(0, 40);
  const rate = (rateData ?? { hour_fcfa: 3500, day_fcfa: 45000, min_hours: 4 }) as {
    hour_fcfa: number;
    day_fcfa: number | null;
    min_hours: number;
  };

  const requested = open.filter((r) => r.status === 'requested');
  const active = open.filter((r) => r.status !== 'requested');

  // Photos du compteur : bucket privé → liens signés d'une heure.
  const photoPaths = [...open, ...past]
    .flatMap((r) => [r.odometer_start_photo, r.odometer_end_photo])
    .filter((p): p is string => Boolean(p));
  const photoUrls: Record<string, string> = {};
  if (photoPaths.length > 0) {
    const { data: signed } = await supabase.storage.from('rental-photos').createSignedUrls(photoPaths, 3600);
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) photoUrls[item.path] = item.signedUrl;
    }
  }

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Locations VIP</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-warning">{requested.length}</strong> à confirmer ·{' '}
          <strong className="text-neutral-900">{active.length}</strong> à venir ou en cours
        </p>
      </div>

      <section className="mb-2xl">
        <h2 className="mb-md text-lg font-bold text-neutral-900">Demandes à confirmer ({requested.length})</h2>
        {requested.length === 0 ? (
          <div className="rounded-xl bg-white p-xl text-center text-sm text-neutral-600 shadow-sm">
            Aucune demande en attente.
          </div>
        ) : (
          <ul className="space-y-md">
            {requested.map((r) => (
              <li key={r.id} className="rounded-xl bg-white p-md shadow-sm ring-1 ring-warning/30">
                <Head r={r} />
                <Who r={r} />
                <ConfirmRentalForm id={r.id} startsAt={r.starts_at} endsAt={r.ends_at} priceFcfa={r.price_fcfa} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-2xl">
        <h2 className="mb-md text-lg font-bold text-neutral-900">À venir et en cours ({active.length})</h2>
        {active.length === 0 ? (
          <div className="rounded-xl bg-white p-xl text-center text-sm text-neutral-600 shadow-sm">
            Aucune location confirmée.
          </div>
        ) : (
          <ul className="space-y-md">
            {active.map((r) => (
              <li key={r.id} className="rounded-xl bg-white p-md shadow-sm ring-1 ring-neutral-200">
                <Head r={r} />
                <Who r={r} />
                <div className="mt-sm border-t border-neutral-100 pt-sm">
                  <RentalRowActions id={r.id} status={r.status} priceFcfa={r.price_fcfa} paidFcfa={r.paid_fcfa} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-2xl rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <h2 className="mb-md text-lg font-bold text-neutral-900">Créer une location</h2>
        <CreateRentalForm hourFcfa={rate.hour_fcfa} dayFcfa={rate.day_fcfa} minHours={rate.min_hours} />
      </section>

      <section>
        <h2 className="mb-md text-lg font-bold text-neutral-900">Terminées et annulées</h2>
        {past.length === 0 ? (
          <div className="rounded-xl bg-white p-xl text-center text-sm text-neutral-600 shadow-sm">Rien pour l’instant.</div>
        ) : (
          <ul className="space-y-sm">
            {past.map((r) => (
              <li key={r.id} className="rounded-xl bg-white p-md shadow-sm ring-1 ring-neutral-200">
                <Head r={r} />
                <Who r={r} />
                {r.status === 'completed' && (
                  <KmReview
                    id={r.id}
                    hours={r.hours}
                    odometerStart={r.odometer_start}
                    odometerEnd={r.odometer_end}
                    startPhotoUrl={r.odometer_start_photo ? photoUrls[r.odometer_start_photo] ?? null : null}
                    endPhotoUrl={r.odometer_end_photo ? photoUrls[r.odometer_end_photo] ?? null : null}
                    kmIncludedPerDay={r.km_included_per_day}
                    kmExtraFcfa={r.km_extra_fcfa}
                    kmStatus={r.km_status}
                    extraFcfa={r.extra_fcfa}
                    extraKm={r.extra_km}
                    extraSettled={r.extra_settled}
                  />
                )}
                {r.status === 'cancelled' && (
                  <p className="mt-xs text-xs text-neutral-500">
                    {r.late_cancel ? 'Annulation tardive du client. ' : ''}
                    {r.cancel_reason ?? ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
