// Génère un email lisible à partir d'un nom complet, format :
//   {première lettre du nom de famille}{prénom entier}@tamcar.local
// Ex :
//   "AZANMADOHOUENOU Fulbert" → "afulbert@tamcar.local"
//   "Térence QUENUM"          → "qterence@tamcar.local"
//   "Marie Curie"             → "cmarie@tamcar.local"
//
// Détection nom / prénom :
//   1. Si un mot est en all-caps ≥ 2 chars → c'est le nom de famille (convention béninoise).
//   2. Sinon fallback : le dernier mot = nom de famille (convention française).
//
// Collisions gérées côté appelant via ensureUniqueEmail.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // retire accents
    .replace(/[^a-z0-9]/g, '');
}

export function deriveEmail(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return `chauffeur${Date.now().toString(36)}@tamcar.local`;
  if (parts.length === 1) {
    // Un seul mot — on prend juste le mot en minuscule
    return `${normalize(parts[0]) || 'chauffeur'}@tamcar.local`;
  }

  // 1. Cherche un mot en majuscules (nom béninois)
  let lastIdx = parts.findIndex((p) => p.length >= 2 && p === p.toUpperCase());
  // 2. Fallback : dernier mot
  if (lastIdx < 0) lastIdx = parts.length - 1;

  const last = parts[lastIdx];
  const first = parts.filter((_, i) => i !== lastIdx).join(' ');

  const lastNorm = normalize(last);
  const firstNorm = normalize(first);
  const local = `${lastNorm.charAt(0) || 'x'}${firstNorm || 'chauffeur'}`;
  return `${local}@tamcar.local`;
}

/**
 * Vérifie si l'email de base est libre. S'il est pris, ajoute 2, 3, ... jusqu'à
 * trouver un disponible. `existsCheck` renvoie true si l'email est déjà pris.
 */
export async function ensureUniqueEmail(
  base: string,
  existsCheck: (email: string) => Promise<boolean>,
): Promise<string> {
  if (!(await existsCheck(base))) return base;
  const [local, domain] = base.split('@');
  for (let i = 2; i <= 999; i++) {
    const candidate = `${local}${i}@${domain}`;
    if (!(await existsCheck(candidate))) return candidate;
  }
  // Fallback improbable : timestamp
  return `${local}-${Date.now().toString(36)}@${domain}`;
}
