import { createServerSupabase } from '@/lib/supabase-server';
import { AlertTriangleIcon, CheckIcon, PhoneIcon, PinIcon } from '@/components/Icon';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { acknowledgeSosAction, resolveSosAction } from '../ops-actions';
import { TestSiren } from './TestSiren';

export const dynamic = 'force-dynamic';

type SosRow = {
  id: string;
  ride_id: string | null;
  role: 'client' | 'driver';
  reason: string | null;
  status: 'open' | 'acknowledged' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  lat: number;
  lng: number;
  profiles: { full_name: string | null; phone: string | null } | null;
};

type RideBrief = {
  id: string;
  status: string;
  pickup_address: string | null;
  dropoff_address: string | null;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Porto-Novo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function AdminSosPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('sos_alerts')
    .select('id, ride_id, role, reason, status, created_at, resolved_at, resolution_note, lat, lng, profiles!triggered_by(full_name, phone)')
    .order('created_at', { ascending: false })
    .limit(60);
  const list = (data ?? []) as unknown as SosRow[];
  const active = list.filter((s) => s.status !== 'resolved');
  const history = list.filter((s) => s.status === 'resolved').slice(0, 20);

  const rideIds = Array.from(new Set(list.map((s) => s.ride_id).filter((x): x is string => !!x)));
  const rides = new Map<string, RideBrief>();
  if (rideIds.length > 0) {
    const { data: rd } = await supabase
      .from('rides')
      .select('id, status, pickup_address, dropoff_address')
      .in('id', rideIds);
    for (const r of (rd ?? []) as RideBrief[]) rides.set(r.id, r);
  }

  return (
    <div>
      <div className="mb-lg flex flex-wrap items-baseline justify-between gap-md">
        <h1 className="text-2xl font-extrabold text-neutral-900">Alertes SOS</h1>
        <p className="text-sm text-neutral-600">
          <strong className={active.length > 0 ? 'text-error' : 'text-neutral-900'}>{active.length}</strong> active
          {active.length > 1 ? 's' : ''}
        </p>
      </div>

      <div className="mb-xl rounded-lg bg-neutral-100 p-md text-xs text-neutral-700">
        <p>
          Chaque SOS déclenche : une <strong>sirène</strong> et un bandeau rouge sur toutes vos pages du
          back-office (tant qu&apos;il n&apos;est pas pris en charge), un <strong>badge</strong> sur cet onglet, et
          une <strong>notification push</strong> sur les appareils des admins qui les ont activées.
        </p>
        <div className="mt-sm">
          <TestSiren />
        </div>
      </div>

      {active.length === 0 ? (
        <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          <CheckIcon className="mx-auto h-6 w-6 text-primary-500" strokeWidth={3} />
          <p className="mt-sm">Aucune alerte SOS en cours.</p>
        </div>
      ) : (
        <ul className="space-y-md">
          {active.map((s) => {
            const ride = s.ride_id ? rides.get(s.ride_id) : undefined;
            const phone = s.profiles?.phone ?? null;
            return (
              <li
                key={s.id}
                className={`rounded-xl border-2 bg-white p-lg shadow-sm ${
                  s.status === 'open' ? 'border-error' : 'border-warning/60'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div className="min-w-0">
                    <p className="flex items-center gap-xs text-base font-extrabold text-neutral-900">
                      <AlertTriangleIcon className={`h-5 w-5 ${s.status === 'open' ? 'text-error' : 'text-warning'}`} />
                      {s.role === 'driver' ? 'Chauffeur' : 'Client'} : {s.profiles?.full_name ?? 'Inconnu'}
                      {s.status === 'acknowledged' && (
                        <span className="rounded-full bg-warning/20 px-sm py-0.5 text-[10px] font-bold text-warning">
                          Pris en charge
                        </span>
                      )}
                    </p>
                    <p className="mt-xs text-sm text-neutral-800">{s.reason?.trim() || 'Aucune précision'}</p>
                    <p className="mt-xs text-[11px] text-neutral-500">
                      Reçue le {fmtDate(s.created_at)} · {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                    </p>
                  </div>
                  <div className="flex flex-none flex-wrap gap-xs">
                    {phone && (
                      <a
                        href={`tel:${phone}`}
                        className="inline-flex items-center gap-xs rounded-md bg-primary-600 px-md py-sm text-xs font-bold text-white"
                      >
                        <PhoneIcon className="h-4 w-4" />
                        Appeler {phone}
                      </a>
                    )}
                    <a
                      href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-xs rounded-md bg-error px-md py-sm text-xs font-bold text-white"
                    >
                      <PinIcon className="h-4 w-4" />
                      Localiser
                    </a>
                  </div>
                </div>

                {ride && (
                  <div className="mt-md rounded-md bg-neutral-50 p-sm text-xs text-neutral-700">
                    <p className="font-bold text-neutral-900">Course liée ({ride.status})</p>
                    <p className="truncate">{ride.pickup_address ?? '—'}</p>
                    <p className="truncate text-neutral-500">→ {ride.dropoff_address ?? '—'}</p>
                  </div>
                )}

                <div className="mt-md flex flex-wrap items-end gap-sm">
                  {s.status === 'open' && (
                    <form action={acknowledgeSosAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmSubmit
                        message="Prendre en charge cette alerte ? La sirène s’arrête."
                        className="rounded-md bg-warning px-lg py-sm text-xs font-extrabold text-white hover:brightness-110"
                      >
                        Prendre en charge (arrête la sirène)
                      </ConfirmSubmit>
                    </form>
                  )}
                  <form action={resolveSosAction} className="flex min-w-[260px] flex-1 items-end gap-sm">
                    <input type="hidden" name="id" value={s.id} />
                    <input
                      type="text"
                      name="note"
                      placeholder="Note de résolution (optionnelle)"
                      className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-md py-sm text-xs"
                    />
                    <ConfirmSubmit
                      message="Clôturer cette alerte SOS comme résolue ?"
                      className="flex-none rounded-md bg-success px-md py-sm text-xs font-bold text-white hover:brightness-110"
                    >
                      Résoudre
                    </ConfirmSubmit>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {history.length > 0 && (
        <section className="mt-2xl">
          <h2 className="mb-sm text-sm font-bold uppercase tracking-wider text-neutral-500">Dernières alertes résolues</h2>
          <ul className="divide-y divide-neutral-200 rounded-xl bg-white shadow-sm">
            {history.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-sm px-lg py-md text-xs">
                <span className="font-semibold text-neutral-900">
                  {s.role === 'driver' ? 'Chauffeur' : 'Client'} : {s.profiles?.full_name ?? 'Inconnu'} · {s.reason?.trim() || 'Aucune précision'}
                </span>
                <span className="text-neutral-500">
                  {fmtDate(s.created_at)}
                  {s.resolution_note ? ` · ${s.resolution_note}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
