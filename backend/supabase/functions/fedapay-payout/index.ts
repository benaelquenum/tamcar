// FedaPay Payout — déclenche un décaissement réel vers le Mobile Money du
// chauffeur, à partir d'une ligne driver_payouts déjà créée (status 'pending')
// par request_driver_payout (wallet déjà débité/réservé).
//
// Flux : create payout (POST /v1/payouts) → start (PUT /v1/payouts/start) →
// mark_payout_processing. Le résultat final (sent/failed) arrive par webhook
// (voir fedapay-webhook) qui appelle confirm_driver_payout / fail_driver_payout.
//
// Secrets : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto),
//           FEDAPAY_SECRET_KEY, FEDAPAY_API_URL (def. https://api.fedapay.com/v1)
//
// ⚠️ ARGENT RÉEL — tester d'abord avec de petits montants en sandbox.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FEDA_KEY = Deno.env.get('FEDAPAY_SECRET_KEY')!;
const FEDA_URL = Deno.env.get('FEDAPAY_API_URL') ?? 'https://api.fedapay.com/v1';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => null);
  const payoutId = body?.payout_id;
  if (!payoutId) return json({ error: 'payout_id requis' }, 400);

  const admin = createClient(SB_URL, SB_KEY);

  // Vérifie l'utilisateur appelant
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: 'Unauthorized' }, 401);

  // Charge le payout (doit appartenir à l'appelant + être 'pending')
  const { data: payout } = await admin
    .from('driver_payouts')
    .select('id, profile_id, amount_fcfa, provider, msisdn, status')
    .eq('id', payoutId)
    .single();
  if (!payout || payout.profile_id !== uid) return json({ error: 'Introuvable' }, 404);
  if (payout.status !== 'pending') return json({ status: payout.status });

  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', uid).single();
  const fullName = (profile?.full_name ?? 'Chauffeur').trim();
  const parts = fullName.split(/\s+/);
  const firstname = parts[0] || 'Chauffeur';
  const lastname = parts.slice(1).join(' ') || 'TamCar';

  const mode = payout.provider === 'moov' ? 'moov' : 'mtn_open';
  const number = String(payout.msisdn).replace(/\D/g, '');

  try {
    // 1) Créer le payout
    const createRes = await fetch(`${FEDA_URL}/payouts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${FEDA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: payout.amount_fcfa,
        currency: { iso: 'XOF' },
        mode,
        customer: { firstname, lastname, phone_number: { number, country: 'BJ' } },
      }),
    });
    const created: any = await createRes.json().catch(() => ({}));
    const fedaId = created?.['v1/payout']?.id ?? created?.payout?.id ?? created?.id;
    if (!createRes.ok || !fedaId) {
      await admin.rpc('fail_driver_payout', {
        p_payout_id: payout.id,
        p_reason: 'Création payout FedaPay refusée',
      });
      return json({ status: 'failed', detail: created }, 200);
    }

    // 2) Démarrer le payout (envoi immédiat)
    const startRes = await fetch(`${FEDA_URL}/payouts/start`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${FEDA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payouts: [{ id: fedaId }] }),
    });
    if (!startRes.ok) {
      await admin.rpc('fail_driver_payout', {
        p_payout_id: payout.id,
        p_reason: 'Démarrage payout FedaPay échoué',
      });
      return json({ status: 'failed' }, 200);
    }

    // 3) Marque 'processing' — statut final via webhook
    await admin.rpc('mark_payout_processing', {
      p_payout_id: payout.id,
      p_fedapay_payout_id: String(fedaId),
    });
    return json({ status: 'processing', fedapay_payout_id: String(fedaId) });
  } catch (e) {
    console.error('payout error', e);
    await admin.rpc('fail_driver_payout', {
      p_payout_id: payout.id,
      p_reason: 'Erreur technique lors du décaissement',
    });
    return json({ status: 'failed' }, 500);
  }
});
