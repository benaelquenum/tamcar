import { ActionForm } from '@/components/ActionForm';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { adminCancelSubscription } from './actions';

export type PassRow = {
  subscription_id: string;
  status: string;
  category: string;
  client_id: string;
  client_name: string | null;
  client_email: string | null;
  client_role: string | null;
  origin_address: string | null;
  dropoff_address: string | null;
  days_of_week: number[] | null;
  slot_out: string | null;
  slot_return: string | null;
  rides_total: number;
  rides_remaining: number;
  rides_done: number;
  rides_missed: number;
  starts_on: string | null;
  expires_on: string | null;
  total_price_fcfa: number;
  unit_price_fcfa: number;
  driver_id: string | null;
  driver_name: string | null;
  next_ride_at: string | null;
  next_ride_status: string | null;
  next_ride_has_driver: boolean | null;
  created_at: string;
};

const TZ = 'Africa/Porto-Novo';
const CAT: Record<string, string> = { moto: 'Moto', tricycle: 'Tricycle', essentiel: 'Essentiel', confort: 'Confort', premium: 'VIP' };
const STATUS: Record<string, { label: string; tone: string }> = {
  pending_driver: { label: 'Recherche de chauffeur', tone: 'bg-warning/10 text-warning' },
  awaiting_payment: { label: 'En attente du paiement', tone: 'bg-warning/10 text-warning' },
  active: { label: 'Actif', tone: 'bg-success/10 text-success' },
  paused: { label: 'En pause', tone: 'bg-neutral-100 text-neutral-700' },
  expired: { label: 'Terminé', tone: 'bg-neutral-100 text-neutral-600' },
  cancelled: { label: 'Arrêté', tone: 'bg-neutral-100 text-neutral-600' },
};
const LIVE = new Set(['pending_driver', 'awaiting_payment', 'active', 'paused']);
const DAYS = ['', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const RIDE_STATUS: Record<string, string> = {
  scheduled: 'Planifiée',
  requested: 'En recherche',
  matched: 'Acceptée',
  arrived: 'Chauffeur arrivé',
  in_progress: 'En cours',
};

function fmt(n: number | null | undefined): string {
  return Math.round(n ?? 0).toLocaleString('fr-FR').replace(/,/g, ' ');
}
function hhmm(t: string | null): string {
  return t ? t.slice(0, 5).replace(':', 'h') : '';
}
function dayShort(iso: string | null): string {
  return iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short' }) : '—';
}
function dateTime(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';
}

export function TamPassAdminView({ rows }: { rows: PassRow[] }) {
  const live = rows.filter((r) => LIVE.has(r.status));
  const adminLive = live.filter((r) => r.client_role === 'admin');
  const remaining = live.reduce((a, r) => a + r.rides_remaining, 0);

  return (
    <div>
      <div className="mb-lg flex flex-wrap items-baseline justify-between gap-md">
        <h1 className="text-2xl font-extrabold text-neutral-900">TamPass : abonnements</h1>
        <p className="text-sm text-neutral-600">
          {rows.length} abonnement{rows.length > 1 ? 's' : ''} au total
        </p>
      </div>

      <p className="mb-lg rounded-md bg-neutral-100 p-md text-xs text-neutral-700">
        <strong>Comment ça marche :</strong> le chauffeur qui accepte l’offre s’engage pour <strong>toutes les courses</strong> de l’abonnement : chaque course est créée
        la veille à 20 h, déjà affectée à lui. Ce n’est que s’il se désiste d’<strong>une</strong> course qu’un autre chauffeur est cherché, pour cette course seulement. Les
        courses TamPass terminées comptent dans l’objectif du jour où elles ont été faites. Un abonnement arrêté ici annule ses courses à venir et prévient le chauffeur ;
        le remboursement des trajets non effectués est facultatif.
      </p>

      <section className="mb-lg grid gap-sm md:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Abonnements en cours</p>
          <p className="text-lg font-extrabold text-neutral-900">{live.length}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Trajets restants à venir</p>
          <p className="text-lg font-extrabold text-neutral-900">{remaining}</p>
        </div>
        <div className={`rounded-xl border p-md shadow-sm ${adminLive.length > 0 ? 'border-warning bg-warning/10' : 'border-neutral-200 bg-white'}`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Comptes admin avec un pass en cours</p>
          <p className="text-lg font-extrabold text-neutral-900">{adminLive.length}</p>
          {adminLive.length > 0 && <p className="text-xs text-neutral-700">Pass de test ? Ils créent de vraies courses chaque soir de semaine.</p>}
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-white p-xl text-center text-sm text-neutral-600 shadow-sm">Aucun abonnement TamPass pour le moment.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-md py-sm">Client</th>
                <th className="px-md py-sm">Statut</th>
                <th className="px-md py-sm">Trajet</th>
                <th className="px-md py-sm">Rythme</th>
                <th className="px-md py-sm text-right">Trajets</th>
                <th className="px-md py-sm">Chauffeur titulaire</th>
                <th className="px-md py-sm">Prochaine course</th>
                <th className="px-md py-sm">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS[r.status] ?? { label: r.status, tone: 'bg-neutral-100 text-neutral-700' };
                const isLive = LIVE.has(r.status);
                return (
                  <tr key={r.subscription_id} className={`border-t border-neutral-100 align-top ${isLive ? '' : 'opacity-60'}`}>
                    <td className="px-md py-sm">
                      <span className="font-semibold text-neutral-900">{r.client_name || '—'}</span>
                      {r.client_role === 'admin' && (
                        <span className="ml-xs rounded-full bg-warning/10 px-sm py-0.5 text-[10px] font-bold text-warning">compte admin</span>
                      )}
                      {r.client_email && <span className="block text-xs text-neutral-500">{r.client_email}</span>}
                    </td>
                    <td className="px-md py-sm">
                      <span className={`rounded-full px-sm py-0.5 text-[11px] font-bold ${st.tone}`}>{st.label}</span>
                    </td>
                    <td className="px-md py-sm">
                      <span className="font-semibold text-neutral-900">{CAT[r.category] ?? r.category}</span>
                      <span className="block text-xs text-neutral-600">
                        {r.origin_address || '—'} → {r.dropoff_address || '—'}
                      </span>
                    </td>
                    <td className="px-md py-sm text-xs text-neutral-700">
                      {(r.days_of_week ?? []).map((d) => DAYS[d]).join(' ')}
                      <span className="block">
                        {hhmm(r.slot_out)}
                        {r.slot_return ? ` · retour ${hhmm(r.slot_return)}` : ''}
                      </span>
                      <span className="block text-neutral-500">
                        du {dayShort(r.starts_on)} au {dayShort(r.expires_on)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-md py-sm text-right text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <span className="font-bold text-neutral-900">{r.rides_done}</span> faits
                      <span className="block text-neutral-600">
                        {r.rides_remaining} à venir / {r.rides_total}
                      </span>
                      {r.rides_missed > 0 && (
                        <span className="block text-neutral-500">
                          {r.rides_missed} non assuré{r.rides_missed > 1 ? 's' : ''}
                        </span>
                      )}
                      <span className="block text-neutral-500">{fmt(r.total_price_fcfa)} F</span>
                    </td>
                    <td className="px-md py-sm text-xs text-neutral-700">{r.driver_name || <span className="text-neutral-400">aucun</span>}</td>
                    <td className="px-md py-sm text-xs text-neutral-700">
                      {r.next_ride_at ? (
                        <>
                          {dateTime(r.next_ride_at)}
                          <span className="block text-neutral-500">
                            {RIDE_STATUS[r.next_ride_status ?? ''] ?? r.next_ride_status}
                            {r.next_ride_has_driver ? '' : ' · sans chauffeur'}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-md py-sm">
                      {isLive ? (
                        <ActionForm action={adminCancelSubscription} className="flex min-w-[210px] flex-col gap-xs">
                          <input type="hidden" name="subscription_id" value={r.subscription_id} />
                          <input
                            type="text"
                            name="reason"
                            maxLength={200}
                            placeholder="Motif (facultatif)"
                            className="rounded-md border border-neutral-200 px-sm py-xs text-xs"
                          />
                          <label className="flex items-center gap-xs text-xs text-neutral-700">
                            <input type="checkbox" name="refund" /> Rembourser les trajets non effectués
                          </label>
                          <ConfirmSubmit
                            message={`Arrêter l’abonnement de ${r.client_name || 'ce client'} ? Ses courses à venir seront annulées et le chauffeur prévenu.`}
                            className="rounded-md bg-error px-md py-xs text-xs font-bold text-white hover:brightness-110"
                            pendingLabel="Arrêt…"
                          >
                            Arrêter l’abonnement
                          </ConfirmSubmit>
                        </ActionForm>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
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
