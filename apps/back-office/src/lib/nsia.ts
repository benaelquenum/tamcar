/**
 * TamCar Office — suivi des lignes d'épargne NSIA : types et calculs (aucun accès à la base ici).
 *
 * Une ligne = un emplacement de 6 ans chez NSIA, à 1 000 F par jour (lundi-samedi), alimenté par une chaîne de conducteurs.
 * TamCar rachète (partiellement) tous les 24 mois ; le capital revient à TamCar, qui rembourse les conducteurs sortis et avance
 * l'écart entre un remboursement et le rachat suivant.
 *
 * Toutes les dates sont des chaînes ISO « AAAA-MM-JJ » (jours calendaires du Bénin, sans heure) : les calculs sont faits en UTC pour
 * rester identiques sur le serveur et dans le navigateur.
 */

export type NsiaKind = 'moto' | 'tricycle' | 'voiture';

export type NsiaLine = {
  id: string;
  label: string;
  vehicle_kind: NsiaKind;
  opened_on: string;
  term_months: number;
  redeem_every_months: number;
  contract_months: number;
  daily_fcfa: number;
  status: 'active' | 'closed';
  notes: string | null;
};

export type NsiaPeriod = {
  id: string;
  line_id: string;
  kind: 'driver' | 'vacancy';
  label: string;
  starts_on: string;
  planned_end_on: string;
  ended_on: string | null;
  refunded_on: string | null;
  refund_fcfa: number | null;
  notes: string | null;
};

export type NsiaRedemption = {
  id: string;
  line_id: string;
  due_on: string;
  done_on: string | null;
  amount_fcfa: number | null;
  interest_fcfa: number | null;
  notes: string | null;
};

/** Délais annoncés aux conducteurs pour être remboursés : 60 jours au plus après le terme, 90 jours après un départ anticipé. */
export const REFUND_DAYS_TERM = 60;
export const REFUND_DAYS_EARLY = 90;

export const KIND_LABELS: Record<NsiaKind, string> = { moto: 'Moto', tricycle: 'Tricycle', voiture: 'Voiture' };

// ---------------------------------------------------------------- dates (UTC, jours entiers)

const DAY_MS = 86_400_000;

export function dayNum(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function isoOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return isoOf(dayNum(iso) + n);
}

export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return isoOf(Math.round(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last)) / DAY_MS));
}

export function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

export function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

/** Jours ouvrés lundi-samedi (le dimanche n'est jamais prélevé) entre deux dates incluses. */
export function workingDays(from: string, to: string): number {
  const a = dayNum(from);
  const b = dayNum(to);
  if (b < a) return 0;
  const total = b - a + 1;
  // dayNum 0 = jeudi 1er janvier 1970 : l'indice de jour de semaine (0 = dimanche) vaut (jour + 4) % 7
  const weekday = (((a + 4) % 7) + 7) % 7;
  const firstSunday = a + ((7 - weekday) % 7);
  const sundays = firstSunday <= b ? Math.floor((b - firstSunday) / 7) + 1 : 0;
  return total - sundays;
}

export function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtFcfa(n: number): string {
  return Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ');
}

export function fmtDuration(days: number): string {
  if (days < 45) return `${days} j`;
  const months = Math.round(days / 30.4);
  return months >= 12 && months % 12 === 0 ? `${months / 12} an${months / 12 > 1 ? 's' : ''}` : `${months} mois`;
}

// ---------------------------------------------------------------- calculs par période

export function effectiveEnd(p: NsiaPeriod): string {
  return p.ended_on ?? p.planned_end_on;
}

export function isEarlyExit(p: NsiaPeriod): boolean {
  return p.ended_on != null && p.ended_on < p.planned_end_on;
}

/** Cotisations versées à la ligne par cette période jusqu'à `asOf` (incluse). */
export function contributions(line: NsiaLine, p: NsiaPeriod, asOf: string): number {
  if (asOf < p.starts_on) return 0;
  return workingDays(p.starts_on, minIso(effectiveEnd(p), asOf)) * line.daily_fcfa;
}

