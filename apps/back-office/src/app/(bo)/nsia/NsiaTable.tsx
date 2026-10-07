'use client';

import {
  KIND_LABELS,
  dayNum,
  fmtDay,
  fmtFcfa,
  type LineData,
} from '@/lib/nsia';
import type { Sel } from './NsiaBoard';

export function NsiaTable({
  data,
  today,
  sel,
  onSelect,
}: {
  data: LineData[];
  today: string;
  sel: Sel;
  onSelect: (s: Sel) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            <th className="px-lg py-md">Ligne</th>
            <th className="px-md py-md">Conducteur en cours</th>
            <th className="px-md py-md">Prochain rachat</th>
            <th className="px-md py-md text-right">À racheter</th>
            <th className="px-md py-md text-right">Remboursements dus</th>
            <th className="px-md py-md text-right">Avance (aujourd&apos;hui / max)</th>
            <th className="px-md py-md text-center">Chevauchements</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => {
            const active = sel?.type === 'line' && sel.id === d.line.id;
            const lifePct = clamp01((dayNum(today) - dayNum(d.line.opened_on)) / (dayNum(d.endsOn) - dayNum(d.line.opened_on)));
            const cur = d.current;
            const curPct = cur ? clamp01((dayNum(today) - dayNum(cur.starts_on)) / (dayNum(cur.planned_end_on) - dayNum(cur.starts_on) + 1)) : 0;
            const dueRefunds = d.refunds.filter((f) => f.state !== 'running');
            const refundSum = dueRefunds.reduce((s, f) => s + f.amount, 0);
            const firstRefund = [...dueRefunds].sort((a, b) => a.due.localeCompare(b.due))[0];
            const lateRefund = dueRefunds.some((f) => f.state === 'late');
            return (
              <tr
                key={d.line.id}
                onClick={() => onSelect({ type: 'line', id: d.line.id })}
                className={`cursor-pointer border-b border-neutral-100 align-top transition hover:bg-primary-50 ${active ? 'bg-primary-50' : ''}`}
              >
                <td className="px-lg py-md">
                  <p className="font-extrabold text-neutral-900">{d.line.label}</p>
                  <p className="text-[11px] text-neutral-600">
                    {KIND_LABELS[d.line.vehicle_kind]} · ouverte le {fmtDay(d.line.opened_on)} · fin {fmtDay(d.endsOn)}
                  </p>
                  <Gauge pct={lifePct} tone="neutral" title={`Vie de la ligne : ${Math.round(lifePct * 100)} %`} />
                </td>
                <td className="px-md py-md">
                  {cur ? (
                    <>
                      <p className="font-semibold text-neutral-900">{cur.label}</p>
                      <p className="text-[11px] text-neutral-600">
                        {cur.kind === 'vacancy' ? 'Poste vacant' : 'En poste'} · jusqu&apos;au {fmtDay(cur.planned_end_on)}
                      </p>
                      <Gauge pct={curPct} tone={cur.kind === 'vacancy' ? 'warning' : 'primary'} title={`${Math.round(curPct * 100)} % du contrat écoulé`} />
                    </>
                  ) : (
                    <span className="text-neutral-500">Aucun conducteur à cette date</span>
                  )}
                </td>
                <td className="px-md py-md">
                  {d.nextRed ? (
                    <>
                      <p className="font-semibold text-neutral-900">{fmtDay(d.nextRed.due_on)}</p>
                      <span
                        className={`mt-xs inline-block rounded-full px-sm py-0.5 text-[10px] font-bold ${
                          d.nextRed.state === 'late'
                            ? 'bg-error/10 text-error'
                            : d.nextRed.state === 'soon'
                              ? 'bg-warning/10 text-warning'
                              : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {d.nextRed.days_left >= 0 ? `dans ${d.nextRed.days_left} j` : `en retard de ${-d.nextRed.days_left} j`}
                      </span>
                    </>
                  ) : (
                    <span className="text-neutral-500">Tous faits</span>
                  )}
                </td>
                <td className="px-md py-md text-right font-bold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {d.nextRed ? `${fmtFcfa(d.nextRed.to_redeem)} F` : '—'}
                </td>
                <td className="px-md py-md text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {refundSum > 0 ? (
                    <>
                      <p className={`font-bold ${lateRefund ? 'text-error' : 'text-neutral-900'}`}>{fmtFcfa(refundSum)} F</p>
                      <p className="text-[11px] text-neutral-600">
                        {lateRefund ? 'en retard depuis le ' : 'au plus tard le '}
                        {fmtDay(firstRefund.due)}
                      </p>
                    </>
                  ) : (
                    <span className="text-neutral-500">—</span>
                  )}
                </td>
                <td className="px-md py-md text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <p className="font-bold text-neutral-900">{fmtFcfa(d.advanceNow)} F</p>
                  <p className="text-[11px] text-neutral-600">
                    max {fmtFcfa(d.peak.value)} F{d.peak.date ? ` (${fmtDay(d.peak.date)})` : ''}
                  </p>
                </td>
                <td className="px-md py-md text-center">
                  {d.overlaps.length > 0 ? (
                    <span className="rounded-full bg-error/10 px-md py-xs text-xs font-bold text-error">{d.overlaps.length}</span>
                  ) : (
                    <span className="text-neutral-400">0</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-neutral-100 text-sm font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <td className="px-lg py-md" colSpan={3}>
              Total ({data.length} ligne{data.length > 1 ? 's' : ''})
            </td>
            <td className="px-md py-md text-right">
              {fmtFcfa(data.reduce((s, d) => s + (d.nextRed ? d.nextRed.to_redeem : 0), 0))} F
            </td>
            <td className="px-md py-md text-right">
              {fmtFcfa(data.reduce((s, d) => s + d.refunds.filter((f) => f.state !== 'running').reduce((x, f) => x + f.amount, 0), 0))} F
            </td>
            <td className="px-md py-md text-right">{fmtFcfa(data.reduce((s, d) => s + d.advanceNow, 0))} F</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function Gauge({ pct, tone, title }: { pct: number; tone: 'neutral' | 'primary' | 'warning'; title: string }) {
  const fill = tone === 'primary' ? 'bg-primary-500' : tone === 'warning' ? 'bg-warning' : 'bg-neutral-400';
  return (
    <div className="mt-xs h-1.5 w-40 overflow-hidden rounded-full bg-neutral-200" title={title} role="img" aria-label={title}>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.round(pct * 100)}%` }} />
    </div>
  );
}
