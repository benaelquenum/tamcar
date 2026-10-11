import Link from 'next/link';
import { ActionForm } from '@/components/ActionForm';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { updateGadgetAward, validateGadgetRound } from './actions';

export type Kind = 'driver' | 'client';

export type RankRow = {
  rank_pos: number;
  profile_id: string;
  full_name: string | null;
  phone: string | null;
  rides: number;
  volume_fcfa: number;
  rating: number | null;
  rating_count: number;
  late_cancels: number;
  objective_days: number;
  eligible: boolean;
  reason: string | null;
  is_winner: boolean;
};

export type Award = {
  id: string;
  kind: Kind;
  rank: number;
  gadget: string | null;
  value_fcfa: number | null;
  status: 'awarded' | 'delivered' | 'declined';
  note: string | null;
  delivered_at: string | null;
  profile: { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null;
};

export type Round = { id: string; label: string; from: string; to: string; ended: boolean };

const TZ = 'Africa/Porto-Novo';

function fmt(n: number | null | undefined): string {
  return Math.round(n ?? 0).toLocaleString('fr-FR').replace(/,/g, ' ');
}

function frDate(iso: string): string {
  const s = new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
  return s.replace(/^1 /, '1er ');
}

/** Tours de 6 mois (semestres civils) : le tour en cours et les trois précédents. */
export function rounds(): Round[] {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // AAAA-MM-JJ
  const y = Number(today.slice(0, 4));
  const s = Number(today.slice(5, 7)) <= 6 ? 1 : 2;
  const list: Round[] = [];
  let year = y;
  let half = s;
  for (let i = 0; i < 4; i++) {
    const from = half === 1 ? `${year}-01-01` : `${year}-07-01`;
    const to = half === 1 ? `${year}-06-30` : `${year}-12-31`;
    list.push({
      id: `${year}-S${half}`,
      label: `${half === 1 ? '1er' : '2e'} semestre ${year}`,
      from,
      to,
      ended: to < today,
    });
    if (half === 1) {
      half = 2;
      year -= 1;
    } else half = 1;
  }
  return list;
}

const STATUS_LABEL: Record<Award['status'], string> = { awarded: 'À remettre', delivered: 'Remis', declined: 'Refusé' };

export function GadgetsView({
  round,
  all,
  r,
  rankings,
  awards,
}: {
  round: Round;
  all: Round[];
  r: Record<string, number>;
  rankings: Record<Kind, RankRow[]>;
  awards: Award[];
}) {
  const winnersPlanned = {
    driver: rankings.driver.filter((x) => x.is_winner).length,
    client: rankings.client.filter((x) => x.is_winner).length,
  };
  const planned = winnersPlanned.driver * (r.gadget_value_driver_fcfa ?? 0) + winnersPlanned.client * (r.gadget_value_client_fcfa ?? 0);
  const awarded = awards.reduce((s, a) => s + (a.value_fcfa ?? 0), 0);
  const budget = r.gadget_budget_fcfa ?? 0;
  const spent = awards.length > 0 ? awarded : planned;

  const KINDS: { kind: Kind; title: string; minRides: number; minRating: number; value: number; winners: number }[] = [
    { kind: 'driver', title: 'Chauffeurs', minRides: r.gadget_driver_min_rides ?? 0, minRating: r.gadget_driver_min_rating ?? 0, value: r.gadget_value_driver_fcfa ?? 0, winners: r.gadget_winners_drivers ?? 0 },
    { kind: 'client', title: 'Clients', minRides: r.gadget_client_min_rides ?? 0, minRating: r.gadget_client_min_rating ?? 0, value: r.gadget_value_client_fcfa ?? 0, winners: r.gadget_winners_clients ?? 0 },
  ];

  return (
    <div>
      <div className="mb-lg flex flex-wrap items-baseline justify-between gap-md">
        <h1 className="text-2xl font-extrabold text-neutral-900">Gadgets des meilleurs</h1>
        <p className="text-sm text-neutral-600">
          Un tour tous les 6 mois · du {frDate(round.from)} au {frDate(round.to)}
          {round.ended ? '' : ' (en cours)'}
        </p>
      </div>

      <nav className="mb-lg flex flex-wrap gap-xs" aria-label="Tours">
        {all.map((t) => (
          <Link
            key={t.id}
            href={`/admin/gadgets?tour=${t.id}`}
            className={`rounded-full px-md py-xs text-xs font-bold ${
              t.id === round.id ? 'bg-primary-700 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            {t.label}
            {!t.ended && ' · en cours'}
          </Link>
        ))}
      </nav>

      <p className="mb-lg rounded-md bg-neutral-100 p-md text-xs text-neutral-700">
        <strong>Comment ça marche :</strong> chaque semestre, les meilleurs chauffeurs et clients reçoivent un gadget. Le classement se
        fait tout seul : on compte les courses terminées sur le tour (à égalité, la meilleure note, puis le volume). Pour être éligible
        il faut un minimum de courses, une note minimale et pas plus d’annulations imputables que la tolérance (chauffeur : annulation de
        sa part ou désistement à moins de 10 minutes d’une réservation ; client : annulation avec frais). Les seuils se règlent dans{' '}
        <Link href="/admin/bonus" className="font-bold text-primary-700 underline">
          Bonus chauffeur
        </Link>
        , groupe « Gadgets ». Une fois le tour terminé, validez : les gagnants sont enregistrés, prévenus par notification, puis vous
        suivez la remise ci-dessous.
      </p>

      <section className="mb-lg grid gap-sm md:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Budget du tour</p>
          <p className="text-lg font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(budget)} F
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            {awards.length > 0 ? 'Cadeaux attribués' : 'Prévu avec le classement actuel'}
          </p>
          <p className={`text-lg font-extrabold ${spent > budget ? 'text-error' : 'text-neutral-900'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(spent)} F
          </p>
          <p className="text-xs text-neutral-500">
            {awards.length > 0
              ? `${awards.length} gagnant${awards.length > 1 ? 's' : ''}`
              : `${winnersPlanned.driver} chauffeur${winnersPlanned.driver > 1 ? 's' : ''} × ${fmt(r.gadget_value_driver_fcfa)} F + ${winnersPlanned.client} client${winnersPlanned.client > 1 ? 's' : ''} × ${fmt(r.gadget_value_client_fcfa)} F`}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Reste</p>
          <p className={`text-lg font-extrabold ${budget - spent < 0 ? 'text-error' : 'text-success'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(budget - spent)} F
          </p>
          {budget - spent < 0 && <p className="text-xs font-semibold text-error">Au-dessus du budget : réduisez le nombre de gagnants ou la valeur des cadeaux.</p>}
        </div>
      </section>

      {KINDS.map((k) => {
        const rows = rankings[k.kind];
        const validated = awards.some((a) => a.kind === k.kind);
        return (
          <section key={k.kind} className="mb-2xl">
            <div className="mb-sm flex flex-wrap items-center justify-between gap-md">
              <div>
                <h2 className="text-lg font-extrabold text-neutral-900">{k.title}</h2>
                <p className="text-xs text-neutral-600">
                  {k.winners} gagnant{k.winners > 1 ? 's' : ''} · au moins {k.minRides} course{k.minRides > 1 ? 's' : ''}
                  {k.minRating > 0 ? ` · note ≥ ${(k.minRating / 10).toFixed(1).replace('.', ',')}` : ''} · cadeau d’environ {fmt(k.value)} F
                </p>
              </div>
              {validated ? (
                <span className="rounded-full bg-success/10 px-md py-xs text-xs font-bold text-success">Classement validé</span>
              ) : round.ended ? (
                <ActionForm action={validateGadgetRound} className="flex flex-wrap items-center gap-sm">
                  <input type="hidden" name="kind" value={k.kind} />
                  <input type="hidden" name="from" value={round.from} />
                  <input type="hidden" name="to" value={round.to} />
                  <ConfirmSubmit
                    message={`Valider le classement des ${k.title.toLowerCase()} pour le ${round.label} ? Les ${winnersPlanned[k.kind]} gagnant(s) seront enregistrés et prévenus par notification.`}
                    className="rounded-md bg-primary-700 px-lg py-sm text-sm font-bold text-white hover:bg-primary-800 disabled:opacity-50"
                    pendingLabel="Validation…"
                  >
                    Valider le classement
                  </ConfirmSubmit>
                </ActionForm>
              ) : (
                <span className="text-xs text-neutral-500">Validation possible après le {frDate(round.to)}</span>
              )}
            </div>

            {rows.length === 0 ? (
              <div className="rounded-xl bg-white p-xl text-center text-sm text-neutral-600 shadow-sm">Aucune course terminée sur ce tour.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    <tr>
                      <th className="px-md py-sm">#</th>
                      <th className="px-md py-sm">{k.kind === 'driver' ? 'Chauffeur' : 'Client'}</th>
                      <th className="px-md py-sm text-right">Courses</th>
                      <th className="px-md py-sm text-right">Volume</th>
                      <th className="px-md py-sm text-right">Note</th>
                      <th className="px-md py-sm text-right">Annul.</th>
                      {k.kind === 'driver' && <th className="px-md py-sm text-right">Jours objectif</th>}
                      <th className="px-md py-sm">Statut</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {rows.slice(0, 25).map((x) => (
                      <tr key={x.profile_id} className={`border-t border-neutral-100 ${x.is_winner ? 'bg-success/5' : ''}`}>
                        <td className="px-md py-sm font-bold text-neutral-500">{x.rank_pos}</td>
                        <td className="px-md py-sm">
                          <span className="font-semibold text-neutral-900">{x.full_name || '—'}</span>
                          {x.phone && <span className="block text-xs text-neutral-500">{x.phone}</span>}
                        </td>
                        <td className="px-md py-sm text-right font-bold">{x.rides}</td>
                        <td className="whitespace-nowrap px-md py-sm text-right">{fmt(x.volume_fcfa)} F</td>
                        <td className="whitespace-nowrap px-md py-sm text-right">
                          {x.rating != null ? `${Number(x.rating).toFixed(2).replace('.', ',')} (${x.rating_count})` : '—'}
                        </td>
                        <td className={`px-md py-sm text-right ${x.late_cancels > 0 ? 'font-bold text-error' : ''}`}>{x.late_cancels}</td>
                        {k.kind === 'driver' && <td className="px-md py-sm text-right">{x.objective_days}</td>}
                        <td className="px-md py-sm">
                          {x.is_winner ? (
                            <span className="rounded-full bg-success px-sm py-0.5 text-[11px] font-bold text-white">Gagnant</span>
                          ) : x.eligible ? (
                            <span className="text-xs text-neutral-600">Éligible, hors podium</span>
                          ) : (
                            <span className="text-xs text-neutral-500">{x.reason}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <section className="mb-2xl">
        <h2 className="mb-sm text-lg font-extrabold text-neutral-900">Remise des cadeaux</h2>
        {awards.length === 0 ? (
          <div className="rounded-xl bg-white p-xl text-center text-sm text-neutral-600 shadow-sm">
            Aucun gagnant enregistré pour ce tour. Validez le classement ci-dessus une fois le tour terminé.
          </div>
        ) : (
          <div className="space-y-sm">
            {awards.map((a) => {
              const p = Array.isArray(a.profile) ? a.profile[0] : a.profile;
              return (
                <ActionForm
                  key={a.id}
                  action={updateGadgetAward}
                  className="flex flex-wrap items-center gap-sm rounded-xl border border-neutral-200 bg-white p-md shadow-sm"
                >
                  <input type="hidden" name="id" value={a.id} />
                  <div className="min-w-[10rem] flex-1">
                    <p className="text-sm font-bold text-neutral-900">
                      {a.kind === 'driver' ? 'Chauffeur' : 'Client'} n°{a.rank} · {p?.full_name || '—'}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {p?.phone || ''} · prévu {fmt(a.value_fcfa)} F
                      {a.delivered_at ? ` · remis le ${new Date(a.delivered_at).toLocaleDateString('fr-FR', { timeZone: TZ })}` : ''}
                    </p>
                  </div>
                  <input
                    name="gadget"
                    defaultValue={a.gadget ?? ''}
                    placeholder="Cadeau (ex. casquette, support téléphone)"
                    className="min-w-0 flex-1 rounded-md border border-neutral-300 px-sm py-sm text-sm"
                  />
                  <input name="note" defaultValue={a.note ?? ''} placeholder="Note" className="min-w-0 flex-1 rounded-md border border-neutral-300 px-sm py-sm text-sm" />
                  <select name="status" defaultValue={a.status} className="rounded-md border border-neutral-300 px-sm py-sm text-sm">
                    {(Object.keys(STATUS_LABEL) as Award['status'][]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <ConfirmSubmit
                    message="Enregistrer ce suivi de remise ?"
                    className="rounded-md bg-primary-700 px-lg py-sm text-sm font-bold text-white hover:bg-primary-800"
                  >
                    Enregistrer
                  </ConfirmSubmit>
                </ActionForm>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