/** Épargne du conducteur à la fin de sa période (ce que TamCar lui doit). */
export function savingsAtEnd(line: NsiaLine, p: NsiaPeriod): number {
  return contributions(line, p, effectiveEnd(p));
}

export function refundDueOn(p: NsiaPeriod): string | null {
  if (p.kind !== 'driver') return null;
  return addDays(effectiveEnd(p), isEarlyExit(p) ? REFUND_DAYS_EARLY : REFUND_DAYS_TERM);
}

export function refundAmount(line: NsiaLine, p: NsiaPeriod): number {
  return p.refund_fcfa ?? savingsAtEnd(line, p);
}

export type RefundState = 'none' | 'running' | 'planned' | 'due' | 'late' | 'paid';

/** running = le conducteur est encore en poste ; planned = remboursement à venir (conducteur sorti) ; due = échéance dans les 30 jours ; late = dépassée. */
export function refundState(p: NsiaPeriod, today: string): RefundState {
  if (p.kind !== 'driver') return 'none';
  if (p.refunded_on) return 'paid';
  if (effectiveEnd(p) >= today && !p.ended_on) return 'running';
  const due = refundDueOn(p)!;
  if (due < today) return 'late';
  if (dayNum(due) - dayNum(today) <= 30) return 'due';
  return 'planned';
}

export type PeriodState = 'planned' | 'active' | 'ended';

export function periodState(p: NsiaPeriod, today: string): PeriodState {
  if (today < p.starts_on) return 'planned';
  if (effectiveEnd(p) < today) return 'ended';
  return 'active';
}

// ---------------------------------------------------------------- rachats

export type RedemptionView = NsiaRedemption & {
  /** montant à racheter (estimation tant que le rachat n'est pas fait, montant reçu ensuite) */
  to_redeem: number;
  /** capital versé à la ligne depuis le rachat précédent, jusqu'à la date du rachat */
  contributors: { period: NsiaPeriod; amount: number }[];
  state: 'done' | 'late' | 'soon' | 'planned';
  days_left: number;
};

export function redemptionViews(line: NsiaLine, periods: NsiaPeriod[], reds: NsiaRedemption[], today: string): RedemptionView[] {
  const sorted = [...reds].sort((a, b) => a.due_on.localeCompare(b.due_on));
  const out: RedemptionView[] = [];
  let redeemedBefore = 0; // capital déjà racheté aux rachats précédents
  let prevDue: string | null = null;
  for (const r of sorted) {
    const upTo = addDays(r.due_on, -1); // le capital racheté est celui versé AVANT le jour du rachat (cotisation prélevée le soir)
    const all = periods.map((p) => ({ period: p, amount: contributions(line, p, upTo) }));
    const capitalTotal = all.reduce((s, x) => s + x.amount, 0);
    const est = Math.max(0, capitalTotal - redeemedBefore);
    // détail par période : ce qui a été versé depuis le rachat précédent
    const contributors = periods
      .map((p) => ({
        period: p,
        amount: contributions(line, p, upTo) - (prevDue ? contributions(line, p, addDays(prevDue, -1)) : 0),
      }))
      .filter((x) => x.amount > 0);
    const done = r.done_on != null;
    const principal = done && r.amount_fcfa != null ? r.amount_fcfa - (r.interest_fcfa ?? 0) : est;
    const days_left = dayNum(r.due_on) - dayNum(today);
    out.push({
      ...r,
      to_redeem: done && r.amount_fcfa != null ? r.amount_fcfa : est,
      contributors,
      state: done ? 'done' : days_left < 0 ? 'late' : days_left <= 90 ? 'soon' : 'planned',
      days_left,
    });
    redeemedBefore += principal;
    prevDue = r.due_on;
  }
  return out;
}

