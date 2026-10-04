import { createServerSupabase } from '@/lib/supabase-server';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { setProgramRule } from './actions';

export const dynamic = 'force-dynamic';

type RuleRow = { key: string; value: number; label: string };
type Summary = {
  start?: string;
  month_paid?: number;
  month_count?: number;
  month_drivers?: number;
  total_paid?: number;
  approach_month_paid?: number;
  approach_month_count?: number;
  approach_total_paid?: number;
};

function fmt(n: number | null | undefined): string {
  return Math.round(n ?? 0).toLocaleString('fr-FR').replace(/,/g, ' ');
}

const VEHICLES: { cat: string; label: string }[] = [
  { cat: 'moto', label: 'Moto' },
  { cat: 'tricycle', label: 'Tricycle' },
  { cat: 'essentiel', label: 'Voiture Essentiel' },
  { cat: 'confort', label: 'Voiture Confort' },
];

export default async function AdminBonusPage() {
  const supabase = createServerSupabase();
  const [{ data: rules }, { data: sum }] = await Promise.all([
    supabase.from('program_rules').select('key, value, label').order('key'),
    supabase.rpc('admin_bonus_summary'),
  ]);
  const rows = (rules ?? []) as RuleRow[];
  const r = Object.fromEntries(rows.map((x) => [x.key, x.value])) as Record<string, number>;
  const s = (sum ?? {}) as Summary;
  const cede = (r.surplus_cede_pct ?? 0) / 100;

  const table = VEHICLES.map((v) => {
    const floor = r[`floor_${v.cat}`] ?? 0;
    const share = (r[`share_${v.cat}`] ?? 0) / 100;
    const take = floor * share; // ce que TamCar encaisse par jour à l'objectif
    const cotis = r[`tamassur_${v.cat}`] ?? 0;
    const ex = (pct: number) => {
      const surplus = floor * (pct / 100 - 1);
      const gain = surplus * share;
      const bonus = Math.floor(gain * cede);
      return { surplus, gain, bonus, keeps: gain - bonus };
    };
    return { ...v, floor, share, take, cotis, rate: Math.round(1000 * share * cede), e150: ex(150), e200: ex(200) };
  });

  const groups: { title: string; hint?: string; keys: string[] }[] = [
    { title: 'Objectifs quotidiens (volume dans l’app)', keys: ['floor_moto', 'floor_tricycle', 'floor_essentiel', 'floor_confort'] },
    { title: 'Part de TamCar sur le volume', hint: 'Voitures d’Afrik Group : 23 %. Moto et tricycle : 60 % (le versement).', keys: ['share_moto', 'share_tricycle', 'share_essentiel', 'share_confort'] },
    { title: 'Bonus', keys: ['surplus_cede_pct'] },
    { title: 'Prime d’approche (chauffeur éloigné du client)', hint: 'Distance mesurée à l’acceptation, à vol d’oiseau. Plafond : part de TamCar sur la course. Versée à la fin de la course.', keys: ['approach_free_m', 'approach_rate_moto', 'approach_rate_tricycle', 'approach_rate_essentiel', 'approach_rate_confort', 'approach_rate_premium', 'approach_cap_pct', 'approach_max_fcfa'] },
    { title: 'Annulation par le client', hint: 'Frais quand le chauffeur est arrivé ou à moins d’une minute du client ; gratuit sinon. Débités sur TamCar Crédit, moitié pour le chauffeur.', keys: ['cancel_fee_fcfa', 'cancel_fee_radius_m'] },
    { title: 'TamAssur : cotisation quotidienne par véhicule', hint: 'Voitures : 1 000 F toutes catégories ; moto 500 F ; tricycle 750 F. Entièrement payées par le chauffeur, sur son portefeuille Revenus (part du fonds de rachat = 0 %). NSIA accepte des cotisations différentes selon la ligne.', keys: ['tamassur_moto', 'tamassur_tricycle', 'tamassur_essentiel', 'tamassur_confort', 'tamassur_premium', 'tamassur_fund_pct'] },
  ];

  return (
    <div>
      <div className="mb-lg flex flex-wrap items-baseline justify-between gap-md">
        <h1 className="text-2xl font-extrabold text-neutral-900">Bonus et cotisations chauffeur</h1>
        <p className="text-sm text-neutral-600">
          Démarrage : <strong>{s.start ? new Date(s.start).toLocaleDateString('fr-FR') : '—'}</strong>
        </p>
      </div>

      <p className="mb-lg rounded-md bg-neutral-100 p-md text-xs text-neutral-700">
        <strong>Bonus :</strong> chaque soir à 23 h 55 (du lundi au samedi), sur le volume des courses terminées{' '}
        <strong>dans l&apos;app</strong> au-dessus de l&apos;objectif du véhicule, TamCar reverse au chauffeur{' '}
        <strong>{r.surplus_cede_pct ?? 0} % de la part qu&apos;elle touche</strong> sur ce surplus. Au plancher, le bonus est
        nul ; TamCar garde toujours l&apos;autre moitié, donc ne perd jamais d&apos;argent sur le bonus.
      </p>

      <div className="mb-xl grid grid-cols-2 gap-md md:grid-cols-5">
        {[
          ['Versé ce mois', `${fmt(s.month_paid)} F`],
          ['Bonus ce mois', fmt(s.month_count)],
          ['Chauffeurs concernés', fmt(s.month_drivers)],
          ['Total versé', `${fmt(s.total_paid)} F`],
          ['Primes d’approche ce mois', `${fmt(s.approach_month_paid)} F (${fmt(s.approach_month_count)})`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white p-md shadow-sm ring-1 ring-neutral-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
            <p className="mt-xs text-xl font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <h2 className="mb-sm text-sm font-bold uppercase tracking-wider text-neutral-500">Ce que chaque véhicule rapporte et coûte, par jour</h2>
      <div className="mb-xl overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="px-md py-sm">Véhicule</th>
              <th className="px-md py-sm text-right">Objectif</th>
              <th className="px-md py-sm text-right">TamCar touche à l’objectif</th>
              <th className="px-md py-sm text-right">Bonus par 1 000 F en plus</th>
              <th className="px-md py-sm text-right">À 150 % : bonus / TamCar garde</th>
              <th className="px-md py-sm text-right">À 200 % : bonus / TamCar garde</th>
              <th className="px-md py-sm text-right">Cotisation TamAssur (part de ce que TamCar touche)</th>
            </tr>
          </thead>
          <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
            {table.map((t) => (
              <tr key={t.cat} className="border-b border-neutral-100 last:border-0">
                <td className="px-md py-sm font-semibold text-neutral-900">{t.label}</td>
                <td className="px-md py-sm text-right">{fmt(t.floor)} F</td>
                <td className="px-md py-sm text-right">{fmt(t.take)} F</td>
                <td className="px-md py-sm text-right">{fmt(t.rate)} F</td>
                <td className="px-md py-sm text-right">
                  {fmt(t.e150.bonus)} F / <strong className="text-success">{fmt(t.e150.keeps)} F</strong>
                </td>
                <td className="px-md py-sm text-right">
                  {fmt(t.e200.bonus)} F / <strong className="text-success">{fmt(t.e200.keeps)} F</strong>
                </td>
                <td className="px-md py-sm text-right">
                  {fmt(t.cotis)} F <span className="text-neutral-500">({t.take > 0 ? Math.round((100 * t.cotis) / t.take) : 0} %)</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {groups.map((g) => (
        <section key={g.title} className="mb-xl">
          <h2 className="mb-xs text-sm font-bold uppercase tracking-wider text-neutral-500">{g.title}</h2>
          {g.hint && <p className="mb-sm text-xs text-neutral-500">{g.hint}</p>}
          <ul className="divide-y divide-neutral-200 rounded-xl bg-white shadow-sm">
            {g.keys
              .map((k) => rows.find((x) => x.key === k))
              .filter((x): x is RuleRow => !!x)
              .map((x) => (
                <li key={x.key} className="flex flex-wrap items-center justify-between gap-md px-lg py-sm">
                  <span className="min-w-0 flex-1 text-xs text-neutral-800">{x.label}</span>
                  <form action={setProgramRule} className="flex items-center gap-xs">
                    <input type="hidden" name="key" value={x.key} />
                    <input
                      type="number"
                      name="value"
                      min={0}
                      defaultValue={x.value}
                      className="w-28 rounded-md border border-neutral-200 bg-white px-md py-xs text-right text-sm"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    />
                    <ConfirmSubmit
                      message="Enregistrer ce réglage ? Il s’applique dès le prochain calcul du soir."
                      className="rounded-md bg-neutral-800 px-md py-xs text-xs font-bold text-white hover:bg-neutral-900"
                    >
                      OK
                    </ConfirmSubmit>
                  </form>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
