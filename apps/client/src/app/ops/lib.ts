/**
 * Espace responsable opérations — types et helpers partagés.
 *
 * L'accès à cet espace ne dépend PAS de `profiles.role` (un responsable
 * opérations peut aussi être chauffeur) mais de l'appartenance à la table
 * `ops_city_managers`, vérifiée côté base par `ops_is_manager()`.
 */

export type OpsDashboardRow = {
  city: string;
  month_start: string;
  rate_pct: number;
  monthly_cap_fcfa: number;
  rides_count: number;
  volume_fcfa: number;
  active_drivers: number;
  gross_pay_fcfa: number;
  pay_fcfa: number;
  cap_reached: boolean;
  cap_progress_pct: number;
  settled: boolean;
  started_on: string;
  ended_on: string | null;
};

export type OpsDailyRow = {
  city: string;
  day: string;
  rides_count: number;
  volume_fcfa: number;
  gross_pay_fcfa: number;
  pay_fcfa: number;
  cumulative_pay_fcfa: number;
};

export type OpsMonthRow = {
  city: string;
  month_start: string;
  rides_count: number;
  volume_fcfa: number;
  pay_fcfa: number;
  cap_reached: boolean;
  settled: boolean;
};

/** 1234567 → "1 234 567" (espace insécable fine évitée : lisibilité SMS/terrain). */
export function fmt(n: number): string {
  return Math.round(Number(n) || 0)
    .toLocaleString('fr-FR')
    .replace(/[  ,]/g, ' ');
}

/** "2026-08-01" → "août 2026" */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "2026-08-14" → "14 août" */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "2026-08" (param d'URL) → "2026-08-01" (param SQL). Fallback : mois courant. */
export function parseMonthParam(raw?: string): string {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  const now = new Date();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${m}-01`;
}

/** "2026-08-01" → "2026-08" */
export function toMonthParam(iso: string): string {
  return iso.slice(0, 7);
}

/** Décale un mois ISO ("2026-08-01") de n mois. */
export function shiftMonth(iso: string, delta: number): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
