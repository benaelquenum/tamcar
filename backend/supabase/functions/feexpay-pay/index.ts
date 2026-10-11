// FeexPay — demande de paiement Mobile Money (payin).
//
// L'application crée d'abord une transaction « en attente » (RPC initiate_fedapay_topup / initiate_fedapay_debt) puis appelle
// cette fonction avec la référence TamCar (FDP-…), l'opérateur et le numéro. La fonction :
//   1. vérifie le jeton, que la transaction appartient à l'appelant, qu'elle est « en attente » et pas déjà envoyée ;
//   2. lit le MONTANT dans la base (jamais dans la requête du navigateur) ;
//   3. « prend » la transaction (une seule demande de paiement par référence) ;
//   4. demande le paiement à FeexPay avec la clé privée : le client reçoit une demande de confirmation sur son téléphone ;
//   5. si FeexPay répond tout de suite SUCCESSFUL/FAILED, le confirme par un appel de statut avant de créditer.
// Le résultat final d'un paiement en attente arrive ensuite par le webhook (feexpay-webhook) ou la vérification (feexpay-verify).
//
// Réponse : { status: 'success' | 'failed' | 'pending', reason?, code? }

// deno-lint-ignore-file no-explicit-any
import {
  CHANNEL, CORS, REF_RE, admin, applyOutcome, feexConfig, getPayinStatus, isNetwork, json, mapStatus, normalizePhone, reasonOf, trace,
} from '../_shared/feexpay.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const cfg = feexConfig();
  if (!cfg.key || !cfg.shop) return json({ status: 'error', code: 'not_configured', error: 'Paiement Mobile Money non configuré' }, 503);

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!jwt) return json({ error: 'Unauthorized' }, 401);
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => null);
  const reference = String(body?.reference ?? '');
  const network = body?.network;
  const phone = normalizePhone(String(body?.phone ?? ''));
  if (!REF_RE.test(reference)) return json({ status: 'error', error: 'référence invalide' }, 400);
  if (!isNetwork(network)) return json({ status: 'error', error: 'opérateur invalide' }, 400);
  if (!phone) return json({ status: 'error', code: 'bad_phone', error: 'Numéro invalide : saisissez un numéro béninois (ex. 01 97 00 00 00).' }, 400);

  // La transaction doit exister, appartenir à l'appelant, être en attente et ne pas avoir été envoyée
  const { data: row } = await admin
    .from('wallet_transactions')
    .select('id, status, amount_fcfa, type, fedapay_transaction_id, wallets!inner(profile_id)')
    .eq('fedapay_reference', reference)
    .maybeSingle();
  if (!row || (row as any).wallets?.profile_id !== uid) return json({ status: 'error', error: 'Introuvable' }, 404);
  if (row.type !== 'topup' && row.type !== 'debt_settlement') return json({ status: 'error', error: 'Transaction non payable' }, 400);
  if (row.status !== 'pending') return json({ status: row.status === 'success' ? 'success' : 'failed' });
  if (row.fedapay_transaction_id) return json({ status: 'pending', already: true });

  const { data: claimed } = await admin.rpc('feexpay_claim_payin', { p_reference: reference });
  if (!claimed) return json({ status: 'pending', already: true });

  const amount = Number(row.amount_fcfa);
  const description = row.type === 'topup' ? 'Recharge TamCar Credit' : 'Reglement dette TamCar';
  await admin.rpc('feexpay_record_payin', { p_reference: reference, p_provider_ref: null, p_network: network, p_phone_last4: phone.slice(-4) });

  let res: Response;
  let resBody: any = null;
  try {
    res = await fetch(`${cfg.base}/api/transactions/public/requesttopay/${CHANNEL[network]}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ shop: cfg.shop, amount, phoneNumber: phone, description, callback_info: reference }),
      signal: AbortSignal.timeout(25000),
    });
    resBody = await res.json().catch(() => null);
  } catch (e) {
    // Réseau / délai dépassé : on ne sait pas si FeexPay a reçu la demande. La transaction reste en attente ; la vérification
    // (par callback_info) tranchera, sans jamais redemander un paiement au client.
    await trace('pay', { reference, amount_fcfa: amount, outcome: 'error', detail: `appel FeexPay impossible : ${String(e)}` });
    return json({ status: 'pending', uncertain: true });
  }

  // Refus immédiat (numéro invalide, clé refusée, montant hors limites…) : rien n'a été demandé au client
  if (res.status >= 400 && res.status < 500) {
    const reason = reasonOf(resBody) || `HTTP ${res.status}`;
    await admin.rpc('apply_fedapay_declined', { p_reference: reference, p_fedapay_transaction_id: null });
    await trace('pay', { reference, amount_fcfa: amount, outcome: 'declined', detail: `refus FeexPay HTTP ${res.status} : ${reason}` });
    const code = res.status === 401 ? 'not_configured' : 'refused';
    return json({ status: 'failed', code, reason });
  }
  if (!res.ok) {
    // 5xx : état incertain (en sandbox, le scénario « 02 » répond 503 avec une transaction FAILED) → la vérification tranchera
    await trace('pay', { reference, amount_fcfa: amount, outcome: 'error', detail: `FeexPay HTTP ${res.status}` });
    return json({ status: 'pending', uncertain: true });
  }

  const providerRef = String(resBody?.reference ?? '');
  await admin.rpc('feexpay_record_payin', { p_reference: reference, p_provider_ref: providerRef, p_network: network, p_phone_last4: phone.slice(-4) });
  const st = mapStatus(resBody?.status);
  await trace('pay', { reference, provider_tx_id: providerRef, amount_fcfa: amount, outcome: 'pending', detail: `demande envoyée (${network}, …${phone.slice(-4)}) : ${resBody?.status ?? '?'}` });

  if (st === 'pending' || !providerRef) return json({ status: 'pending' });

  // Réponse finale immédiate : on la confirme auprès de FeexPay avant de toucher au portefeuille
  try {
    const confirmed = await getPayinStatus(providerRef);
    const final = await applyOutcome('pay', reference, confirmed);
    return json(final === 'failed' ? { status: 'failed', reason: confirmed.reason || reasonOf(resBody) } : { status: final });
  } catch (e) {
    await trace('pay', { reference, provider_tx_id: providerRef, outcome: 'error', detail: String(e) });
    return json({ status: 'pending' });
  }
});
