import { dayLabel, fmt, type OpsDailyRow } from './lib';

/**
 * Histogramme du volume quotidien — SVG pur (aucune librairie, aucun emoji).
 * `preserveAspectRatio="none"` : les barres s'étirent horizontalement pour
 * remplir la largeur du téléphone, les libellés restent en HTML donc nets.
 */
export function DailyChart({ rows }: { rows: OpsDailyRow[] }) {
  if (rows.length === 0) return null;

  const max = Math.max(...rows.map((r) => Number(r.volume_fcfa)), 1);
  const H = 100;
  const GAP = 0.18; // proportion de l'espace laissée entre deux barres
  const step = 100 / rows.length;
  const barW = step * (1 - GAP);

  // Premier jour où le plafond mensuel est déjà atteint (part du jour = 0
  // alors que du volume a été produit) → barres en doré ensuite.
  const capDayIndex = rows.findIndex(
    (r, i) =>
      i > 0 &&
      Number(r.cumulative_pay_fcfa) > 0 &&
      Number(r.pay_fcfa) === 0 &&
      Number(r.volume_fcfa) > 0,
  );

  const best = rows.reduce((a, b) => (Number(b.volume_fcfa) > Number(a.volume_fcfa) ? b : a));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-md">
        <p className="text-xs font-bold uppercase tracking-wider text-neutral-600">
          Volume par jour
        </p>
        <p className="text-xs text-neutral-600">
          record{' '}
          <strong className="text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(best.volume_fcfa)} F
          </strong>{' '}
          le {dayLabel(best.day)}
        </p>
      </div>

      <svg
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Volume de courses par jour, maximum ${fmt(max)} francs`}
        className="mt-sm h-28 w-full"
      >
        {rows.map((r, i) => {
          const v = Number(r.volume_fcfa);
          const h = v > 0 ? Math.max((v / max) * (H - 2), 1.5) : 0;
          const afterCap = capDayIndex >= 0 && i >= capDayIndex;
          return (
            <rect
              key={r.day}
              x={i * step + (step - barW) / 2}
              y={H - h}
              width={barW}
              height={h}
              className={afterCap ? 'fill-gold' : 'fill-primary-500'}
            />
          );
        })}
        <line x1="0" y1={H} x2="100" y2={H} className="stroke-neutral-200" strokeWidth="0.8" />
      </svg>

      <div className="mt-xs flex justify-between text-[10px] text-neutral-400">
        <span>{dayLabel(rows[0].day)}</span>
        {rows.length > 2 && <span>{dayLabel(rows[Math.floor(rows.length / 2)].day)}</span>}
        <span>{dayLabel(rows[rows.length - 1].day)}</span>
      </div>

      {capDayIndex >= 0 && (
        <p className="mt-sm rounded-md bg-gold/10 p-sm text-[11px] text-neutral-600">
          Les journées en doré sont postérieures à l&apos;atteinte du plafond mensuel : le volume
          continue de monter, votre rémunération non.
        </p>
      )}
    </div>
  );
}
