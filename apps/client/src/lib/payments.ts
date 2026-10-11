// Paiement Mobile Money (FeexPay) côté application.
//
// Le navigateur ne détient aucune clé. Le déroulé :
//   1. une transaction « en attente » est créée en base (RPC initiate_fedapay_topup / initiate_fedapay_debt : le montant y est figé) ;
//   2. la fonction feexpay-pay demande le paiement à FeexPay : le client reçoit une demande de confirmation sur son téléphone
//      (code PIN Mobile Money) ;
//   3. on suit le résultat : la base (mise à jour par le webhook) et, de secours, la vérification directe feexpay-verify
//      (le serveur interroge FeexPay avec la clé privée : rien ne peut être falsifié depuis ce navigateur).
//
// Les deux applications (client et TamCar Pro) utilisent le même fichier : toute modification se fait dans les deux.

import { supabaseBrowser } from '@/lib/supabase-browser';
import { formatBeninPhone } from '@/lib/phone';

export type Network = 'mtn' | 'moov' | 'celtiis';

export const NETWORKS: { id: Network; label: string; sub: string }[] = [
  { id: 'mtn', label: 'MTN MoMo', sub: 'MTN Mobile Money' },
  { id: 'moov', label: 'Moov Money', sub: 'Moov Africa' },
  { id: 'celtiis', label: 'Celtiis Cash', sub: 'Celtiis Bénin' },
];

export type PaymentsConfig = {
  /** Paiement réel FeexPay actif (réglage « payments_provider » = 1 dans Bonus chauffeur → Paiements) */
  feexpay: boolean;
  /** Mode TEST : recharges et règlements simulés (gratuits) autorisés */
  testMode: boolean;
};

export async function fetchPaymentsConfig(): Promise<PaymentsConfig> {
  const { data } = await supabaseBrowser.rpc('payments_config');
  const row = (Array.isArray(data) ? data[0] : data) as { feexpay?: boolean; test_mode?: boolean } | null;
  return { feexpay: !!row?.feexpay, testMode: row?.test_mode !== false };
}

export type PaymentOutcome =
  | { status: 'success' }
  | { status: 'failed'; reason: string }
  | { status: 'pending' }
  | { status: 'error'; message: string };

/** Motif d'échec renvoyé par FeexPay / l'opérateur → phrase compréhensible. */
export function friendlyReason(reason?: string | null): string {
  const r = String(reason ?? '').toUpperCase();
  if (/LOW_BALANCE|INSUFFICIENT|BALANCE/.test(r)) return 'Solde Mobile Money insuffisant. Vous n’avez pas été débité.';
  if (/PAYER_NOT_FOUND|INVALID_PHONE|NOT_FOUND/.test(r)) return 'Numéro introuvable chez cet opérateur : vérifiez le numéro et l’opérateur choisi.';
  if (/TIMEOUT|EXPIRED|NOT_CONFIRM|REJECTED|DECLINED|CANCEL/.test(r)) return 'Le paiement n’a pas été confirmé sur votre téléphone. Vous n’avez pas été débité.';
  return 'Paiement refusé par l’opérateur. Vous n’avez pas été débité.';
}

// Une réponse non-2xx d'une fonction serveur : on récupère le message utile plutôt que « Edge Function returned a non-2xx status code »
async function errorDetail(err: unknown): Promise<{ status?: string; code?: string; error?: string; reason?: string }> {
  try {
    const res = (err as { context?: Response }).context;
    if (res && typeof res.json === 'function') return await res.json();
  } catch {
    /* corps illisible */
  }
  return {};
}

const WAIT_MS = 150_000; // le client a ~2 minutes pour saisir son code PIN

export async function payWithMobileMoney(opts: {
  rpcName: 'initiate_fedapay_topup' | 'initiate_fedapay_debt';
  amountFcfa: number;
  network: Network;
  phone: string;
  /** Appelée dès que la demande de paiement est lancée : le client doit confirmer sur son téléphone. */
  onWaiting?: () => void;
}): Promise<PaymentOutcome> {
  const e164 = formatBeninPhone(opts.phone);
  if (!e164) return { status: 'error', message: 'Numéro invalide : saisissez un numéro béninois (ex. 01 97 00 00 00).' };

  const { data, error } = await supabaseBrowser.rpc(opts.rpcName, { p_amount_fcfa: opts.amountFcfa });
  if (error || !Array.isArray(data) || !data[0]) {
    return { status: 'error', message: error?.message ?? 'Impossible d’initier le paiement.' };
  }
  const reference = (data[0] as { reference: string }).reference;

  // Dès que la demande part : l'écran passe sur « Confirmez sur votre téléphone ». Chez Moov, l'appel reste ouvert jusqu'à la
  // confirmation du client (code PIN) : sans cela, l'écran restait sur « Envoi de la demande… » pendant toute la saisie du code.
  opts.onWaiting?.();

  const { data: pay, error: payErr } = await supabaseBrowser.functions.invoke('feexpay-pay', {
    body: { reference, network: opts.network, phone: e164 },
  });
  if (payErr) {
    const d = await errorDetail(payErr);
    if (d.code === 'not_configured') return { status: 'error', message: 'Le paiement Mobile Money n’est pas encore disponible. Réessayez plus tard.' };
    if (d.status === 'failed' || d.reason) return { status: 'failed', reason: friendlyReason(d.reason) };
    return { status: 'error', message: d.error ?? 'Paiement impossible pour le moment. Réessayez.' };
  }
  const first = pay as { status?: string; reason?: string } | null;
  if (first?.status === 'success') return { status: 'success' };
  if (first?.status === 'failed') return { status: 'failed', reason: friendlyReason(first.reason) };

  const started = Date.now();
  for (let i = 0; Date.now() - started < WAIT_MS; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const { data: rows } = await supabaseBrowser.from('wallet_transactions').select('status').eq('fedapay_reference', reference).limit(1);
    const s = Array.isArray(rows) ? (rows[0] as { status?: string } | undefined)?.status : undefined;
    if (s === 'success') return { status: 'success' };
    if (s === 'failed') return { status: 'failed', reason: friendlyReason('') };
    // Toutes les 3 s : confirmation directe auprès de FeexPay (secours si le webhook tarde ou se perd)
    if (i % 3 === 2) {
      const { data: v } = await supabaseBrowser.functions.invoke('feexpay-verify', { body: { reference } });
      const vs = v as { status?: string; reason?: string } | null;
      if (vs?.status === 'success') return { status: 'success' };
      if (vs?.status === 'failed') return { status: 'failed', reason: friendlyReason(vs.reason) };
    }
  }
  return { status: 'pending' };
}
