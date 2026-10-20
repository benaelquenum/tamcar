import Link from 'next/link';
import { ActionForm } from '@/components/ActionForm';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { markDataBundlesSent, validateDataBundleWeek } from './actions';

export type BundleRow = {
  rank_pos: number;
  profile_id: string;
  full_name: string | null;
  phone: string | null;
  category: string;
  days_met: number;
  volume_fcfa: number;
  objective_fcfa: number;
  ratio: number | null;
  rating: number | null;
  cancels: number;
  eligible: boolean;
  reason: string | null;
  is_winner: boolean;
};

export type BundleWeek = { id: string; label: string; ended: boolean; started: boolean };

const TZ = 'Africa/Porto-Novo';
const CAT: Record<string, string> = { moto: 'Moto', tricycle: 'Tricycle', essentiel: 'Essentiel', confort: 'Confort', premium: 'VIP' };

export function fmt(n: number | null | undefined): string {
  return Math.round(n ?? 0).toLocaleString('fr-FR').replace(/,/g, ' ');
}

function dayLabel(iso: string, withYear = false): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: TZ, day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) });
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Les 8 dernières semaines (lundi) jusqu'à la semaine en cours, la plus récente en premier. */
export function bundleWeeks(startIso: string): BundleWeek[] {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const d = new Date(`${today}T12:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  const list: BundleWeek[] = [];
  for (let i = 0; i < 8; i++) {
    const id = addDays(d.toISOString().slice(0, 10), -7 * i);
    list.push({
      id,
      label: `${dayLabel(id)} – ${dayLabel(addDays(id, 5))}`,
      ended: addDays(id, 6) <= today,
      started: id >= startIso,
    });
  }
  return list;
}

export function DataBundlesView({
  week,
  weeks,
  startIso,
  rows,
  awards,
  r,
}: {
  week: BundleWeek;
  weeks: BundleWeek[];
  startIso: string;
  rows: BundleRow[];
  awards: { status: string }[];
  r: Record<string, number>;
}) {
  const winners = rows.filter((x) => x.is_winner).length;
  const cost = r.data_bundle_cost_fcfa ?? 1000;
  const validated = awards.length > 0;
  const toActivate = awards.filter((a) => a.status === 'selected').length;
  const eligible = rows.filter((x) => x.eligible).length;

  return (
    <div>
      <div className="mb-lg flex flex-wrap items-baseline justify-between gap-md">
        <h1 className="text-2xl font-extrabold text-neutral-900">Forfaits internet des meilleurs chauffeurs</h1>
        <p className="text-sm text-neutral-600">
          Semaine du {dayLabel(week.id)} au {dayLabel(addDays(week.id, 5), true)}
        </p>
      </div>

      <nav className="mb-lg flex flex-wrap gap-xs" aria-label="Semaines">
        {weeks.map((w) => (
          <Link
            key={w.id}
            href={`/admin/forfaits-internet?semaine=${w.id}`}
            className={`rounded-full px-md py-xs text-xs font-bold ${
              w.id === week.id ? 'bg-primary-700 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            {w.label}
            {!w.ended && ' · en cours'}
          </Link>
        ))}
      </nav>

      <p className="mb-lg rounded-md bg-neutral-100 p-md text-xs text-neutral-700">
        <strong>Comment ça marche :</strong> chaque semaine (lundi–samedi), TamCar offre un forfait internet aux {r.data_bundle_top_pct ?? 20} % des
        chauffeurs éligibles qui ont le mieux travaillé (au moins {r.data_bundle_min_winners ?? 3} s’il y a assez d’éligibles, au plus{' '}
        {r.data_bundle_max_winners ?? 10}). Est éligible le chauffeur qui a atteint son objectif quotidien au moins {r.data_bundle_min_days ?? 4} jours
        sur 6, sans annulation imputable, avec une note d’au moins {((r.data_bundle_min_rating ?? 45) / 10).toFixed(1).replace('.', ',')} quand il en a
        reçu. Le classement compare le volume de la semaine à l’objectif de sa catégorie (une moto et une voiture sont donc comparables). À partir
        du dimanche, validez : les bénéficiaires sont enregistrés et prévenus ; téléchargez ensuite le fichier à envoyer à l’opérateur, qui
        active les forfaits, puis marquez-les comme activés. Les seuils se règlent dans{' '}
        <Link href="/admin/bonus" className="font-bold text-primary-700 underline">
          Bonus chauffeur
        </Link>
        , groupe « Forfaits internet ».
      </p>

      <section className="mb-lg grid gap-sm md:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Éligibles cette semaine</p>
          <p className="text-lg font-extrabold text-neutral-900">{eligible}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Bénéficiaires</p>
          <p className="text-lg font-extrabold text-neutral-900">{winners}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Coût de la semaine</p>
          <p className="text-lg font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(winners * cost)} F
          </p>
          <p className="text-xs text-neutral-500">{winners} × {fmt(cost)} F · financé par TamCar sur sa part</p>
        </div>
      </section>

      <section className="mb-lg flex flex-wrap items-center gap-sm">
        {!week.started ? (
          <span className="rounded-full bg-neutral-100 px-md py-xs text-xs font-bold text-neutral-600">
            Les forfaits démarrent le {dayLabel(startIso, true)} : cette semaine est affichée à titre d’aperçu.
          </span>
        ) : validated ? (
          <>
            <span className="rounded-full bg-success/10 px-md py-xs text-xs font-bold text-success">Semaine validée</span>
            <a
              href={`/admin/forfaits-internet/export?week=${week.id}`}
              className="rounded-md bg-primary-700 px-lg py-sm text-sm font-bold text-white hover:bg-primary-800"
            >
              Télécharger le fichier pour l’opérateur
            </a>
            {toActivate > 0 ? (
              <ActionForm action={markDataBundlesSent} className="flex flex-wrap items-center gap-sm">
                <input type="hidden" name="week" value={week.id} />
                <ConfirmSubmit
                  message={`Confirmer que l’opérateur a activé les ${toActivate} forfait(s) de cette semaine ? Les chauffeurs seront prévenus.`}
                  className="rounded-md bg-success px-lg py-sm text-sm font-bold text-white hover:brightness-110"
                  pendingLabel="Enregistrement…"
                >
                  Marquer comme activés ({toActivate})
                </ConfirmSubmit>
              </ActionForm>
            ) : (
              <span className="text-xs font-semibold text-success">Tous les forfaits sont activés.</span>
            )}
          </>
        ) : week.ended ? (
          <ActionForm action={validateDataBundleWeek} className="flex flex-wrap items-center gap-sm">
            <input type="hidden" name="week" value={week.id} />
            <ConfirmSubmit
              message={`Valider la semaine ? Les ${winners} bénéficiaire(s) seront enregistrés et prévenus.`}
              className="rounded-md bg-primary-700 px-lg py-sm text-sm font-bold text-white hover:bg-primary-800"
              pendingLabel="Validation…"
            >
              Valider la semaine
            </ConfirmSubmit>
          </ActionForm>
        ) : (
          <span className="text-xs text-neutral-500">Validation possible à partir du dimanche {dayLabel(addDays(week.id, 6), true)}.</span>
        )}
      </section>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-white p-xl text-center text-sm text-neutral-600 shadow-sm">Aucun chauffeur actif.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-md py-sm">#</th>
                <th className="px-md py-sm">Chauffeur</th>
                <th className="px-md py-sm">Catégorie</th>
                <th className="px-md py-sm text-right">Jours d’objectif</th>
                <th className="px-md py-sm text-right">Volume</th>
                <th className="px-md py-sm text-right">Performance</th>
                <th className="px-md py-sm text-right">Note</th>
                <th className="px-md py-sm">Statut</th>
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
              {rows.map((x) => (
                <tr key={x.profile_id} className={`border-t border-neutral-100 ${x.is_winner ? 'bg-success/5' : ''}`}>
                  <td className="px-md py-sm font-bold text-neutral-500">{x.rank_pos}</td>
                  <td className="px-md py-sm">
                    <span className="font-semibold text-neutral-900">{x.full_name || '—'}</span>
                    {x.phone && <span className="block text-xs text-neutral-500">{x.phone}</span>}
                  </td>
                  <td className="px-md py-sm">{CAT[x.category] ?? x.category}</td>
                  <td className="px-md py-sm text-right font-bold">{x.days_met} / 6</td>
                  <td className="whitespace-nowrap px-md py-sm text-right">{fmt(x.volume_fcfa)} F</td>
                  <td className="px-md py-sm text-right">{x.ratio != null ? `${Math.round(Number(x.ratio) * 100)} %` : '—'}</td>
                  <td className="whitespace-nowrap px-md py-sm text-right">{x.rating != null ? Number(x.rating).toFixed(2).replace('.', ',') : '—'}</td>
                  <td className="px-md py-sm">
                    {x.is_winner ? (
                      <span className="rounded-full bg-success px-sm py-0.5 text-[11px] font-bold text-white">Forfait offert</span>
                    ) : x.eligible ? (
                      <span className="text-xs text-neutral-600">Éligible, hors quota</span>
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
    </div>
  );
}
