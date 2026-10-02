// Mois civils au Bénin (UTC+1, sans heure d'été), au format AAAA-MM.

export const TZ_OFFSET = '+01:00';

export function monthKey(d: Date): string {
  const l = new Date(d.getTime() + 3_600_000);
  return `${l.getUTCFullYear()}-${String(l.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function addMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

export const monthStart = (ym: string) => `${ym}-01T00:00:00${TZ_OFFSET}`;

/** « 2026-09 » → « septembre 2026 » */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
