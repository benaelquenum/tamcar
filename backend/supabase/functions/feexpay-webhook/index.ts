// FeexPay webhook — reçoit le statut final d'un paiement (transaction.successful / transaction.failed).
//
// FeexPay envoie un POST JSON : { env, reference, status, amount, callback_info, type, phoneNumber, reseau, reason, … } à l'URL
// déclarée dans le tableau de bord (Webhooks de la boutique), avec un en-tête Authorization si un secret y a été configuré.
// Aucun webhook n'est envoyé tant que le paiement est PENDING. Réponse attendue : 2xx en moins de 15 s ; un 4xx n'est jamais renvoyé.
//
// Règle de sécurité : le contenu du webhook n'est JAMAIS cru. On ne s'en sert que pour savoir QUELLE transaction regarder ; le statut
// et le montant sont relus auprès de FeexPay avec la clé privée (getPayinStatus), puis appliqués par la base (idempotent).
//
// Secrets : voir _shared/feexpay.ts. FEEXPAY_WEBHOOK_SECRET (facultatif mais recommandé) : s'il est posé, l'en-tête Authorization
// doit le contenir (type Bearer ou Basic, le secret est comparé en temps constant).
// Chaque appel laisse une ligne dans payment_events (source « webhook »).

// deno-lint-ignore-file no-explicit-any
import {
  REF_RE, admin, applyOutcome, feexConfig, getPayinStatus, json, refFromCallback, secretFromAuthHeader, timingSafeEqual, trace,
} from '../_shared/feexpay.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const cfg = feexConfig();
  if (!cfg.key) {
    await trace('webhook', { outcome: 'error', detail: 'FEEXPAY_API_KEY absent' });
    return new Response('Webhook not configured', { status: 503 });
  }

  if (cfg.webhookSecret) {
    const given = secretFromAuthHeader(req.headers.get('authorization'));
    if (!given || !timingSafeEqual(given, cfg.webhookSecret)) {
      await trace('webhook', { outcome: 'bad_signature', detail: given ? 'secret du webhook invalide' : 'aucun en-tête Authorization' });
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const event: any = await req.json().catch(() => null);
  if (!event || typeof event !== 'object') {
    await trace('webhook', { outcome: 'error', detail: 'JSON invalide' });
    return new Response('Invalid JSON', { status: 400 });
  }

  const providerRef = String(event.reference ?? event.order_id ?? '');
  const amount = Number(event.amount ?? 0);
  const label = `${event.type ?? '?'} ${event.status ?? '?'} (${event.env ?? 'live'})`;

  // Un événement de test ne doit jamais créditer un portefeuille réel (ni l'inverse)
  const isSandboxEvent = String(event.env ?? '').toLowerCase() === 'sandbox';
  if ((cfg.mode === 'live') === isSandboxEvent) {
    await trace('webhook', { event: label, reference: refFromCallback(event.callback_info), provider_tx_id: providerRef, amount_fcfa: amount, outcome: 'ignored', detail: `environnement ${isSandboxEvent ? 'sandbox' : 'live'} reçu en mode ${cfg.mode}` });
    return json({ ok: true, ignored: 'env' });
  }

  // Retraits (payouts) : traités à la main pour l'instant (payouts_auto = 0)
  if (String(event.type ?? '').toLowerCase() === 'payout') {
    await trace('webhook', { event: label, provider_tx_id: providerRef, amount_fcfa: amount, outcome: 'ignored', detail: 'payout : traité à la main' });
    return json({ ok: true, ignored: 'payout' });
  }

  // Notre référence : renvoyée par FeexPay dans callback_info ; à défaut, retrouvée par l'identifiant FeexPay enregistré
  let reference = refFromCallback(event.callback_info);
  if (!reference && providerRef) {
    const { data } = await admin.from('wallet_transactions').select('fedapay_reference').eq('fedapay_transaction_id', providerRef).maybeSingle();
    reference = String((data as any)?.fedapay_reference ?? '');
  }
  if (!REF_RE.test(reference)) {
    await trace('webhook', { event: label, provider_tx_id: providerRef, amount_fcfa: amount, outcome: 'no_reference', detail: JSON.stringify({ callback_info: event.callback_info, description: event.description }).slice(0, 300) });
    return json({ ok: true, ignored: 'no_reference' });
  }

  try {
    const st = await getPayinStatus(providerRef || reference, !providerRef);
    if (!st.found) {
      await trace('webhook', { event: label, reference, provider_tx_id: providerRef, outcome: 'error', detail: 'transaction introuvable chez FeexPay' });
      return new Response('Unknown transaction', { status: 500 }); // 5xx : FeexPay retente une fois
    }
    await applyOutcome('webhook', reference, st, label);
  } catch (e) {
    await trace('webhook', { event: label, reference, provider_tx_id: providerRef, outcome: 'error', detail: String(e) });
    return new Response('Handler error', { status: 500 });
  }
  return json({ ok: true });
});
