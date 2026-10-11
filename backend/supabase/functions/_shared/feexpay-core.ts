// Logique pure (sans Deno ni réseau) partagée par les fonctions FeexPay — testable avec Node : backend/tests/feexpay_core.test.mjs

export type Network = 'mtn' | 'moov' | 'celtiis';
export type PayStatus = 'success' | 'failed' | 'pending';

/** Canal FeexPay (fin de l'adresse /api/transactions/public/requesttopay/<canal>) pour chaque opérateur du Bénin. */
export const CHANNEL: Record<Network, string> = { mtn: 'mtn', moov: 'moov', celtiis: 'celtiis_bj' };

/** Référence TamCar d'une transaction « en attente » (créée par initiate_fedapay_topup / initiate_fedapay_debt). */
export const REF_RE = /^FDP-[0-9a-f]{32}$/;

export function isNetwork(v: unknown): v is Network {
  return v === 'mtn' || v === 'moov' || v === 'celtiis';
}

/**
 * Numéro béninois au format FeexPay : « 229 » + 10 chiffres commençant par 01 (ex. 2290197000000).
 * Accepte « 97 00 00 00 », « 0197000000 », « +229 01 97 00 00 00 », « 00229… ». Retourne null si le format est invalide.
 */
export function normalizePhone(input: string): string | null {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.startsWith('00229')) d = d.slice(5);
  else if (d.startsWith('229')) d = d.slice(3);
  if (d.length === 8) d = '01' + d;
  if (d.length !== 10 || !d.startsWith('01')) return null;
  return '229' + d;
}

/** Statut FeexPay → statut TamCar. Tout ce qui n'est pas clairement final reste « en attente ». */
export function mapStatus(s: unknown): PayStatus {
  const v = String(s ?? '').trim().toUpperCase();
  if (v === 'SUCCESSFUL' || v === 'SUCCESS') return 'success';
  if (v === 'FAILED' || v === 'FAILURE' || v === 'REJECTED' || v === 'CANCELLED' || v === 'CANCELED') return 'failed';
  return 'pending';
}

/** Retrouve notre référence FDP-… dans le champ callback_info (chaîne, nombre ou objet JSON) renvoyé par FeexPay. */
export function refFromCallback(cb: unknown): string {
  if (cb == null) return '';
  const txt = typeof cb === 'string' ? cb : JSON.stringify(cb);
  return txt.match(/FDP-[0-9a-f]{32}/)?.[0] ?? '';
}

/** Motif d'échec lisible, quelle que soit la forme de la réponse FeexPay (reason, message, response_operator…). */
export function reasonOf(body: any): string {
  if (!body || typeof body !== 'object') return '';
  const direct = body.reason ?? body.message ?? body.error ?? body.code;
  if (typeof direct === 'string' && direct.trim() && direct.trim().toUpperCase() !== 'FAILED') return direct.trim();
  const d = body.response_operator?.description;
  if (Array.isArray(d) && d[0]) return String(d[0]);
  if (typeof d === 'string' && d) return d;
  return '';
}

/** Comparaison en temps constant (secret du webhook). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Secret reçu dans l'en-tête Authorization (« Bearer <secret> » ou « Basic <secret> », selon la configuration du webhook). */
export function secretFromAuthHeader(h: string | null): string {
  return String(h ?? '').trim().replace(/^(Bearer|Basic)\s+/i, '');
}

// ------------------------------------------------------------------------------------------------------------------------------
// Retraits (payouts) vers le Mobile Money des chauffeurs — API : POST /api/payouts/public/transfer/global, statut :
// GET /api/payouts/status/public/{reference}. Au lancement FeexPay répond toujours PENDING : le statut final se relit par l'API.
// ------------------------------------------------------------------------------------------------------------------------------

export type PayoutNetwork = 'MTN' | 'MOOV';

/** Réseau FeexPay d'un retrait. Seuls MTN et Moov sont gérés (Celtiis : retrait à la main). */
export function payoutNetwork(provider: unknown): PayoutNetwork | null {
  const v = String(provider ?? '').trim().toLowerCase();
  return v === 'mtn' ? 'MTN' : v === 'moov' ? 'MOOV' : null;
}

/** Libellé de l'opération vu par le chauffeur : 30 caractères au plus, sans caractère spécial (exigence FeexPay). */
export const PAYOUT_MOTIF = 'Retrait TamCar';

/** Marqueur renvoyé par FeexPay dans callback_info : permet au webhook de retrouver NOTRE retrait. */
export function payoutCallback(payoutId: string): string {
  return `TCP-${payoutId}`;
}
const PAYOUT_CB_RE = /TCP-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
export function payoutIdFromCallback(cb: unknown): string {
  if (cb == null) return '';
  const txt = typeof cb === 'string' ? cb : JSON.stringify(cb);
  return txt.match(PAYOUT_CB_RE)?.[1]?.toLowerCase() ?? '';
}

/** Identifiant FeexPay (UUID) tel que renvoyé par l'API : refuse tout ce qui n'a pas cette forme (il sert dans une adresse). */
export function isProviderRef(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function buildPayoutBody(o: { phone: string; amount: number; shop: string; network: PayoutNetwork; payoutId: string }) {
  return {
    phoneNumber: o.phone,
    amount: Math.round(o.amount),
    shop: o.shop,
    network: o.network,
    motif: PAYOUT_MOTIF,
    callback_info: payoutCallback(o.payoutId),
  };
}

/**
 * Un refus DÉFINITIF est une réponse 4xx de FeexPay (clé, droits, liste d'IP, solde, numéro refusés) : l'argent n'est pas parti,
 * on peut remettre le retrait en attente. Tout le reste (5xx, délai dépassé, réponse illisible) est AMBIGU : FeexPay a peut-être
 * lancé le virement, on ne rembourse ni ne renvoie jamais automatiquement.
 */
export function isDefinitiveRefusal(httpStatus: number): boolean {
  return httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 && httpStatus !== 425 && httpStatus !== 429;
}
