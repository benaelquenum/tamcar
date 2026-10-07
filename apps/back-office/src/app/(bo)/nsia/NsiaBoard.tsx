'use client';

import { useMemo, useState } from 'react';
import {
  boardTotals,
  buildLineData,
  fmtDay,
  fmtFcfa,
  type LineData,
  type NsiaLine,
  type NsiaPeriod,
  type NsiaRedemption,
} from '@/lib/nsia';
import { NsiaTable } from './NsiaTable';
import { NsiaGantt } from './NsiaGantt';
import { NsiaDetail } from './NsiaDetail';
import { NsiaForms } from './NsiaForms';

export type Sel =
  | { type: 'line'; id: string }
  | { type: 'period'; id: string }
  | { type: 'redemption'; id: string }
  | null;

type Props = {
  lines: NsiaLine[];
  periods: NsiaPeriod[];
  reds: NsiaRedemption[];
  today: string;
  canWrite: boolean;
  isAdmin: boolean;
};

export function NsiaBoard({ lines, periods, reds, today, canWrite, isAdmin }: Props) {
  const [tab, setTab] = useState<'table' | 'gantt'>('table');
  const [sel, setSel] = useState<Sel>(null);

  const data: LineData[] = useMemo(() => lines.map((l) => buildLineData(l, periods, reds, today)), [lines, periods, reds, today]);
  const totals = useMemo(() => boardTotals(data, today), [data, today]);

  return (
    <div className="mt-xl">
      {/* Indicateurs */}
      <div className="grid grid-cols-2 gap-md lg:grid-cols-5">
        <Kpi
          label="Prochain rachat"
          value={totals.nextRed ? fmtDay(totals.nextRed.date) : '—'}
          sub={totals.nextRed ? `${totals.nextRed.label} · ${totals.nextRed.days >= 0 ? `dans ${totals.nextRed.days} j` : `en retard de ${-totals.nextRed.days} j`}` : 'aucun rachat prévu'}
        />
        <Kpi label="À racheter sous 90 jours" value={`${fmtFcfa(totals.toRedeem90)} F`} sub="capital versé depuis le rachat précédent" />
        <Kpi
          label="Remboursements dus (90 j)"
          value={`${fmtFcfa(totals.refundsDue)} F`}
          sub={totals.refundsLate > 0 ? `dont ${fmtFcfa(totals.refundsLate)} F en retard` : 'aucun retard'}
          tone={totals.refundsLate > 0 ? 'error' : undefined}
        />
        <Kpi label="Avance de TamCar aujourd'hui" value={`${fmtFcfa(totals.advanceNow)} F`} sub="remboursements payés + postes vacants − rachats reçus" />
        <Kpi
          label="Avance maximale prévue"
          value={`${fmtFcfa(totals.peak.value)} F`}
          sub={totals.peak.date ? `le ${fmtDay(totals.peak.date)}` : 'aucune avance prévue'}
          tone={totals.peak.value > 0 ? 'warning' : undefined}
        />
      </div>

      {data.length === 0 ? (
        <div className="mt-xl rounded-xl bg-white p-2xl text-center shadow-sm ring-1 ring-neutral-200">
          <p className="text-base font-bold text-neutral-900">Aucune ligne pour l&apos;instant.</p>
          <p className="mx-auto mt-xs max-w-xl text-sm text-neutral-600">
            Créez une ligne avec le formulaire ci-dessous : le plan type (les trois rachats aux mois 24, 48 et 72 et la chaîne de conducteurs de
            12 ou 24 mois) est généré tout de suite, vous n&apos;avez plus qu&apos;à y mettre les noms et les vraies dates.
          </p>
        </div>
      ) : (
        <>
          {/* Onglets */}
          <div className="mt-xl flex items-center gap-sm border-b border-neutral-200">
            <TabButton active={tab === 'table'} onClick={() => setTab('table')}>
              Tableau
            </TabButton>
            <TabButton active={tab === 'gantt'} onClick={() => setTab('gantt')}>
              Calendrier et chevauchements
            </TabButton>
            {totals.overlaps > 0 && (
              <span className="ml-auto rounded-full bg-error/10 px-md py-xs text-xs font-bold text-error">
                {totals.overlaps} chevauchement{totals.overlaps > 1 ? 's' : ''} de conducteurs à vérifier
              </span>
            )}
          </div>

          <div className="mt-lg">
            {tab === 'table' ? (
              <NsiaTable data={data} today={today} sel={sel} onSelect={setSel} />
            ) : (
              <NsiaGantt data={data} today={today} sel={sel} onSelect={setSel} />
            )}
          </div>

          <NsiaDetail data={data} today={today} sel={sel} onSelect={setSel} canWrite={canWrite} isAdmin={isAdmin} />
        </>
      )}

      {canWrite && <NsiaForms lines={lines} />}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'error' | 'warning' }) {
  return (
    <div className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p
        className={`mt-xs text-xl font-extrabold ${tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning' : 'text-neutral-900'}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
      <p className="mt-xs text-[11px] text-neutral-600">{sub}</p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-lg py-md text-sm font-bold transition ${
        active ? 'border-primary-700 text-primary-700' : 'border-transparent text-neutral-500 hover:text-neutral-900'
      }`}
    >
      {children}
    </button>
  );
}
