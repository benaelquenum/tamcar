// FedaPay verify — confirmation DIRECTE d'un paiement, en secours du webhook.
//
// L'application l'appelle après la fenêtre de paiement, avec la référence TamCar (« FDP-… ») d'une transaction
// « en attente » créée par initiate_fedapay_topup / initiate_fedapay_debt. La fonction interroge FedaPay avec la clé SECRÈTE
// (le navigateur ne peut donc rien falsifier), retrouve la transaction par sa custom_metadata.reference, puis applique le
// même crédit que le webhook (apply_fedapay_success, idempotent) ou marque l'échec (apply_fedapay_declined).
//
// Garde-fous : jeton utilisateur obligatoire ; la référence doit appartenir à l'appelant ; montant vérifié par apply_fedapay_success.
// Chaque appel laisse une ligne dans payment_events (source « verify »).
//
// Secrets : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), FEDAPAY_SECRET_KEY, FEDAPAY_API_URL (def. https://api.fedapay.com/v1)

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FEDA_KEY = Deno.env.get('FEDAPAY_SECRET_KEY')!;
const FEDA_URL = Deno.env.get('FEDAPAY_API_URL') ?? 'https://api.fedapay.com/v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const admin = createClient(SB_URL, SB_KEY);

async function trace(row: { reference?: string; provider_tx_id?: string; amount_fcfa?: number; outcome: string; detail?: string }) {
  try {
    await admin.from('payment_events').insert({ source: 'verify', ...row, detail: row.detail?.slice(0, 500) });
  } catch (e) {
    console.error('trace payment_events impossible:', e);
  }
}

async function fedaGet(path: string): Promise<any> {
  const res = await fetch(`${FEDA_URL}${path}`, { headers: { Authorization: `Bearer ${FEDA_KEY}`, Accept: 'application/json' } });
  if (!res.ok) {
    const txt = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    throw new Error(`FedaPay ${path} : HTTP ${res.status} ${txt}`);
  }
  return await res.json();
}

function refOf(t: any): string {
  return t?.custom_metadata?.reference ?? t?.metadata?.reference ?? '';
}

function unwrap(data: any): any {
  return data?.['v1/transaction'] ?? data?.transaction ?? data;
}

// La transaction FedaPay qui porte notre référence.
// 1. par identifiant (fourni par la fenêtre de paiement) : on vérifie que SA référence est bien la nôtre ;
// 2. à défaut, parmi les plus récentes de la liste (dernier recours : les paramètres de pagination de FedaPay ne sont pas documentés).
async function findTransaction(reference: string, id?: string): Promise<any | null> {
  if (id && /^\d+$/.test(id)) {
    const t = unwrap(await fedaGet(`/transactions/${id}`));
    return refOf(t) === reference ? t : null;
  }
  const data = await fedaGet('/transactions');
  const list: any[] = data['v1/transactions'] ?? data.transactions ?? [];
  return list.find((t) => refOf(t) === reference) ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!FEDA_KEY) return json({ error: 'FedaPay non configuré' }, 503);

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!jwt) return json({ error: 'Unauthorized' }, 401);
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => null);
  const reference = String(body?.reference ?? '');
  const fedaIdHint = body?.transaction_id != null ? String(body.transaction_id) : undefined;
  if (!/^FDP-[0-9a-f]{32}$/.test(reference)) return json({ error: 'référence invalide' }, 400);

  // La transaction doit exister et appartenir à l'appelant
  const { data: row } = await admin
    .from('wallet_transactions')
    .select('id, status, amount_fcfa, wallets!inner(profile_id)')
    .eq('fedapay_reference', reference)
    .maybeSingle();
  if (!row || (row as any).wallets?.profile_id !== uid) return json({ error: 'Introuvable' }, 404);
  if (row.status !== 'pending') return json({ status: row.status });

  try {
    const feda = await findTransaction(reference, fedaIdHint);
    if (!feda) {
      await trace({ reference, outcome: 'pending', detail: 'transaction FedaPay introuvable (pas encore créée ?)' });
      return json({ status: 'pending' });
    }
    const fedaId = String(feda.id ?? '');
    const amount = Number(feda.amount ?? 0);
    const st = String(feda.status ?? '');

    if (st === 'approved' || st === 'transferred') {
      const { error } = await admin.rpc('apply_fedapay_success', {
        p_reference: reference,
        p_fedapay_transaction_id: fedaId,
        p_amount_fcfa: amount,
      });
      if (error) {
        await trace({ reference, provider_tx_id: fedaId, amount_fcfa: amount, outcome: 'error', detail: error.message });
        return json({ status: 'pending', error: error.message }, 500);
      }
      await trace({ reference, provider_tx_id: fedaId, amount_fcfa: amount, outcome: 'applied', detail: `statut FedaPay : ${st}` });
      return json({ status: 'success' });
    }
    if (st === 'declined' || st === 'canceled' || st === 'refunded' || st === 'expired') {
      await admin.rpc('apply_fedapay_declined', { p_reference: reference, p_fedapay_transaction_id: fedaId });
      await trace({ reference, provider_tx_id: fedaId, amount_fcfa: amount, outcome: 'declined', detail: `statut FedaPay : ${st}` });
      return json({ status: 'failed' });
    }
    await trace({ reference, provider_tx_id: fedaId, amount_fcfa: amount, outcome: 'pending', detail: `statut FedaPay : ${st}` });
    return json({ status: 'pending' });
  } catch (e) {
    await trace({ reference, outcome: 'error', detail: String(e) });
    return json({ status: 'pending', error: 'vérification impossible' }, 502);
  }
});
