// Adresses et liens du site. Les applications restent des applications : le site renvoie vers elles.

export const CLIENT_APP_URL = process.env.NEXT_PUBLIC_CLIENT_APP_URL || 'https://tamcar-client.vercel.app';
export const DRIVER_APP_URL = process.env.NEXT_PUBLIC_DRIVER_APP_URL || 'https://tamcar-driver-portal.vercel.app';

// Pas encore d'adresse TamCar : adresse du fondateur, à remplacer (NEXT_PUBLIC_CONTACT_EMAIL) dès qu'elle existe.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'terencebeniraphael@gmail.com';

export const ADDRESS = 'Ilot 2054, M/HOUNGBEDJI, Mènontin, Cotonou, Bénin';

export const LEGAL = {
  cgu: `${CLIENT_APP_URL}/cgu`,
  privacy: `${CLIENT_APP_URL}/confidentialite`,
};
