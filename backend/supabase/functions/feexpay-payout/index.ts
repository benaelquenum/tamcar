// FeexPay — retrait d'un chauffeur vers son Mobile Money (payout). ARGENT RÉEL.
//
// Appelée par TamCar Pro juste après request_driver_payout (le montant est déjà réservé sur le portefeuille Revenus), ou par l'équipe
// depuis /admin/retraits (« Envoyer par FeexPay », « Vérifier »). Corps : { payout_id, force?, check? }.
//
// Garde-fous (rien n'est jamais payé deux fois, rien n'est remboursé à tort) :
//   1. Le virement automatique ne part que si le réglage payouts_auto vaut 1, ou sur clic de l'équipe (force). Sinon : « manual ».
//   2. feexpay_payout_prepare verrouille la ligne et la passe de « pending » à « processing » en UNE opération : si deux appels
//      arrivent ensemble, un seul envoie. Elle applique aussi les règles de validation (montant, plafond du jour, nouveau numéro) :
//      un retrait qui n'y répond pas reste « pending » avec un motif (« hold ») et attend l'équipe.
//   3. Aucune nouvelle tentative automatique de l'envoi. Refus définitif de FeexPay (4xx : clé, droits, liste d'IP, solde, numéro) →
//      le retrait revient « en attente » avec le motif ; réponse ambiguë (délai, 5xx) → il reste « processing » et l'équipe est
//      prévenue par la vérification planifiée : on ne rembourse pas, on ne renvoie pas.
//   4. Le statut final (SUCCESSFUL / FAILED) est TOUJOURS relu auprès de FeexPay avec la clé privée (obligatoire d'après leur
//      documentation) ; SUCCESSFUL → débit définitif, FAILED → recrédit du chauffeur, par la base (idempotent).
//
// Secrets : voir _shared/feexpay.ts. Réponse : { status: 'manual' | 'hold' | 'processing' | 'paid' | 'failed', reason? }.

// deno-lint-ignore-file no-explicit-any
import {
  CORS, admin, buildPayoutBody, callerOf, feexConfig, getPayoutStatus, json, normalizePhone, payoutNetwork, sendPayout, sleep, trace,
} from '../_shared/feexpay.ts';

const FINAL_TO_API: Record<string, string> = { paid: 'paid', failed: 'failed', processing: 'processing', pending: 'processing' };

