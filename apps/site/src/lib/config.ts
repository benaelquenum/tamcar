// Adresses et liens du site. Les applications restent des applications : le site renvoie vers elles.

export const CLIENT_APP_URL = process.env.NEXT_PUBLIC_CLIENT_APP_URL || 'https://tamcar-client.vercel.app';
export const DRIVER_APP_URL = process.env.NEXT_PUBLIC_DRIVER_APP_URL || 'https://tamcar-driver-portal.vercel.app';

// Pas encore d'adresse TamCar : adresse du fondateur, à remplacer (NEXT_PUBLIC_CONTACT_EMAIL) dès qu'elle existe.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'terencebeniraphael@gmail.com';

// Demande de proposition (partenaires véhicule) : un e-mail prérempli ; la proposition chiffrée est envoyée en réponse.
export const PROPOSAL_MAILTO =
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Demande de proposition : partenaire véhicule TamCar')}` +
  `&body=${encodeURIComponent(
    [
      'Bonjour,',
      '',
      'Je souhaite recevoir la proposition TamCar pour mon ou mes véhicules.',
      '',
      'Nom :',
      'Téléphone :',
      'Ville :',
      'Type de véhicule (voiture Essentiel / Confort / VIP, moto, tricycle) :',
      'Nombre de véhicules :',
      'Véhicule déjà acheté, ou à acquérir ? Budget envisagé :',
      '',
      'Merci.',
    ].join('\n'),
  )}`;

export const ADDRESS = 'Ilot 2054, M/HOUNGBEDJI, Mènontin, Cotonou, Bénin';

export const LEGAL = {
  cgu: `${CLIENT_APP_URL}/cgu`,
  privacy: `${CLIENT_APP_URL}/confidentialite`,
};
