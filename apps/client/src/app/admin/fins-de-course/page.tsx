import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { resolveRideEnd, setEndRule } from './actions';

type Review = {
  id: string;
  ride_id: string;
  created_at: string;
  status: 'recorded' | 'dispute' | 'resolved';
  near: boolean;
  dist_to_dropoff_m: number;
  elapsed_min: number;
  expected_min: number | null;
  duration_reached: boolean;
  reason_code: string | null;
  reason_text: string | null;
  flags: string[];
  gps_source: 'server' | 'reported';
  gps_gap_m: number | null;
  gps_accuracy_m: number | null;
  price_before_fcfa: number | null;
  price_after_fcfa: number | null;
  contest_until: string;
  contested_at: string | null;
  contest_note: string | null;
  verdict: 'valid' | 'driver_fault' | null;
  admin_note: string | null;
  credit_fcfa: number;
  resolved_at: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  client_name: string | null;
  client_phone: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
};

type Rule = { key: string; value: number; label: string };

const REASONS: Record<string, string> = {
  client_asked_stop: 'Le client a demandé à s’arrêter ici',
  client_left: 'Le client est descendu sans terminer',
  vehicle_problem: 'Panne ou accident du véhicule',
  safety: 'Problème de sécurité',
  other: 'Autre raison',
};