// ---------------------------------------------------------------- avance de TamCar

export type AdvanceEvent = {
  date: string;
  delta: number; // + = TamCar avance de l'argent ; - = TamCar récupère
  kind: 'refund' | 'redemption' | 'vacancy';
  label: string;
  line_id: string;
};

/**
 * Avance cumulée de TamCar sur une ligne : cotisations versées pendant les postes vacants + remboursements aux conducteurs
 * − rachats reçus. Les cotisations d'un conducteur sont remboursées par lui : elles ne créent pas d'avance, c'est leur remboursement qui en crée une.
 */
export function advanceEvents(line: NsiaLine, periods: NsiaPeriod[], reds: NsiaRedemption[], today: string): AdvanceEvent[] {
  const ev: AdvanceEvent[] = [];
  for (const p of periods) {
    if (p.kind === 'vacancy') {
      const amount = workingDays(p.starts_on, effectiveEnd(p)) * line.daily_fcfa;
      if (amount > 0) ev.push({ date: effectiveEnd(p), delta: amount, kind: 'vacancy', label: `${line.label} · ${p.label}`, line_id: line.id });
    } else {
      const due = p.refunded_on ?? refundDueOn(p)!;
      ev.push({ date: due, delta: refundAmount(line, p), kind: 'refund', label: `${line.label} · remboursement ${p.label}`, line_id: line.id });
    }
  }
  for (const r of redemptionViews(line, periods, reds, today)) {
    ev.push({ date: r.done_on ?? r.due_on, delta: -r.to_redeem, kind: 'redemption', label: `${line.label} · rachat`, line_id: line.id });
  }
  return ev.sort((a, b) => a.date.localeCompare(b.date) || b.delta - a.delta);
}

export type AdvancePoint = { date: string; value: number };

/** Courbe en escalier : valeur de l'avance juste après chaque événement. */
export function advanceSeries(events: AdvanceEvent[], from: string, to: string): AdvancePoint[] {
  const pts: AdvancePoint[] = [{ date: from, value: 0 }];
  let v = 0;
  for (const e of events) {
    const date = e.date < from ? from : e.date > to ? to : e.date;
    pts.push({ date, value: v }); // palier juste avant
    v += e.delta;
    pts.push({ date, value: v });
  }
  pts.push({ date: to, value: v });
  return pts;
}

export function peakAdvance(events: AdvanceEvent[]): { value: number; date: string | null } {
  let v = 0;
  let peak = 0;
  let at: string | null = null;
  for (const e of events) {
    v += e.delta;
    if (v > peak) {
      peak = v;
      at = e.date;
    }
  }
  return { value: peak, date: at };
}

export function advanceAt(events: AdvanceEvent[], date: string): number {
  return events.filter((e) => e.date <= date).reduce((s, e) => s + e.delta, 0);
}

// ---------------------------------------------------------------- chevauchements

export type Overlap = { a: NsiaPeriod; b: NsiaPeriod; from: string; to: string; days: number };

/** Deux périodes d'une même ligne qui se recouvrent (deux personnes sur le même emplacement, ou un poste vacant qui chevauche un conducteur). */
export function overlaps(periods: NsiaPeriod[]): Overlap[] {
  const res: Overlap[] = [];
  const s = [...periods].sort((x, y) => x.starts_on.localeCompare(y.starts_on));
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j < s.length; j++) {
      const from = maxIso(s[i].starts_on, s[j].starts_on);
      const to = minIso(effectiveEnd(s[i]), effectiveEnd(s[j]));
      if (from <= to) res.push({ a: s[i], b: s[j], from, to, days: dayNum(to) - dayNum(from) + 1 });
    }
  }
  return res;
}

