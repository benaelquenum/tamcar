// FedaPay webhook — reçoit les events de transaction et synchronise
// wallet_transactions + wallets via RPC.
//
// Secrets attendus :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto par Supabase)
//   FEDAPAY_WEBHOOK_SECRET
//
// Documentation : https://docs.fedapay.com/webhooks

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('FEDAPAY_WEBHOOK_SECRET')!;

const enc = new TextEncoder();

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
    return new Response('Bad signature', { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const eventName: string = event?.name ?? event?.event ?? '';
  const tx = event?.entity ?? event?.data ?? event?.transaction ?? event;
  const reference: string = tx?.reference ?? tx?.metadata?.reference ?? '';
  const fedaId: string = String(tx?.id ?? tx?.transaction_id ?? '');
  const amount: number = Number(tx?.amount ?? 0);

  if (!reference) {
    console.error('No reference in event', eventName, tx);
    return new Response('No reference', { status: 200 });
  }

  const supabase = createClient(SB_URL, SB_KEY);

  try {
    if (eventName === 'transaction.approved') {
      const { error } = await supabase.rpc('apply_fedapay_success', {
        p_reference: reference,
        p_fedapay_transaction_id: fedaId,
        p_amount_fcfa: amount,
      });
      if (error) {
        console.error('apply_fedapay_success error:', error.message);
        return new Response('DB error: ' + error.message, { status: 500 });
      }
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
        return new Response('DB error: ' + error.message, { status: 500 });
      }
    } else {
      console.log('Event ignored:', eventName);
    }
  } catch (e) {
    console.error('Handler exception:', e);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
