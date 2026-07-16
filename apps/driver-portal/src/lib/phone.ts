/**
 * Helpers pour numéros de téléphone béninois.
 * Format E.164 : +229XXXXXXXX (11 chiffres au total après le +229).
 * Bénin : les numéros commencent par 01 (nouvelle numérotation depuis 2021).
 */

/**
 * Normalise en E.164 (+229XXXXXXXX) depuis n'importe quel format input :
 *   "+22901 67 59 18 17"  →  "+2290167591817"
 *   "00229 0167591817"    →  "+2290167591817"
 *   "0167591817"          →  "+2290167591817"
 *   "67591817"            →  "+2290167591817" (préfixe 01 ajouté auto)
 * Retourne null si format invalide.
 */
export function formatBeninPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;

  let national: string;

  if (digits.startsWith('229')) {
    national = digits.slice(3);
  } else if (digits.startsWith('00229')) {
    national = digits.slice(5);
  } else {
    national = digits;
  }

  // Un numéro béninois national fait 10 chiffres (commence par 01)
  // ou 8 chiffres (ancien format, on préfixe 01)
  if (national.length === 8) national = '01' + national;

  if (national.length !== 10) return null;
  if (!national.startsWith('01')) return null;

  return `+229${national}`;
}

/** Affichage lisible : "+229 01 67 59 18 17" */
export function displayBeninPhone(e164: string): string {
  if (!e164.startsWith('+229')) return e164;
  const n = e164.slice(4);
  if (n.length !== 10) return e164;
  return `+229 ${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 6)} ${n.slice(6, 8)} ${n.slice(8, 10)}`;
}
