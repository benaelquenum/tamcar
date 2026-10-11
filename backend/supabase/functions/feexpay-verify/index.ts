// FeexPay — confirmation DIRECTE d'un paiement, en secours du webhook.
//
// L'application l'appelle toutes les quelques secondes pendant que le client confirme sur son téléphone, avec la référence
// TamCar (FDP-…). La fonction interroge FeexPay avec la clé privée (le navigateur ne peut rien falsifier), puis applique le
// même crédit que le webhook (idempotent, montant vérifié par la base) ou marque l'échec.
//
// Garde-fous : jeton utilisateur obligatoire ; la référence doit appartenir à l'appelant.
// Réponse : { status: 'success' | 'failed' | 'pending', reason? }

// deno-lint-ignore-file no-explicit-any
import { CORS, REF_RE, admin, applyOutcome, feexConfig, getPayinStatus, json, trace } from '../_shared/feexpay.ts';

// Une transaction envoyée dont FeexPay n'a aucune trace (appel perdu) est abandonnée après ce délai
const LOST_AFTER_MS = 5 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const cfg = feexConfig();
  if (!cfg.key) return json({ error: 'FeexPay non configuré' }, 503);

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!jwt) return json({ error: 'Unauthorized' }, 401);
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => null);
  const reference = String(body?.reference ?? '');
  if (!REF_RE.test(reference)) return json({ error: 'référence invalide' }, 400);

  const { data: row } = await admin
    .from('wallet_transactions')
    .select('id, status, created_at, fedapay_transaction_id, wallets!inner(profile_id)')
    .eq('fedapay_reference', reference)
    .maybeSingle();
  if (!row || (row as any).wallets?.profile_id !== uid) return json({ error: 'Introuvable' }, 404);
  if (row.status === 'success') return json({ status: 'success' });
  if (row.status !== 'pending') return json({ status: 'failed' });

  try {
    const providerId = row.fedapay_transaction_id && row.fedapay_transaction_id !== 'SUBMITTING' ? row.fedapay_transaction_id : '';
    const st = providerId ? await getPayinStatus(providerId) : await getPayinStatus(reference, true);

    if (!st.found) {
      // FeexPay ne connaît pas la transaction : la demande ne lui est jamais parvenue. Après 5 minutes, on abandonne.
      const age = Date.now() - new Date(row.created_at as string).getTime();
      if (age > LOST_AFTER_MS) {
        await admin.rpc('apply_fedapay_declined', { p_reference: reference, p_fedapay_transaction_id: null });
        await trace('verify', { reference, outcome: 'declined', detail: 'transaction inconnue de FeexPay après 5 min' });
        return json({ status: 'failed', reason: 'La demande de paiement n\'est pas arrivée à l\'opérateur.' });
      }
      await trace('verify', { reference, outcome: 'pending', detail: 'transaction pas encore connue de FeexPay' });
      return json({ status: 'pending' });
    }
    const final = await applyOutcome('verify', reference, st);
    return json(final === 'failed' ? { status: 'failed', reason: st.reason } : { status: final });
  } catch (e) {
    await trace('verify', { reference, outcome: 'error', detail: String(e) });
    return json({ status: 'pending', error: 'vérification impossible' }, 502);
  }
});
