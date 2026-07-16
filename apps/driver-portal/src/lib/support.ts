/**
 * Numéro du service client TamCar — utilisé par les modaux de conflit
 * (fin de course contestée, annulation, incident). Configurable via env.
 * Fallback : numéro fictif de dev à remplacer avant lancement prod.
 */
export const SUPPORT_PHONE =
  process.env.NEXT_PUBLIC_SUPPORT_PHONE || '+22997000000';

export const SUPPORT_PHONE_DISPLAY = SUPPORT_PHONE.replace(
  /^\+229(\d{2})(\d{2})(\d{2})(\d{2})$/,
  '+229 $1 $2 $3 $4',
);
