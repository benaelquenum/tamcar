// Proposition de partage du suivi de course la nuit : heure (Porto-Novo) et choix du client, gardés
// sur l'appareil. Le client accepte ou décline à chaque course ; il peut aussi demander à ne plus
// recevoir la proposition.

const TZ = 'Africa/Porto-Novo';
const OFF_KEY = 'tamcar:night-share:off';
const rideKey = (rideId: string) => `tamcar:night-share:${rideId}`;

/** De 21 h à 5 h (heure du Bénin). */
export function isNightInPortoNovo(d: Date = new Date()): boolean {
  // En français, « format » renvoie « 21 h » : on lit la partie « heure » seule.
  const part = new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ })
    .formatToParts(d)
    .find((p) => p.type === 'hour');
  const hour = Number(part?.value ?? NaN);
  if (Number.isNaN(hour)) return false;
  return hour >= 21 || hour < 5;
}

export type NightShareChoice = 'accepted' | 'declined';

export function getNightShareChoice(rideId: string): NightShareChoice | null {
  try {
    const v = window.localStorage.getItem(rideKey(rideId));
    return v === 'accepted' || v === 'declined' ? v : null;
  } catch {
    return null;
  }
}

export function setNightShareChoice(rideId: string, choice: NightShareChoice): void {
  try {
    window.localStorage.setItem(rideKey(rideId), choice);
  } catch {
    /* stockage indisponible : la proposition pourra se réafficher, sans gravité */
  }
}

export function isNightShareDisabled(): boolean {
  try {
    return window.localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
}

export function disableNightShare(): void {
  try {
    window.localStorage.setItem(OFF_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Remet la proposition en marche (depuis « Mon compte »). */
export function enableNightShare(): void {
  try {
    window.localStorage.removeItem(OFF_KEY);
  } catch {
    /* ignore */
  }
}
