// FedaPay webhook — reçoit les events de transaction et synchronise
// wallet_transactions + wallets via RPC.
//
// Secrets attendus :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto par Supabase)
//   FEDAPAY_WEBHOOK_SECRET
//
// Chaque appel laisse une ligne dans payment_events (source « webhook ») : signature invalide, événement ignoré, crédit
// appliqué, erreur... Documentation : https://docs.fedapay.com/webhooks

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('FEDAPAY_WEBHOOK_SECRET')!;

const enc = new TextEncoder();
const supabase = createClient(SB_URL, SB_KEY);

async function trace(row: {
  event?: string; reference?: string; provider_tx_id?: string; amount_fcfa?: number; outcome: string; detail?: string;
}) {
  try {
    await supabase.from('payment_events').insert({ source: 'webhook', ...row, detail: row.detail?.slice(0, 500) });
  } catch (e) {
    console.error('trace payment_events impossible:', e);
  }
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!WEBHOOK_SECRET) {
    console.error('FEDAPAY_WEBHOOK_SECRET absent : webhook refusé (sans secret, la signature serait forgeable).');
    await trace({ outcome: 'error', detail: 'FEDAPAY_WEBHOOK_SECRET absent' });
    return new Response('Webhook not configured', { status: 503 });
  }

  const body = await req.text();
  const signature =
    req.headers.get('x-fedapay-signature') ||
    req.headers.get('fedapay-signature') ||
    '';

  // Signature FedaPay = t=<timestamp>,s=<hmac_sha256(timestamp + '.' + body, webhook_secret)>
  // Format alternatif : simple HMAC-SHA256(body, secret)
  let valid = false;
  if (signature.includes('t=') && signature.includes('s=')) {
    const parts = Object.fromEntries(
      signature.split(',').map((p) => p.split('=').map((s) => s.trim())),
    );
    const t = parts.t;
    const s = parts.s;
    if (t && s) {
      const expected = await hmacSha256Hex(WEBHOOK_SECRET, `${t}.${body}`);
      valid = timingSafeEqual(expected, s);
    }
  } else if (signature) {
    const expected = await hmacSha256Hex(WEBHOOK_SECRET, body);
    valid = timingSafeEqual(expected, signature);
  }

  if (!valid) {
    console.error('Bad signature. Got:', signature);
    await trace({ outcome: 'bad_signature', detail: signature ? 'signature présente mais invalide' : 'aucune signature' });
    return new Response('Bad signature', { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    await trace({ outcome: 'error', detail: 'JSON invalide' });
    return new Response('Invalid JSON', { status: 400 });
  }

  const eventName: string = event?.name ?? event?.event ?? '';
  const tx = event?.entity ?? event?.data ?? event?.transaction ?? event;
  // La reference qu'on a envoyée via custom_metadata au widget FedaPay.
  // FedaPay a aussi sa propre `tx.reference` (trx_xxx) qui ne matche pas
  // la nôtre — c'est notre custom_metadata.reference qu'on veut.
  const reference: string =
    tx?.custom_metadata?.reference ??
    tx?.metadata?.reference ??
    tx?.customMetadata?.reference ??
    String(tx?.description ?? '').match(/FDP-[0-9a-f]{32}/)?.[0] ??
    '';
  const fedaId: string = String(tx?.id ?? tx?.transaction_id ?? '');
  const amount: number = Number(tx?.amount ?? 0);

  if (!reference) {
    console.error('No reference in event', eventName, 'keys:', Object.keys(tx ?? {}));
    console.error('Full tx:', JSON.stringify(tx));
    await trace({ event: eventName, provider_tx_id: fedaId, amount_fcfa: amount, outcome: 'no_reference', detail: JSON.stringify({ metadata: tx?.metadata, custom_metadata: tx?.custom_metadata, description: tx?.description, reference: tx?.reference }) });
    return new Response('No reference', { status: 200 });
  }

  try {
    if (eventName === 'transaction.approved') {
      const { error } = await supabase.rpc('apply_fedapay_success', {
        p_reference: reference,
        p_fedapay_transaction_id: fedaId,
        p_amount_fcfa: amount,
      });
      if (error) {
        console.error('apply_fedapay_success error:', error.message);
        await trace({ event: eventName, reference, provider_tx_id: fedaId, amount_fcfa: amount, outcome: 'error', detail: error.message });
        return new Response('DB error: ' + error.message, { status: 500 });
      }
      await trace({ event: eventName, reference, provider_tx_id: fedaId, amount_fcfa: amount, outcome: 'applied' });
    } else if (
      eventName === 'transaction.declined' ||
      eventName === 'transaction.canceled' ||
      eventName === 'transaction.refunded'
    ) {
      const { error } = await supabase.rpc('apply_fedapay_declined', {
        p_reference: reference,
        p_fedapay_transaction_id: fedaId,
      });
      if (error) {
        console.error('apply_fedapay_declined error:', error.message);
        await trace({ event: eventName, reference, provider_tx_id: fedaId, amount_fcfa: amount, outcome: 'error', detail: error.message });
        return new Response('DB error: ' + error.message, { status: 500 });
      }
      await trace({ event: eventName, reference, provider_tx_id: fedaId, amount_fcfa: amount, outcome: 'declined' });
    } else if (eventName === 'payout.sent' || eventName === 'payout.succeeded') {
      // Décaissement chauffeur réussi → débit définitif du wallet.
      const { data } = await supabase
        .from('driver_payouts')
        .select('id')
        .eq('fedapay_payout_id', fedaId)
        .maybeSingle();
      if (data?.id) {
        await supabase.rpc('confirm_driver_payout', {
          p_payout_id: data.id,
          p_fedapay_payout_id: fedaId,
        });
      }
      await trace({ event: eventName, reference, provider_tx_id: fedaId, outcome: 'applied', detail: data?.id ? 'payout confirmé' : 'payout inconnu' });
    } else if (eventName === 'payout.failed' || eventName === 'payout.canceled') {
      // Décaissement échoué → remboursement du wallet chauffeur.
      const { data } = await supabase
        .from('driver_payouts')
        .select('id')
        .eq('fedapay_payout_id', fedaId)
        .maybeSingle();
      if (data?.id) {
        await supabase.rpc('fail_driver_payout', {
          p_payout_id: data.id,
          p_reason: 'Décaissement FedaPay échoué',
        });
      }
      await trace({ event: eventName, reference, provider_tx_id: fedaId, outcome: 'declined', detail: data?.id ? 'payout remboursé' : 'payout inconnu' });
    } else {
      console.log('Event ignored:', eventName);
      await trace({ event: eventName, reference, provider_tx_id: fedaId, amount_fcfa: amount, outcome: 'ignored' });
    }
  } catch (e) {
    console.error('Handler exception:', e);
    await trace({ event: eventName, reference, provider_tx_id: fedaId, outcome: 'error', detail: String(e) });
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
