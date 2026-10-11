// FeexPay — vérification planifiée des retraits en cours (appelée toutes les 2 minutes par pg_cron via _run_payout_check).
//
// Pour chaque retrait « processing » : relit le statut chez FeexPay et le règle (SUCCESSFUL → payé, FAILED → chauffeur recrédité).
// Un retrait parti depuis plus de 30 min sans réponse définitive, ou sans identifiant FeexPay depuis plus de 10 min (appel sans
// réponse : le virement est peut-être parti), est signalé à l'équipe, JAMAIS remboursé ni renvoyé automatiquement.
//
// Protégée par le jeton de service (vérifié ici en plus de la passerelle) : jamais appelable par un utilisateur.

// deno-lint-ignore-file no-explicit-any
import { admin, feexConfig, getPayoutStatus, json, trace } from '../_shared/feexpay.ts';

function roleOf(req: Request): string {
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return String(payload?.role ?? '');
  } catch {
    return '';
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (roleOf(req) !== 'service_role') return json({ error: 'Unauthorized' }, 401);
  const cfg = feexConfig();
  if (!cfg.key) return json({ ok: true, skipped: 'FEEXPAY_API_KEY absent' });

  const { data: rows, error } = await admin.rpc('feexpay_payouts_to_check');
  if (error) {
    await trace('payout', { event: 'verification', outcome: 'error', detail: error.message });
    return json({ error: error.message }, 500);
  }

  const out = { checked: 0, paid: 0, failed: 0, pending: 0, flagged: 0 };
  for (const r of (rows ?? []) as { id: string; ref: string | null; age_s: number }[]) {
    out.checked++;
    try {
      if (!r.ref) {
        if (r.age_s > 600) {
          await admin.rpc('feexpay_payout_hold', { p_payout_id: r.id, p_reason: 'Envoi incertain : FeexPay n\'a pas répondu. Vérifier dans le tableau de bord FeexPay (Payout) avant de payer à la main ou de refuser.' });
          out.flagged++;
        }
        continue;
      }
      const st = await getPayoutStatus(r.ref);
      if (st.status === 'success') {
        await admin.rpc('feexpay_payout_finalize', { p_payout_id: r.id, p_status: 'success', p_ref: r.ref, p_reason: null });
        await trace('payout', { event: 'verification', reference: r.id, provider_tx_id: r.ref, amount_fcfa: st.amount, outcome: 'paid' });
        out.paid++;
      } else if (st.status === 'failed') {
        const reason = st.reason || 'Refusé par l\'opérateur';
        await admin.rpc('feexpay_payout_finalize', { p_payout_id: r.id, p_status: 'failed', p_ref: r.ref, p_reason: reason });
        await trace('payout', { event: 'verification', reference: r.id, provider_tx_id: r.ref, amount_fcfa: st.amount, outcome: 'failed', detail: reason });
        out.failed++;
      } else {
        out.pending++;
        if (r.age_s > 1800) {
          await admin.rpc('feexpay_payout_hold', { p_payout_id: r.id, p_reason: 'FeexPay n\'a pas confirmé ce virement après 30 minutes : le vérifier dans le tableau de bord FeexPay.' });
          out.flagged++;
        }
      }
    } catch (e) {
      await trace('payout', { event: 'verification', reference: r.id, provider_tx_id: r.ref ?? undefined, outcome: 'error', detail: String(e) });
    }
  }
  return json({ ok: true, ...out });
});
