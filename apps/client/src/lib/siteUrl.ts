/**
 * Adresse du site web TamCar (apps/site) : c'est là que se connectent les partenaires véhicule.
 * Variable facultative : NEXT_PUBLIC_SITE_URL (valeur par défaut = domaine Vercel actuel).
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://tamcar-site.vercel.app').replace(/\/$/, '');

/** Page de connexion de l'espace partenaire du site. */
export const PARTNER_LOGIN_URL = `${SITE_URL}/connexion`;