async function settle(payoutId: string, ref: string, who: string): Promise<{ status: string; reason?: string }> {
  const st = await getPayoutStatus(ref);
  if (st.status === 'success') {
    await admin.rpc('feexpay_payout_finalize', { p_payout_id: payoutId, p_status: 'success', p_ref: ref, p_reason: null });
    await trace('payout', { event: who, reference: payoutId, provider_tx_id: ref, amount_fcfa: st.amount, outcome: 'paid' });
    return { status: 'paid' };
  }
  if (st.status === 'failed') {
    const reason = st.reason || 'Refusé par l\'opérateur';
    await admin.rpc('feexpay_payout_finalize', { p_payout_id: payoutId, p_status: 'failed', p_ref: ref, p_reason: reason });
    await trace('payout', { event: who, reference: payoutId, provider_tx_id: ref, amount_fcfa: st.amount, outcome: 'failed', detail: reason });
    return { status: 'failed', reason };
  }
  return { status: 'processing' };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const caller = await callerOf(req);
  if (!caller) return json({ error: 'Unauthorized' }, 401);

  const body: any = await req.json().catch(() => null);
  const payoutId = String(body?.payout_id ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payoutId)) return json({ error: 'payout_id invalide' }, 400);
  const force = body?.force === true;
  const check = body?.check === true;
  if (force && !caller.isAdmin) return json({ error: 'Réservé à l\'équipe TamCar' }, 403);

  const { data: payout } = await admin
    .from('driver_payouts')
    .select('id, profile_id, amount_fcfa, provider, msisdn, status, fedapay_payout_id')
    .eq('id', payoutId)
    .maybeSingle();
  if (!payout || (!caller.isAdmin && payout.profile_id !== caller.uid)) return json({ error: 'Introuvable' }, 404);

  const cfg = feexConfig();
  const who = caller.isAdmin ? 'admin' : 'chauffeur';

  // Relecture du statut d'un retrait déjà parti (bouton « Vérifier » ou ouverture de l'écran)
  if (check || payout.status !== 'pending') {
    if (payout.status === 'processing' && payout.fedapay_payout_id && cfg.key) {
      try {
        return json(await settle(payoutId, payout.fedapay_payout_id, `${who}:verifier`));
      } catch (e) {
        await trace('payout', { event: `${who}:verifier`, reference: payoutId, outcome: 'error', detail: String(e) });
        return json({ status: 'processing' });
      }
    }
    return json({ status: FINAL_TO_API[payout.status] ?? payout.status });
  }

  // Retrait en attente : envoi automatique seulement si le réglage l'autorise (ou sur clic de l'équipe)
  const { data: rule } = await admin.from('program_rules').select('value').eq('key', 'payouts_auto').maybeSingle();
  const autoOn = (rule as { value?: number } | null)?.value === 1;
  if (!cfg.key || !cfg.shop || (!autoOn && !force)) return json({ status: 'manual' });

  const { data: prep, error: prepErr } = await admin.rpc('feexpay_payout_prepare', { p_payout_id: payoutId, p_force: force });
  if (prepErr || !prep) {
    await trace('payout', { event: who, reference: payoutId, outcome: 'error', detail: `prepare : ${prepErr?.message ?? 'réponse vide'}` });
    return json({ status: 'manual' });
  }
  if (prep.action === 'hold') {
    await trace('payout', { event: who, reference: payoutId, amount_fcfa: payout.amount_fcfa, outcome: 'hold', detail: prep.reason });
    return json({ status: 'hold', reason: prep.reason });
  }
  if (prep.action !== 'send') return json({ status: FINAL_TO_API[prep.status] ?? prep.status });

  // --- ENVOI (ce point n'est atteint que par UN appel : la ligne est maintenant « processing ») ---
  const phone = normalizePhone(String(prep.msisdn ?? ''));
  const network = payoutNetwork(prep.provider);
  if (!phone || !network) {
    await admin.rpc('feexpay_payout_release', { p_payout_id: payoutId, p_error: !phone ? 'numéro Mobile Money invalide' : 'opérateur non géré (MTN et Moov seulement)' });
    await trace('payout', { event: who, reference: payoutId, amount_fcfa: prep.amount, outcome: 'hold', detail: 'numéro ou opérateur non géré' });
    return json({ status: 'hold' });
  }

  const sent = await sendPayout(buildPayoutBody({ phone, amount: Number(prep.amount), shop: cfg.shop, network, payoutId }));
  if (sent.kind === 'refused') {
    await admin.rpc('feexpay_payout_release', { p_payout_id: payoutId, p_error: sent.message });
    await trace('payout', { event: who, reference: payoutId, amount_fcfa: prep.amount, outcome: 'refused', detail: sent.message });
    return json({ status: 'hold' });
  }
  if (sent.kind === 'unknown') {
    await trace('payout', { event: who, reference: payoutId, amount_fcfa: prep.amount, outcome: 'unknown', detail: sent.message });
    return json({ status: 'processing' }); // la vérification planifiée prévient l'équipe ; jamais de renvoi automatique
  }

  await admin.rpc('feexpay_payout_set_ref', { p_payout_id: payoutId, p_ref: sent.ref });
  await trace('payout', { event: who, reference: payoutId, provider_tx_id: sent.ref, amount_fcfa: prep.amount, outcome: 'sent' });

  // MTN et Moov répondent en quelques secondes : on relit le statut tout de suite (jusqu'à ~8 s), le reste revient à la vérification planifiée
  try {
    for (let i = 0; i < 4; i++) {
      await sleep(i === 0 ? 1500 : 2200);
      const r = await settle(payoutId, sent.ref, who);
      if (r.status !== 'processing') return json(r);
    }
  } catch (e) {
    await trace('payout', { event: who, reference: payoutId, provider_tx_id: sent.ref, outcome: 'error', detail: `relecture : ${String(e)}` });
  }
  return json({ status: 'processing' });
});
