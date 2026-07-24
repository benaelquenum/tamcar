import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending_driver: { label: 'Recherche chauffeur', cls: 'bg-primary-50 text-primary-700' },
  awaiting_payment: { label: 'À confirmer', cls: 'bg-amber-50 text-amber-700' },
  active: { label: 'Actif', cls: 'bg-emerald-50 text-emerald-700' },
  paused: { label: 'En pause', cls: 'bg-neutral-100 text-neutral-600' },
  expired: { label: 'Expiré', cls: 'bg-neutral-100 text-neutral-500' },
  cancelled: { label: 'Annulé', cls: 'bg-neutral-100 text-neutral-500' },
};

const RIDE_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  planned: { label: 'Planifié', cls: 'bg-neutral-100 text-neutral-600' },
  generated: { label: 'Programmé', cls: 'bg-primary-50 text-primary-700' },
  completed: { label: 'Effectué', cls: 'bg-emerald-50 text-emerald-700' },
  missed: { label: 'Manqué', cls: 'bg-error/10 text-error' },
  reported: { label: 'Reporté', cls: 'bg-violet-500/10 text-violet-600' },
  recredited: { label: 'Recrédité', cls: 'bg-amber-50 text-amber-700' },
  cancelled: { label: 'Annulé', cls: 'bg-neutral-100 text-neutral-500' },
};

const DAY_LABELS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
function fmtTime(t: string | null): string {
  return t ? t.slice(0, 5).replace(':', 'h') : '—';
}
function fmtFcfa(n: number | null): string {
  return n != null ? n.toLocaleString('fr-FR') : '—';
}
function fmtDateTime(t: string | null): string {
  return t
    ? new Date(t).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}

type SubRow = {
  id: string;
  status: string;
  category: string;
  origin_address: string;
  dropoff_address: string;
  distance_km: number;
  duration_min: number;
  days_of_week: number[] | null;
  slot_out: string | null;
  slot_return: string | null;
  rides_total: number;
  rides_remaining: number;
  reports_used_month: number;
  reports_per_month: number;
  pauses_used: number;
  pauses_max: number;
  paused_until: string | null;
  unit_price_fcfa: number;
  discount_pct: number;
  total_price_fcfa: number;
  preferred_driver_name: string | null;
  preferred_driver_rating: number | null;
  starts_on: string;
  expires_on: string;
  created_at: string;
};

type TripRow = {
  subscription_ride_id: string;
  travel_date: string;
  direction: string;
  slot_time: string;
  status: string;
  driver_name: string | null;
  driver_rating: number | null;
  vehicle_label: string | null;
  ride_status: string | null;
  price_total_fcfa: number | null;
  started_at: string | null;
  ended_at: string | null;
};

