/** Types et utilitaires de l'espace partenaire véhicule (fonctions dealer_my_* côté base). */

export type DealerSummary = {
  dealer_id: string;
  company_name: string;
  share_pct: number;
  is_shareholder: boolean;
  shareholder_pct: number | null;
  today: string;
  month_start: string;
  today_fcfa: number;
  today_rides: number;
  month_fcfa: number;
  month_rides: number;
  prev_month_fcfa: number;
  prev_to_date_fcfa: number;
  total_fcfa: number;
  total_rides: number;
  last_ride_at: string | null;
  wallet_fcfa: number;
  paid_fcfa: number;
  fund_fcfa: number;
  adr_amount_fcfa: number | null;
  adr_refunded_fcfa: number | null;
  adr_status: 'pending_activation' | 'active' | 'refunded' | 'forfeited' | null;
  adr_refund_target: string | null;
  vehicles_total: number;
  vehicles_active: number;
  vehicles_unassigned: number;
};

export type DealerVehicle = {
  vehicle_id: string;
  plate_number: string;
  brand: string;
  model: string;
  vehicle_year: number | null;
  color: string | null;
  category: string;
  status: 'pending' | 'active' | 'maintenance' | 'retired' | 'archived';
  activated_at: string | null;
  driver_name: string | null;
  driver_online: boolean | null;
  driver_status: string | null;
  today_fcfa: number;
  today_rides: number;
  month_fcfa: number;
  month_rides: number;
  expected_daily_fcfa: number;
};

export type DealerDay = { day: string; rides: number; share_fcfa: number };
export type DealerMonth = { month_start: string; rides: number; share_fcfa: number };
export type DealerRecent = {
  ride_id: string;
  ended_at: string;
  vehicle_id: string | null;
  plate_number: string | null;
  brand: string | null;
  model: string | null;
  share_fcfa: number;
};

export type DealerPayout = { paid_at: string; amount_fcfa: number; note: string | null };

export const CAT_LABEL: Record<string, string> = {
  moto: 'Moto',
  tricycle: 'Tricycle',
  essentiel: 'Essentiel',
  confort: 'Confort',
  premium: 'VIP',
};

export const VEHICLE_STATUS_LABEL: Record<DealerVehicle['status'], string> = {
  pending: 'En attente d’activation',
  active: 'Actif',
  maintenance: 'En maintenance',
  retired: 'Retiré',
  archived: 'Archivé',
};

export function fmt(n: number | null | undefined): string {
  return Math.round(Number(n) || 0)
    .toLocaleString('fr-FR')
    .replace(/[  ]/g, ' ');
}

/** Libellé d'un mois à partir de « 2026-10-01 » : « octobre 2026 ». */
export function monthLabel(iso: string, withYear = true): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  });
}

/** Mois précédent d'une date « 2026-10-01 » → « 2026-09-01 ». */
export function previousMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Paramètre d'aperçu admin (?as=<id du partenaire>) : ignoré tel quel s'il n'est pas un UUID. */
export function previewParam(as: string | string[] | undefined): string | null {
  const v = Array.isArray(as) ? as[0] : as;
  return v && UUID.test(v) ? v : null;
}

/** Heure de Porto-Novo (HH:MM:SS). */
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Africa/Porto-Novo',
  });
}

/** « il y a 5 min », « il y a 3 h »… */
export function ago(iso: string | null): string {
  if (!iso) return 'aucune course pour le moment';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86_400)} j`;
}
