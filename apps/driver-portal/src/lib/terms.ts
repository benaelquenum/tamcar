/**
 * Version courante des documents légaux (CGU + Politique de confidentialité).
 * Doit rester synchronisée avec apps/client/src/lib/terms.ts :
 * incrémenter la date à chaque modification substantielle des documents —
 * tous les chauffeurs devront ré-accepter à leur prochaine connexion.
 */
export const TERMS_VERSION = '2026-07-22';

export const TERMS_APP = 'driver' as const;