const FLAGS: Record<string, string> = {
  far_from_destination: 'Loin de la destination',
  gps_unverified: 'Position non vérifiée par le serveur',
  gps_mismatch: 'Position transmise différente de la position connue',
  gps_coarse: 'Signal GPS imprécis',
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function dist(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Africa/Porto-Novo',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function AdminRideEndsPage() {
  const supabase = createServerSupabase();
  const { data: openData } = await supabase.rpc('admin_ride_end_reviews', { p_filter: 'open' });
  const { data: doneData } = await supabase.rpc('admin_ride_end_reviews', { p_filter: 'resolved' });
  const open = (openData ?? []) as Review[];
  const done = ((doneData ?? []) as Review[]).slice(0, 30);
  const { data: rulesData } = await supabase
    .from('program_rules')
    .select('key, value, label')
    .in('key', ['end_near_m', 'end_contest_min', 'end_alert_count', 'end_alert_days'])
    .order('key');
  const rules = (rulesData ?? []) as Rule[];

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Fins de course par le chauffeur</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-warning" style={{ fontVariantNumeric: 'tabular-nums' }}>{open.length}</strong> à examiner
        </p>
      </div>

      <p className="mb-lg rounded-md bg-neutral-100 p-md text-xs text-neutral-600">
        Quand le client ne peut pas terminer sa course, le chauffeur peut le faire. La fin est <strong>libre près de la destination</strong> ou
        une fois la durée estimée atteinte ; ailleurs, le chauffeur doit donner une raison. Chaque fin est tracée (qui, quand, position GPS).
        Une fin <strong>loin de la destination</strong> ouvre automatiquement un litige ici, avec le prix recalculé au prorata ; le client peut
        aussi contester pendant un court délai. Décidez : fin valide, ou fin abusive (avertissement au chauffeur). Un geste commercial
        (jusqu’à 5 000 F de TamCar Crédit, financé par TamCar) est possible.
      </p>

      <section className="mb-2xl">
        <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">À examiner</h2>
        {open.length === 0 && (
          <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">Aucune fin de course à examiner.</div>
        )}
        <div className="space-y-md">
          {open.map((r) => (
            <div key={r.id} className="rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
              <div className="mb-sm flex items-start justify-between gap-md">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-neutral-900">
                    {r.driver_name ?? 'Chauffeur'}{' '}
                    <span className="font-normal text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.driver_phone ?? ''}</span>
                  </p>
                  <p className="text-xs text-neutral-600">
                    Client : {r.client_name ?? '—'}{' '}
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.client_phone ?? ''}</span> · {when(r.created_at)}
                  </p>
                  <p className="mt-xs truncate text-xs text-neutral-500">
                    {r.pickup_address ?? '—'} → {r.dropoff_address ?? '—'}
                  </p>
                </div>
                <Link href={`/ride/${r.ride_id}`} className="flex-none text-xs font-bold text-primary-600 hover:underline">
                  Voir la course
                </Link>
              </div>

              <dl className="mb-sm grid grid-cols-2 gap-x-lg gap-y-xs text-xs sm:grid-cols-4" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <div><dt className="text-neutral-500">Distance à la destination</dt><dd className="font-bold text-neutral-900">{dist(r.dist_to_dropoff_m)}</dd></div>
                <div>
                  <dt className="text-neutral-500">Durée écoulée / estimée</dt>
                  <dd className="font-bold text-neutral-900">{r.elapsed_min} / {r.expected_min ?? '—'} min</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Prix</dt>
                  <dd className="font-bold text-neutral-900">
                    {r.price_before_fcfa != null ? fmt(r.price_before_fcfa) : '—'} → {r.price_after_fcfa != null ? fmt(r.price_after_fcfa) : '—'} F
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Position</dt>
                  <dd className="font-bold text-neutral-900">
                    {r.gps_source === 'server' ? 'connue du serveur' : 'transmise par l’app'}
                    {r.gps_gap_m != null && r.gps_gap_m > 50 ? ` · écart ${dist(r.gps_gap_m)}` : ''}
                  </dd>
                </div>
              </dl>

              <div className="mb-sm flex flex-wrap gap-xs">
                {r.flags.map((f) => (
                  <span key={f} className="rounded-full bg-warning/15 px-sm py-0.5 text-[11px] font-semibold text-warning">{FLAGS[f] ?? f}</span>
                ))}
                {r.contested_at && (
                  <span className="rounded-full bg-error/10 px-sm py-0.5 text-[11px] font-semibold text-error">Contestée par le client</span>
                )}
              </div>

              <p className="mb-xs text-xs text-neutral-700">
                <strong>Raison du chauffeur :</strong>{' '}
                {r.reason_code ? `${REASONS[r.reason_code] ?? r.reason_code}${r.reason_text ? ` — ${r.reason_text}` : ''}` : 'aucune (fin libre)'}
              </p>
              {r.contest_note && (
                <p className="mb-xs rounded-md bg-error/5 p-sm text-xs text-neutral-800">
                  <strong>Contestation du client :</strong> {r.contest_note}
                </p>
              )}

              <form action={resolveRideEnd} className="mt-md grid gap-sm sm:grid-cols-[1fr_1fr_8rem_auto]">
                <input type="hidden" name="id" value={r.id} />
                <select name="verdict" defaultValue="valid" className="rounded-lg bg-neutral-100 px-md py-sm text-sm ring-1 ring-neutral-200">
                  <option value="valid">Fin valide</option>
                  <option value="driver_fault">Fin abusive : avertir le chauffeur</option>
                </select>
                <input name="note" placeholder="Note interne (facultatif)" className="rounded-lg bg-neutral-100 px-md py-sm text-sm ring-1 ring-neutral-200" />
                <input
                  name="credit"
                  type="number"
                  min={0}
                  max={5000}
                  step={50}
                  defaultValue={0}
                  aria-label="Geste commercial en francs, de 0 à 5 000"
                  title="Geste commercial (F), 0 à 5 000"
                  className="rounded-lg bg-neutral-100 px-md py-sm text-sm ring-1 ring-neutral-200"
                />
                <ConfirmSubmit message="Enregistrer cette décision ? Elle est définitive." className="rounded-lg bg-primary-500 px-lg py-sm text-sm font-bold text-white hover:brightness-110">
                  Décider
                </ConfirmSubmit>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-2xl">
        <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">Réglages</h2>
        <div className="grid gap-sm sm:grid-cols-2">
          {rules.map((rule) => (
            <form key={rule.key} action={setEndRule} className="flex items-center gap-sm rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
              <input type="hidden" name="key" value={rule.key} />
              <label className="min-w-0 flex-1 text-xs text-neutral-700">{rule.label}</label>
              <input
                name="value"
                type="number"
                min={0}
                defaultValue={rule.value}
                className="w-24 rounded-lg bg-neutral-100 px-md py-sm text-right text-sm font-bold ring-1 ring-neutral-200"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
              <button type="submit" className="rounded-lg bg-neutral-900 px-md py-sm text-xs font-bold text-white">Enregistrer</button>
            </form>
          ))}
        </div>
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">Décisions récentes</h2>
          <div className="space-y-sm">
            {done.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-md rounded-xl border border-neutral-200 bg-white p-md text-sm shadow-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900">{r.driver_name ?? 'Chauffeur'} · {dist(r.dist_to_dropoff_m)} de la destination</p>
                  <p className="truncate text-xs text-neutral-500">
                    {r.resolved_at ? when(r.resolved_at) : ''} · {r.verdict === 'driver_fault' ? 'Fin abusive, chauffeur averti' : 'Fin valide'}
                    {r.credit_fcfa > 0 ? ` · geste de ${fmt(r.credit_fcfa)} F` : ''}
                    {r.admin_note ? ` · ${r.admin_note}` : ''}
                  </p>
                </div>
                <Link href={`/ride/${r.ride_id}`} className="flex-none text-xs font-bold text-primary-600 hover:underline">Course</Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