export default async function PassDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();

  const [{ data: sub }, { data: trips }] = await Promise.all([
    supabase.from('subscriptions').select('*').eq('id', params.id).maybeSingle(),
    supabase.rpc('tampass_pass_detail', { p_subscription_id: params.id }),
  ]);

  if (!sub) notFound();
  const s = sub as SubRow;
  const rows = (trips as TripRow[]) ?? [];
  const badge = STATUS_LABELS[s.status] ?? STATUS_LABELS.active;

  const daysLabel =
    s.days_of_week && s.days_of_week.length > 0
      ? s.days_of_week.map((d) => DAY_LABELS[d]).join(' · ')
      : '—';

  const completed = rows.filter((r) => r.status === 'completed').length;

  return (
    <main className="mx-auto max-w-md px-lg py-xl">
      <Link
        href="/tampass"
        className="mb-md inline-flex items-center gap-xs text-xs font-semibold text-primary-600"
      >
        ← Mes pass
      </Link>

      {/* En-tête du pass */}
      <section className="rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 p-lg text-white shadow-glow">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold uppercase tracking-wider opacity-90">
            TamPass · {s.category}
          </p>
          <span className={`rounded-full px-md py-xs text-[11px] font-bold ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        <p className="mt-md text-3xl font-extrabold">
          {s.rides_remaining}
          <span className="text-base font-semibold opacity-80"> / {s.rides_total} trajets</span>
        </p>
        <div className="mt-sm h-2 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${Math.round((s.rides_remaining / s.rides_total) * 100)}%` }}
          />
        </div>
        <p className="mt-md text-sm opacity-95">
          {s.origin_address} → {s.dropoff_address}
        </p>
      </section>

      {/* Informations détaillées */}
      <section className="mt-lg rounded-xl border border-neutral-200 bg-white p-lg">
        <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
          Détails du pass
        </h2>
        <dl className="space-y-sm text-sm">
          <Info label="Jours" value={daysLabel} />
          <Info
            label="Créneaux"
            value={`Aller ${fmtTime(s.slot_out)}${s.slot_return ? ` · Retour ${fmtTime(s.slot_return)}` : ''}`}
          />
          <Info label="Distance / durée" value={`${s.distance_km.toFixed(1)} km · ${s.duration_min} min`} />
          <Info
            label="Chauffeur attitré"
            value={
              s.preferred_driver_name
                ? `${s.preferred_driver_name}${s.preferred_driver_rating != null ? ` · ★ ${Number(s.preferred_driver_rating).toFixed(1)}` : ''}`
                : 'Non attribué'
            }
          />
          <Info label="Prix unitaire" value={`${fmtFcfa(s.unit_price_fcfa)} FCFA`} />
          <Info
            label="Remise fréquence"
            value={Number(s.discount_pct) > 0 ? `−${Number(s.discount_pct)} %` : 'Aucune'}
          />
          <Info label="Total payé" value={`${fmtFcfa(s.total_price_fcfa)} FCFA`} strong />
          <Info label="Trajets effectués" value={`${completed} / ${s.rides_total}`} />
          <Info
            label="Jokers utilisés (mois)"
            value={`${s.reports_used_month} / ${s.reports_per_month}`}
          />
          <Info label="Pauses utilisées" value={`${s.pauses_used} / ${s.pauses_max}`} />
          <Info label="Période" value={`${fmtDate(s.starts_on)} → ${fmtDate(s.expires_on)}`} />
          <Info label="Souscrit le" value={fmtDate(s.created_at.slice(0, 10))} />
        </dl>
      </section>

      {/* Trajets + chauffeurs */}
      <section className="mt-lg">
        <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
          Trajets ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-xl bg-neutral-50 p-lg text-sm text-neutral-500">
            Aucun trajet généré pour l&apos;instant.
          </p>
        ) : (
          <div className="space-y-sm">
            {rows.map((r) => {
              const rb = RIDE_STATUS_LABELS[r.status] ?? RIDE_STATUS_LABELS.planned;
              return (
                <div key={r.subscription_ride_id} className="rounded-xl border border-neutral-200 bg-white p-md">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-bold text-neutral-900">
                      {fmtDate(r.travel_date)} · {fmtTime(r.slot_time)}
                      <span className="ml-sm text-xs font-semibold uppercase text-neutral-400">
                        {r.direction}
                      </span>
                    </p>
                    <span className={`rounded-full px-md py-xs text-[11px] font-bold ${rb.cls}`}>
                      {rb.label}
                    </span>
                  </div>

                  {r.driver_name ? (
                    <div className="mt-sm rounded-lg bg-neutral-50 p-sm text-xs">
                      <p className="font-semibold text-neutral-900">
                        {r.driver_name}
                        {r.driver_rating != null && (
                          <span className="ml-xs text-amber-500">
                            ★ {Number(r.driver_rating).toFixed(1)}
                          </span>
                        )}
                      </p>
                      {r.vehicle_label && (
                        <p className="text-neutral-500">{r.vehicle_label}</p>
                      )}
                      <p className="mt-xs text-neutral-500">
                        {r.started_at ? `Départ ${fmtDateTime(r.started_at)}` : ''}
                        {r.ended_at ? ` · Arrivée ${fmtDateTime(r.ended_at)}` : ''}
                        {r.price_total_fcfa != null ? ` · ${fmtFcfa(r.price_total_fcfa)} FCFA` : ''}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-xs text-xs text-neutral-400">
                      Aucun chauffeur encore assigné.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Info({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-md">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={`text-right ${strong ? 'font-bold text-primary-700' : 'font-medium text-neutral-900'}`}>
        {value}
      </dd>
    </div>
  );
}
