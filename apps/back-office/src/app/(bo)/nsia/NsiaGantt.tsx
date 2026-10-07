'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KIND_LABELS,
  addDays,
  addMonths,
  advanceSeries,
  assignLanes,
  dayNum,
  effectiveEnd,
  fmtDay,
  fmtFcfa,
  isEarlyExit,
  refundDueOn,
  type AdvanceEvent,
  type LineData,
} from '@/lib/nsia';
import type { Sel } from './NsiaBoard';

const LABEL_W = 210;
const TOP = 24; // bandeau des cycles + rachats
const LANE_H = 32;
const BAR_H = 24;
const CHART_H = 170;
const ZOOMS = [0.3, 0.5, 0.8, 1.2];

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function NsiaGantt({
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
  const [zi, setZi] = useState(1);
  const zoom = ZOOMS[zi];
  const [chartLine, setChartLine] = useState<string>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  const range = useMemo(() => {
    const starts = data.map((d) => d.line.opened_on).sort();
    const ends = data
      .flatMap((d) => [d.endsOn, ...(d.periods.map((p) => refundDueOn(p)).filter(Boolean) as string[])])
      .sort();
    const from = addDays(starts[0], -45);
    const to = addDays(ends[ends.length - 1], 90);
    return { from, to, days: dayNum(to) - dayNum(from) };
  }, [data]);

  const x = (iso: string) => (dayNum(iso) - dayNum(range.from)) * zoom;
  const totalW = Math.ceil(range.days * zoom);

  // Centre la vue sur aujourd'hui à l'ouverture et à chaque changement de zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, LABEL_W + x(today) - el.clientWidth / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zi, range.from]);

  // Graduations : un trait par mois, l'année en gras
  const ticks = useMemo(() => {
    const out: { iso: string; year: boolean; label: string }[] = [];
    let cur = `${range.from.slice(0, 7)}-01`;
    if (cur < range.from) cur = addMonths(cur, 1);
    while (cur <= range.to) {
      const month = Number(cur.slice(5, 7));
      out.push({
        iso: cur,
        year: month === 1,
        label:
          month === 1
            ? cur.slice(0, 4)
            : zoom >= 0.8
              ? new Date(`${cur}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'short' })
              : '',
      });
      cur = addMonths(cur, 1);
    }
    return out;
  }, [range.from, range.to, zoom]);

  const events: AdvanceEvent[] = useMemo(() => {
    const src = chartLine === 'all' ? data.flatMap((d) => d.events) : (data.find((d) => d.line.id === chartLine)?.events ?? []);
    return [...src].sort((a, b) => a.date.localeCompare(b.date) || b.delta - a.delta);
  }, [data, chartLine]);

  const series = useMemo(() => advanceSeries(events, range.from, range.to), [events, range.from, range.to]);
  // Échelle signée : au-dessus de 0, TamCar avance de l'argent ; en dessous, il détient de l'argent de conducteurs pas encore remboursés
  const maxY = Math.max(1, ...series.map((p) => p.value));
  const minY = Math.min(0, ...series.map((p) => p.value));
  const yOf = (v: number) => 16 + (1 - (v - minY) / (maxY - minY)) * (CHART_H - 32);
  const pathD = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.date).toFixed(1)} ${yOf(p.value).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${x(range.to).toFixed(1)} ${yOf(0).toFixed(1)} L ${x(range.from).toFixed(1)} ${yOf(0).toFixed(1)} Z`;

  let running = 0;
  const journal = events.map((e) => {
    running += e.delta;
    return { ...e, after: running };
  });

  return (
    <div>
      {/* Légende et zoom */}
      <div className="mb-md flex flex-wrap items-center gap-md text-[11px] text-neutral-600">
        <Legend swatch="bg-primary-100 ring-1 ring-primary-300" label="Conducteur (la jauge foncée = part du contrat écoulée)" />
        <Legend swatch="bg-warning/10 ring-1 ring-warning/60" label="Poste vacant (cotisation avancée par TamCar)" />
        <Legend swatch="bg-violet-500/40" label="Délai de remboursement du conducteur" striped />
        <Legend swatch="bg-error/15 ring-1 ring-error/40" label="Chevauchement de deux périodes" />
        <span className="inline-flex items-center gap-xs">
          <span className="inline-block h-3 w-3 rotate-45 bg-primary-700" /> rachat prévu
          <span className="ml-sm inline-block h-3 w-3 rotate-45 bg-success" /> fait
          <span className="ml-sm inline-block h-3 w-3 rotate-45 bg-warning" /> sous 90 j
          <span className="ml-sm inline-block h-3 w-3 rotate-45 bg-error" /> en retard
        </span>
        <span className="ml-auto inline-flex items-center gap-xs">
          Zoom
          <button
            type="button"
            onClick={() => setZi((v) => Math.max(0, v - 1))}
            disabled={zi === 0}
            className="rounded-md bg-white px-md py-xs font-bold text-neutral-900 ring-1 ring-neutral-200 disabled:opacity-40"
            aria-label="Réduire"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setZi((v) => Math.min(ZOOMS.length - 1, v + 1))}
            disabled={zi === ZOOMS.length - 1}
            className="rounded-md bg-white px-md py-xs font-bold text-neutral-900 ring-1 ring-neutral-200 disabled:opacity-40"
            aria-label="Agrandir"
          >
            +
          </button>
        </span>
      </div>

      <div ref={scrollRef} className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        <div style={{ width: LABEL_W + totalW }}>
          {/* Échelle de temps */}
          <div className="flex border-b border-neutral-200 bg-neutral-100">
            <div className="sticky left-0 z-20 shrink-0 border-r border-neutral-200 bg-neutral-100 px-md py-sm text-[10px] font-bold uppercase tracking-wider text-neutral-500" style={{ width: LABEL_W }}>
              Lignes
            </div>
            <div className="relative h-8" style={{ width: totalW }}>
              {ticks.map((t) => (
                <div key={t.iso} className="absolute top-0 h-full" style={{ left: x(t.iso) }}>
                  <div className={`h-full border-l ${t.year ? 'border-neutral-400' : 'border-neutral-200'}`} />
                  {t.label && (
                    <span className={`absolute left-1 top-1 text-[10px] ${t.year ? 'font-extrabold text-neutral-800' : 'text-neutral-500'}`}>{t.label}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Une rangée par ligne */}
          {data.map((d) => {
            const lanes = assignLanes(d.periods);
            const nLanes = Math.max(0, ...Array.from(lanes.values())) + 1;
            const height = TOP + nLanes * LANE_H + 8;
            const cycles = Math.floor(d.line.term_months / d.line.redeem_every_months);
            const lineSel = sel?.type === 'line' && sel.id === d.line.id;
            return (
              <div key={d.line.id} className="flex border-b border-neutral-100" style={{ height }}>
                <div
                  className={`sticky left-0 z-10 shrink-0 border-r border-neutral-200 px-md py-sm ${lineSel ? 'bg-primary-50' : 'bg-white'}`}
                  style={{ width: LABEL_W }}
                >
                  <button type="button" onClick={() => onSelect({ type: 'line', id: d.line.id })} className="block text-left">
                    <p className="text-sm font-extrabold leading-tight text-neutral-900">{d.line.label}</p>
                    <p className="text-[11px] text-neutral-600">
                      {KIND_LABELS[d.line.vehicle_kind]} · {d.line.contract_months} mois par conducteur
                    </p>
                  </button>
                  {d.overlaps.length > 0 && (
                    <span className="mt-xs inline-block rounded-full bg-error/10 px-sm py-0.5 text-[10px] font-bold text-error">
                      {d.overlaps.length} chevauchement{d.overlaps.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="relative" style={{ width: totalW }}>
                  {/* cycles de 24 mois */}
                  {Array.from({ length: cycles }, (_, k) => {
                    const from = addMonths(d.line.opened_on, k * d.line.redeem_every_months);
                    const to = addMonths(d.line.opened_on, (k + 1) * d.line.redeem_every_months);
                    return (
                      <div
                        key={k}
                        className={`absolute top-0 h-full ${k % 2 === 0 ? 'bg-primary-50/70' : 'bg-neutral-100/60'}`}
                        style={{ left: x(from), width: x(to) - x(from) }}
                      >
                        <span className="absolute left-2 top-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Cycle {k + 1}</span>
                      </div>
                    );
                  })}

                  {/* ligne du jour */}
                  <div className="absolute top-0 z-[5] h-full border-l-2 border-error/70" style={{ left: x(today) }} title={`Aujourd'hui : ${fmtDay(today)}`} />

                  {/* chevauchements */}
                  {d.overlaps.map((o, i) => (
                    <div
                      key={i}
                      className="pointer-events-none absolute z-[2] bg-error/15 ring-1 ring-error/40"
                      style={{ left: x(o.from), width: Math.max(4, x(addDays(o.to, 1)) - x(o.from)), top: TOP - 2, height: nLanes * LANE_H + 4 }}
                      title={`Chevauchement : ${o.a.label} et ${o.b.label}, du ${fmtDay(o.from)} au ${fmtDay(o.to)} (${o.days} jours)`}
                    />
                  ))}

                  {/* périodes */}
                  {d.periods.map((p) => {
                    const lane = lanes.get(p.id) ?? 0;
                    const end = effectiveEnd(p);
                    const left = x(p.starts_on);
                    const width = Math.max(6, x(addDays(end, 1)) - left);
                    const fill = clamp01((dayNum(today) - dayNum(p.starts_on)) / (dayNum(end) + 1 - dayNum(p.starts_on)));
                    const top = TOP + lane * LANE_H;
                    const isSel = sel?.type === 'period' && sel.id === p.id;
                    const vacancy = p.kind === 'vacancy';
                    const due = refundDueOn(p);
                    const early = isEarlyExit(p);
                    return (
                      <div key={p.id}>
                        {early && (
                          <div
                            className="absolute z-[3] rounded border border-dashed border-neutral-400"
                            style={{ left: x(addDays(end, 1)), width: Math.max(2, x(addDays(p.planned_end_on, 1)) - x(addDays(end, 1))), top, height: BAR_H }}
                            title={`Fin prévue initialement le ${fmtDay(p.planned_end_on)}`}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => onSelect({ type: 'period', id: p.id })}
                          className={`absolute z-[4] overflow-hidden rounded text-left ${
                            vacancy ? 'bg-warning/10 ring-1 ring-warning/60' : 'bg-primary-100 ring-1 ring-primary-300'
                          } ${isSel ? '!ring-2 !ring-primary-700' : ''}`}
                          style={{ left, width, top, height: BAR_H }}
                          title={`${p.label} · du ${fmtDay(p.starts_on)} au ${fmtDay(end)}${early ? ' (départ anticipé)' : ''} · ${Math.round(fill * 100)} % écoulé`}
                        >
                          <span
                            className={`absolute inset-y-0 left-0 ${vacancy ? 'bg-warning/35' : 'bg-primary-500/45'}`}
                            style={{ width: `${fill * 100}%` }}
                          />
                          <span className="relative block truncate px-sm text-[11px] font-bold leading-6 text-neutral-900">
                            {p.label}
                            {width > 150 ? ` · ${Math.round(fill * 100)} %` : ''}
                          </span>
                        </button>
                        {due && (
                          <button
                            type="button"
                            onClick={() => onSelect({ type: 'period', id: p.id })}
                            className="absolute z-[4] rounded-sm"
                            style={{
                              left: x(addDays(end, 1)),
                              width: Math.max(4, x(due) - x(addDays(end, 1))),
                              top: top + 8,
                              height: 8,
                              backgroundImage: p.refunded_on
                                ? 'linear-gradient(rgba(34,197,94,.55), rgba(34,197,94,.55))'
                                : 'repeating-linear-gradient(45deg, rgba(139,92,246,.7) 0 4px, rgba(139,92,246,.25) 4px 8px)',
                            }}
                            title={`Remboursement ${p.refunded_on ? `effectué le ${fmtDay(p.refunded_on)}` : `à faire au plus tard le ${fmtDay(due)}`} (${early ? 90 : 60} jours)`}
                            aria-label={`Délai de remboursement de ${p.label}`}
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* rachats */}
                  {d.reds.map((r) => {
                    const tone =
                      r.state === 'done' ? 'bg-success' : r.state === 'late' ? 'bg-error' : r.state === 'soon' ? 'bg-warning' : 'bg-primary-700';
                    const isSel = sel?.type === 'redemption' && sel.id === r.id;
                    return (
                      <div key={r.id}>
                        <div className="absolute z-[1] border-l border-dashed border-neutral-400" style={{ left: x(r.due_on), top: 14, height: height - 14 }} />
                        <button
                          type="button"
                          onClick={() => onSelect({ type: 'redemption', id: r.id })}
                          className={`absolute z-[6] h-3.5 w-3.5 rotate-45 ${tone} ${isSel ? 'ring-2 ring-neutral-900' : ''}`}
                          style={{ left: x(r.due_on) - 7, top: 6 }}
                          title={`Rachat du ${fmtDay(r.due_on)} · ${fmtFcfa(r.to_redeem)} F${r.done_on ? ' (fait)' : ''}`}
                          aria-label={`Rachat du ${fmtDay(r.due_on)}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Courbe de l'avance de TamCar, alignée sur le même calendrier */}
          <div className="flex border-t-2 border-neutral-200">
            <div className="sticky left-0 z-10 shrink-0 border-r border-neutral-200 bg-white px-md py-sm" style={{ width: LABEL_W }}>
              <p className="text-sm font-extrabold leading-tight text-neutral-900">Avance de TamCar</p>
              <p className="text-[11px] text-neutral-600">au-dessus de 0 : TamCar avance ; en dessous : TamCar détient l&apos;argent de conducteurs à rembourser</p>
              <select
                value={chartLine}
                onChange={(e) => setChartLine(e.target.value)}
                className="mt-sm w-full rounded-md bg-neutral-100 px-sm py-xs text-xs ring-1 ring-neutral-200"
                aria-label="Ligne affichée sur la courbe"
              >
                <option value="all">Toutes les lignes</option>
                {data.map((d) => (
                  <option key={d.line.id} value={d.line.id}>
                    {d.line.label}
                  </option>
                ))}
              </select>
              <p className="mt-sm text-[11px] font-bold text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                Avance maximale : {fmtFcfa(Math.max(0, ...journal.map((j) => j.after)))} F
              </p>
            </div>
            <svg width={totalW} height={CHART_H} className="block" role="img" aria-label="Courbe de l'avance de trésorerie de TamCar">
              {/* graduations */}
              {ticks.map((t) => (
                <line key={t.iso} x1={x(t.iso)} x2={x(t.iso)} y1={0} y2={CHART_H} className={t.year ? 'stroke-neutral-300' : 'stroke-neutral-100'} />
              ))}
              <defs>
                <clipPath id="nsia-above">
                  <rect x={0} y={0} width={totalW} height={yOf(0)} />
                </clipPath>
                <clipPath id="nsia-below">
                  <rect x={0} y={yOf(0)} width={totalW} height={CHART_H - yOf(0)} />
                </clipPath>
              </defs>
              {[minY, 0, maxY]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((v) => (
                  <g key={v}>
                    <line x1={0} x2={totalW} y1={yOf(v)} y2={yOf(v)} className={v === 0 ? 'stroke-neutral-500' : 'stroke-neutral-200'} strokeDasharray={v === 0 ? undefined : '3 4'} />
                    <text x={6} y={yOf(v) - 3} className="fill-neutral-500 text-[10px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {v < 0 ? '−' : ''}
                      {fmtFcfa(Math.abs(v))} F
                    </text>
                  </g>
                ))}
              <path d={areaD} className="fill-primary-500/20" clipPath="url(#nsia-above)" />
              <path d={areaD} className="fill-success/25" clipPath="url(#nsia-below)" />
              <path d={pathD} fill="none" className="stroke-primary-700" strokeWidth={2} />
              <line x1={x(today)} x2={x(today)} y1={0} y2={CHART_H} className="stroke-error" strokeWidth={2} opacity={0.7} />
              {journal.map((e, i) => {
                const strokeCls = e.kind === 'refund' ? 'stroke-error' : e.kind === 'redemption' ? 'stroke-success' : 'stroke-warning';
                const fillCls = e.kind === 'refund' ? 'fill-error' : e.kind === 'redemption' ? 'fill-success' : 'fill-warning';
                return (
                  <g key={i}>
                    <line x1={x(e.date)} x2={x(e.date)} y1={yOf(e.after)} y2={yOf(0)} className={strokeCls} strokeDasharray="2 3" opacity={0.5} />
                    <circle cx={x(e.date)} cy={yOf(e.after)} r={4.5} className={fillCls}>
                      <title>{`${fmtDay(e.date)} · ${e.label} · ${e.delta >= 0 ? '+' : '−'}${fmtFcfa(Math.abs(e.delta))} F · avance après : ${fmtFcfa(e.after)} F`}</title>
                    </circle>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Journal des flux : le détail de la courbe */}
      <div className="mt-lg rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        <div className="flex flex-wrap items-center justify-between gap-sm border-b border-neutral-200 px-lg py-md">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">Journal des flux — {chartLine === 'all' ? 'toutes les lignes' : data.find((d) => d.line.id === chartLine)?.line.label}</h2>
          <p className="text-[11px] text-neutral-600">Un remboursement avant un rachat fait monter l&apos;avance ; un rachat la fait redescendre. Les lignes futures sont des prévisions.</p>
        </div>
        <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-[640px] text-left text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="sticky top-0 bg-neutral-100 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                <th className="px-lg py-sm">Date</th>
                <th className="px-md py-sm">Événement</th>
                <th className="px-md py-sm text-right">Montant</th>
                <th className="px-md py-sm text-right">Position de TamCar après</th>
              </tr>
            </thead>
            <tbody>
              {journal.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-lg py-lg text-center text-neutral-500">
                    Aucun flux prévu.
                  </td>
                </tr>
              )}
              {journal.map((e, i) => (
                <tr key={i} className={`border-b border-neutral-100 ${e.date > today ? 'text-neutral-600' : 'text-neutral-900'}`}>
                  <td className="px-lg py-sm">
                    {fmtDay(e.date)} {e.date > today && <span className="ml-xs rounded-full bg-neutral-100 px-sm py-0.5 text-[10px] font-bold text-neutral-500">prévu</span>}
                  </td>
                  <td className="px-md py-sm">
                    <span
                      className={`mr-sm inline-block rounded-full px-sm py-0.5 text-[10px] font-bold ${
                        e.kind === 'refund' ? 'bg-error/10 text-error' : e.kind === 'redemption' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                      }`}
                    >
                      {e.kind === 'refund' ? 'Remboursement' : e.kind === 'redemption' ? 'Rachat' : 'Poste vacant'}
                    </span>
                    {e.label}
                  </td>
                  <td className={`px-md py-sm text-right font-bold ${e.delta >= 0 ? 'text-error' : 'text-success'}`}>
                    {e.delta >= 0 ? '+' : '−'}
                    {fmtFcfa(Math.abs(e.delta))} F
                  </td>
                  <td className={`px-md py-sm text-right font-bold ${e.after < 0 ? 'text-success' : ''}`}>
                    {e.after < 0 ? `−${fmtFcfa(-e.after)} F` : `${fmtFcfa(e.after)} F`}
                    {e.after < 0 && <span className="block text-[10px] font-semibold text-neutral-500">TamCar détient l&apos;argent des conducteurs</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Legend({ swatch, label, striped }: { swatch: string; label: string; striped?: boolean }) {
  return (
    <span className="inline-flex items-center gap-xs">
      <span
        className={`inline-block h-3 w-5 rounded-sm ${swatch}`}
        style={striped ? { backgroundImage: 'repeating-linear-gradient(45deg, rgba(139,92,246,.7) 0 3px, rgba(139,92,246,.25) 3px 6px)' } : undefined}
      />
      {label}
    </span>
  );
}