/** Répartit les périodes sur des sous-lignes pour que celles qui se recouvrent ne se superposent pas à l'écran. */
export function assignLanes(periods: NsiaPeriod[]): Map<string, number> {
  const lanes: string[] = []; // fin de la dernière période de chaque sous-ligne
  const out = new Map<string, number>();
  for (const p of [...periods].sort((x, y) => x.starts_on.localeCompare(y.starts_on))) {
    let k = lanes.findIndex((end) => end < p.starts_on);
    if (k === -1) {
      k = lanes.length;
      lanes.push('');
    }
    lanes[k] = effectiveEnd(p);
    out.set(p.id, k);
  }
  return out;
}

// ---------------------------------------------------------------- assemblage par ligne

export type RefundDue = { period: NsiaPeriod; amount: number; due: string; state: RefundState };

export type LineData = {
  line: NsiaLine;
  periods: NsiaPeriod[];
  reds: RedemptionView[];
  events: AdvanceEvent[];
  overlaps: Overlap[];
  current: NsiaPeriod | null;
  nextRed: RedemptionView | null;
  refunds: RefundDue[]; // remboursements non payés, conducteur sorti ou fin de période connue
  peak: { value: number; date: string | null };
  advanceNow: number;
  contributedToDate: number;
  endsOn: string; // fin du contrat NSIA
};

export function buildLineData(line: NsiaLine, allPeriods: NsiaPeriod[], allReds: NsiaRedemption[], today: string): LineData {
  const periods = allPeriods.filter((p) => p.line_id === line.id).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const reds = redemptionViews(line, periods, allReds.filter((r) => r.line_id === line.id), today);
  const events = advanceEvents(line, periods, allReds.filter((r) => r.line_id === line.id), today);
  const refunds: RefundDue[] = periods
    .filter((p) => p.kind === 'driver' && !p.refunded_on)
    .map((p) => ({ period: p, amount: refundAmount(line, p), due: refundDueOn(p)!, state: refundState(p, today) }));
  return {
    line,
    periods,
    reds,
    events,
    overlaps: overlaps(periods),
    current: periods.find((p) => periodState(p, today) === 'active') ?? null,
    nextRed: reds.find((r) => !r.done_on) ?? null,
    refunds,
    peak: peakAdvance(events),
    advanceNow: advanceAt(events, today),
    contributedToDate: periods.reduce((s, p) => s + contributions(line, p, today), 0),
    endsOn: addMonths(line.opened_on, line.term_months),
  };
}

export type BoardTotals = {
  lines: number;
  nextRed: { date: string; label: string; amount: number; days: number } | null;
  toRedeem90: number;
  refundsDue: number; // dus ou en retard, ou à échéance dans les 90 jours
  refundsLate: number;
  advanceNow: number;
  peak: { value: number; date: string | null };
  overlaps: number;
};

export function boardTotals(data: LineData[], today: string): BoardTotals {
  const horizon = addDays(today, 90);
  let next: BoardTotals['nextRed'] = null;
  let toRedeem90 = 0;
  let refundsDue = 0;
  let refundsLate = 0;
  for (const d of data) {
    for (const r of d.reds) {
      if (r.done_on) continue;
      if (r.due_on <= horizon) toRedeem90 += r.to_redeem;
      if (!next || r.due_on < next.date) next = { date: r.due_on, label: d.line.label, amount: r.to_redeem, days: r.days_left };
    }
    for (const f of d.refunds) {
      if (f.state === 'running') continue;
      if (f.due <= horizon) refundsDue += f.amount;
      if (f.state === 'late') refundsLate += f.amount;
    }
  }
  const all = data.flatMap((d) => d.events).sort((a, b) => a.date.localeCompare(b.date) || b.delta - a.delta);
  return {
    lines: data.length,
    nextRed: next,
    toRedeem90,
    refundsDue,
    refundsLate,
    advanceNow: advanceAt(all, today),
    peak: peakAdvance(all),
    overlaps: data.reduce((s, d) => s + d.overlaps.length, 0),
  };
}
