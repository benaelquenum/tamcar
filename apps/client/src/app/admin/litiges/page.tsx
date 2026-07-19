import { createServerSupabase } from '@/lib/supabase-server';
import { resolveDispute, resolveStrikeDispute } from './actions';

type DisputeRow = {
  ride_id: string;
  client_id: string;
  client_name: string | null;
  driver_id: string | null;
  driver_name: string | null;
  pickup_address: string;
  dropoff_address: string;
  cancel_reason_user: string | null;
  cancel_reason: string | null;
  cancel_driver_fault_evidence: string | null;
  matched_at: string | null;
  ended_at: string | null;
  driver_distance_at_match_m: number | null;
  driver_strike_count: number | null;
  driver_strike_disputed_at: string | null;
  driver_strike_dispute_reason: string | null;
  dispute_kind: 'client_reason_unproven' | 'driver_contest';
};

const REASON_LABELS: Record<string, string> = {
  driver_asked: "Chauffeur m'a demandé d'annuler",
  driver_not_moving: 'Chauffeur ne bouge pas',
  wrong_direction: 'Mauvaise direction',
  wait_too_long: 'Temps d\'attente trop long',
  other: 'Autre',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default async function AdminLitigesPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('cancellations_disputed_view')
    .select('*')
    .limit(100);
  const list = (data ?? []) as DisputeRow[];

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Litiges d&apos;annulation</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-neutral-900">{list.length}</strong> à arbitrer
        </p>
      </div>

      <div className="mb-xl grid grid-cols-1 gap-md md:grid-cols-2">
        <div className="rounded-lg bg-primary-50 p-md">
          <p className="text-xs font-bold uppercase tracking-wider text-primary-700">
            Litige client
          </p>
          <p className="mt-xs text-xs text-primary-900">
            Client a invoqué une raison chauffeur sans preuve auto. À trancher : si
            faute chauffeur → remboursement + strike ; si faute client → statu quo.
          </p>
        </div>
        <div className="rounded-lg bg-warning/10 p-md">
          <p className="text-xs font-bold uppercase tracking-wider text-warning">
            Contestation chauffeur
          </p>
          <p className="mt-xs text-xs text-neutral-800">
            Un chauffeur conteste un strike reçu. Si tu révoques → strike retiré,
            client à nouveau débité. Si tu maintiens → strike conservé.
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          Aucun litige en attente. 👌
        </div>
      ) : (
        <ul className="space-y-md">
          {list.map((d) => (
            <li
              key={d.ride_id}
              className={`overflow-hidden rounded-xl bg-white shadow-sm ring-1 ${
                d.dispute_kind === 'driver_contest' ? 'ring-warning/40' : 'ring-neutral-200'
              }`}
            >
              <div className="border-b border-neutral-100 bg-neutral-50 px-md py-xs">
                <span
                  className={`inline-block rounded-full px-sm py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    d.dispute_kind === 'driver_contest'
                      ? 'bg-warning text-white'
                      : 'bg-primary-500 text-white'
                  }`}
                >
                  {d.dispute_kind === 'driver_contest'
                    ? '⚠ Contestation chauffeur'
                    : '🔍 Raison client à examiner'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-md p-md md:grid-cols-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Client
                  </p>
                  <p className="mt-xs text-sm font-semibold text-neutral-900">
                    {d.client_name ?? '—'}
                  </p>
                  <p className="mt-md text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Chauffeur
                  </p>
                  <p className="mt-xs text-sm font-semibold text-neutral-900">
                    {d.driver_name ?? '—'}
                  </p>
                  {d.driver_strike_count != null && d.driver_strike_count > 0 && (
                    <p className="mt-xs text-[11px] text-error">
                      ⚠ {d.driver_strike_count} strike{d.driver_strike_count > 1 ? 's' : ''} au total
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Raison invoquée
                  </p>
                  <p className="mt-xs text-sm font-bold text-neutral-900">
                    {REASON_LABELS[d.cancel_reason_user ?? ''] ?? d.cancel_reason_user ?? '—'}
                  </p>
                  <p className="mt-md text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Trajet
                  </p>
                  <p className="mt-xs truncate text-xs text-neutral-700">
                    {d.pickup_address}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    → {d.dropoff_address}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Timeline
                  </p>
                  <p className="mt-xs text-xs text-neutral-700">
                    Match : <strong>{fmtDate(d.matched_at)}</strong>
                  </p>
                  <p className="text-xs text-neutral-700">
                    Annulation : <strong>{fmtDate(d.ended_at)}</strong>
                  </p>
                  {d.driver_distance_at_match_m != null && (
                    <p className="mt-xs text-[11px] text-neutral-500">
                      Distance au match : {d.driver_distance_at_match_m} m
                    </p>
                  )}
                </div>
              </div>

              {d.dispute_kind === 'driver_contest' && d.driver_strike_dispute_reason && (
                <div className="border-t border-neutral-100 bg-warning/5 p-md">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-warning">
                    Version chauffeur
                  </p>
                  <p className="mt-xs text-sm italic text-neutral-800">
                    « {d.driver_strike_dispute_reason} »
                  </p>
                </div>
              )}

              {d.dispute_kind === 'driver_contest' ? (
                <div className="grid grid-cols-1 gap-sm border-t border-neutral-100 bg-neutral-50 p-md md:grid-cols-2">
                  <form action={resolveStrikeDispute} className="flex flex-col gap-xs">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
                      Chauffeur a raison → révoquer strike
                    </label>
                    <input type="hidden" name="ride_id" value={d.ride_id} />
                    <input type="hidden" name="uphold" value="false" />
                    <input
                      type="text"
                      name="note"
                      placeholder="Note (optionnelle)"
                      className="rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-primary-500 px-md py-sm text-xs font-bold text-white hover:bg-primary-600"
                    >
                      Révoquer strike + rembourser chauffeur
                    </button>
                  </form>

                  <form action={resolveStrikeDispute} className="flex flex-col gap-xs">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">
                      Chauffeur a tort → maintenir strike
                    </label>
                    <input type="hidden" name="ride_id" value={d.ride_id} />
                    <input type="hidden" name="uphold" value="true" />
                    <input
                      type="text"
                      name="note"
                      placeholder="Note (optionnelle)"
                      className="rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-neutral-800 px-md py-sm text-xs font-bold text-white hover:bg-neutral-700"
                    >
                      Maintenir le strike
                    </button>
                  </form>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-sm border-t border-neutral-100 bg-neutral-50 p-md md:grid-cols-2">
                  <form action={resolveDispute} className="flex flex-col gap-xs">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
                      Faute chauffeur → rembourser
                    </label>
                    <input type="hidden" name="ride_id" value={d.ride_id} />
                    <input type="hidden" name="verdict" value="driver" />
                    <input
                      type="text"
                      name="note"
                      placeholder="Note (optionnelle)"
                      className="rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-primary-500 px-md py-sm text-xs font-bold text-white hover:bg-primary-600"
                    >
                      Confirmer faute chauffeur
                    </button>
                  </form>

                  <form action={resolveDispute} className="flex flex-col gap-xs">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">
                      Faute client → statu quo
                    </label>
                    <input type="hidden" name="ride_id" value={d.ride_id} />
                    <input type="hidden" name="verdict" value="client" />
                    <input
                      type="text"
                      name="note"
                      placeholder="Note (optionnelle)"
                      className="rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-neutral-800 px-md py-sm text-xs font-bold text-white hover:bg-neutral-700"
                    >
                      Confirmer faute client
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
