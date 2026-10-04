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
  by_amount?: Record<string, number>;
  total_paid?: number;
};

function fmt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('fr-FR').replace(/,/g, ' ');
}

/** Gain de TamCar sur le volume supplémentaire, selon le véhicule (part de TamCar au-dessus du plancher). */
const TAMCAR_SHARE: { label: string; ruleKey: string; share: number }[] = [
  { label: 'Moto', ruleKey: 'floor_moto', share: 0.6 },
  { label: 'Tricycle', ruleKey: 'floor_tricycle', share: 0.6 },
  { label: 'Essentiel', ruleKey: 'floor_essentiel', share: 0.23 },
  { label: 'Confort', ruleKey: 'floor_confort', share: 0.23 },
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

  const tiers = [
    { pct: r.tier1_pct, amt: r.tier1_fcfa },
    { pct: r.tier2_pct, amt: r.tier2_fcfa },
    { pct: r.tier3_pct, amt: r.tier3_fcfa },
  ];

  // Chaque palier est rentable si le bonus est inférieur à ce que TamCar gagne sur le volume en plus.
  const check = TAMCAR_SHARE.map((v) => {
    const floor = r[v.ruleKey] ?? 0;
    return {
      label: v.label,
      floor,
      cells: tiers.map((t) => {
        const gain = Math.round(floor * ((t.pct ?? 0) / 100 - 1) * v.share);
        return { gain, net: gain - (t.amt ?? 0) };
      }),
    };
  });

  const groups: { title: string; keys: string[] }[] = [
    { title: 'Objectifs quotidiens (volume dans l’app)', keys: ['floor_moto', 'floor_tricycle', 'floor_essentiel', 'floor_confort'] },
    { title: 'Paliers de bonus (non cumulatifs)', keys: ['tier1_pct', 'tier1_fcfa', 'tier2_pct', 'tier2_fcfa', 'tier3_pct', 'tier3_fcfa'] },
    { title: 'TamAssur', keys: ['tamassur_rachat_share_fcfa'] },
  ];

  return (
    <div>
      <div className="mb-lg flex flex-wrap items-baseline justify-between gap-md">
        <h1 className="text-2xl font-extrabold text-neutral-900">Bonus de performance</h1>
        <p className="text-sm text-neutral-600">
          Démarrage : <strong>{s.start ? new Date(s.start).toLocaleDateString('fr-FR') : '—'}</strong>
        </p>
      </div>

      <p className="mb-lg rounded-md bg-neutral-100 p-md text-xs text-neutral-700">
        Chaque soir à 23 h 55 (du lundi au samedi), le volume des courses terminées <strong>dans l&apos;app</strong> est
        comparé à l&apos;objectif du véhicule. Le chauffeur reçoit le bonus du palier atteint sur son portefeuille. Le bonus ne
        se paie qu&apos;au-dessus de l&apos;objectif : c&apos;est le volume en plus qui le finance.
      </p>

      <div className="mb-xl grid grid-cols-2 gap-md md:grid-cols-4">
        {[
          ['Versé ce mois', `${fmt(s.month_paid)} F`],
          ['Bonus ce mois', fmt(s.month_count)],
          ['Chauffeurs concernés', fmt(s.month_drivers)],
          ['Total versé', `${fmt(s.total_paid)} F`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white p-md shadow-sm ring-1 ring-neutral-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
            <p className="mt-xs text-xl font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Contrôle de rentabilité des paliers */}
      <h2 className="mb-sm text-sm font-bold uppercase tracking-wider text-neutral-500">
        Rentabilité de chaque palier pour TamCar (par jour et par véhicule)
      </h2>
      <div className="mb-xl overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="px-md py-sm">Véhicule (objectif)</th>
              {tiers.map((t, i) => (
                <th key={i} className="px-md py-sm text-right">
                  {t.pct} % : bonus {fmt(t.amt)} F
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {check.map((c) => (
              <tr key={c.label} className="border-b border-neutral-100 last:border-0">
                <td className="px-md py-sm font-semibold text-neutral-900">
                  {c.label} <span className="font-normal text-neutral-500">({fmt(c.floor)} F)</span>
                </td>
                {c.cells.map((cell, i) => (
                  <td key={i} className="px-md py-sm text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <span className="text-neutral-500">gain {fmt(cell.gain)} F</span>{' '}
                    <strong className={cell.net >= 0 ? 'text-success' : 'text-error'}>
                      {cell.net >= 0 ? '+' : ''}
                      {fmt(cell.net)} F
                    </strong>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-neutral-100 px-md py-sm text-[11px] text-neutral-500">
          Gain = ce que TamCar encaisse en plus sur le volume au-dessus de l&apos;objectif (23 % sur les voitures de tiers, 60 %
          du volume sur moto et tricycle). Net en rouge : le palier coûte plus qu&apos;il ne rapporte.
        </p>
      </div>

      {/* Réglages */}
      {groups.map((g) => (
        <section key={g.title} className="mb-xl">
          <h2 className="mb-sm text-sm font-bold uppercase tracking-wider text-neutral-500">{g.title}</h2>
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
                      message="Enregistrer ce réglage ? Il s’applique dès la prochaine attribution du soir."
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
