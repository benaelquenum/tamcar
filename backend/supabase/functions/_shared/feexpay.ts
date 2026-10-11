// FeexPay — accès à l'API depuis les fonctions serveur (la clé privée ne quitte jamais le serveur).
//
// Secrets Supabase attendus (posés par backend/tools/set-feexpay-keys.ps1) :
//   FEEXPAY_API_KEY        clé privée (sandbox : test_key_… ; production : fp_…)
//   FEEXPAY_SHOP_ID        identifiant public de la boutique
//   FEEXPAY_MODE           « sandbox » ou « live » (défaut : sandbox)
//   FEEXPAY_API_URL        facultatif (défaut selon le mode)
//   FEEXPAY_WEBHOOK_SECRET facultatif : secret de l'en-tête Authorization du webhook
//
// Documentation : https://docs.feexpay.me/api_rest.html (Payin, Statut des payins, Webhook, Sandbox)

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { mapStatus, reasonOf, type PayStatus } from './feexpay-core.ts';

export * from './feexpay-core.ts';

export function feexConfig() {
  const mode: 'sandbox' | 'live' = (Deno.env.get('FEEXPAY_MODE') ?? 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox';
  const base = (Deno.env.get('FEEXPAY_API_URL') ?? (mode === 'live' ? 'https://api-v2.feexpay.me' : 'https://sandbox-api.feexpay.me')).replace(/\/+$/, '');
  return {
    mode,
    base,
    key: Deno.env.get('FEEXPAY_API_KEY') ?? '',
    shop: Deno.env.get('FEEXPAY_SHOP_ID') ?? '',
    webhookSecret: Deno.env.get('FEEXPAY_WEBHOOK_SECRET') ?? '',
  };
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

/** Une ligne dans payment_events par appel (lecture admin) : on voit ce que FeexPay a envoyé et ce que TamCar en a fait. */
export async function trace(
  source: 'pay' | 'verify' | 'webhook',
  row: { event?: string; reference?: string; provider_tx_id?: string; amount_fcfa?: number; outcome: string; detail?: string },
) {
  try {
    await admin.from('payment_events').insert({ source, provider: 'feexpay', ...row, detail: row.detail?.slice(0, 500) });
  } catch (e) {
    console.error('trace payment_events impossible:', e);
  }
}

export type PayinStatus = {
  status: PayStatus;
  amount: number;
  reason: string;
  providerRef: string;
  /** false : FeexPay ne connaît pas cette transaction (404) */
  found: boolean;
  raw: any;
};

/**
 * Statut d'un payin auprès de FeexPay (clé privée : le résultat ne peut pas être falsifié depuis un navigateur).
 * `key` est l'identifiant FeexPay (reference) ; à défaut, la recherche se fait par notre référence FDP-… transmise en callback_info.
 */
export async function getPayinStatus(key: string, byCallbackInfo = false): Promise<PayinStatus> {
  const cfg = feexConfig();
  const url = `${cfg.base}/api/transactions/public/single/status/${encodeURIComponent(key)}${byCallbackInfo ? '?by=callback_info' : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => null);
  if (res.status === 404) return { status: 'pending', amount: 0, reason: '', providerRef: '', found: false, raw: body };
  if (!res.ok) {
    throw new Error(`FeexPay statut : HTTP ${res.status} ${JSON.stringify(body ?? '').slice(0, 160)}`);
  }
  return {
    status: mapStatus(body?.status),
    amount: Number(body?.amount ?? 0),
    reason: reasonOf(body),
    providerRef: String(body?.reference ?? body?.transref ?? key),
    found: true,
    raw: body,
  };
}

/** Applique le résultat final d'un payin dans le portefeuille (idempotent, montant vérifié par la base). Retourne le statut TamCar. */
export async function applyOutcome(
  source: 'pay' | 'verify' | 'webhook',
  reference: string,
  st: PayinStatus,
  event?: string,
): Promise<PayStatus> {
  if (st.status === 'success') {
    const { error } = await admin.rpc('apply_fedapay_success', {
      p_reference: reference,
      p_fedapay_transaction_id: st.providerRef,
      p_amount_fcfa: st.amount,
    });
    if (error) {
      await trace(source, { event, reference, provider_tx_id: st.providerRef, amount_fcfa: st.amount, outcome: 'error', detail: error.message });
      throw new Error(error.message);
    }
    await trace(source, { event, reference, provider_tx_id: st.providerRef, amount_fcfa: st.amount, outcome: 'applied' });
    return 'success';
  }
  if (st.status === 'failed') {
    await admin.rpc('apply_fedapay_declined', { p_reference: reference, p_fedapay_transaction_id: st.providerRef || null });
    await trace(source, { event, reference, provider_tx_id: st.providerRef, amount_fcfa: st.amount, outcome: 'declined', detail: st.reason });
    return 'failed';
  }
  await trace(source, { event, reference, provider_tx_id: st.providerRef, amount_fcfa: st.amount, outcome: 'pending' });
  return 'pending';
}
