// Supabase Edge Function : send-push
// Reçoit { profile_id, title, body, url?, tag?, requireInteraction? } et pousse
// à toutes les PushSubscriptions du profile via Web Push Protocol (VAPID).
//
// Secrets requis :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT (mailto:...)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import webpush from 'npm:web-push@3.6.7';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUB = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIV = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_CONTACT = Deno.env.get('VAPID_CONTACT') || 'mailto:contact@tamcar.app';

webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUB, VAPID_PRIV);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { profile_id, title, body: text, url, tag, requireInteraction } = body ?? {};
  if (!profile_id || !title) {
    return new Response('profile_id and title required', { status: 400 });
  }

  const admin = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', profile_id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = JSON.stringify({
    title,
    body: text ?? '',
    url: url ?? '/',
    tag,
    requireInteraction: Boolean(requireInteraction),
  });

  const results = await Promise.all((subs ?? []).map(async (s: any) => {
    try {
      await webpush.sendNotification({
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      }, payload);
      return { id: s.id, ok: true };
    } catch (e: any) {
      const status = e?.statusCode ?? null;
      const gone = status === 404 || status === 410;
      if (gone) {
        await admin.from('push_subscriptions').delete().eq('id', s.id);
      }
      return { id: s.id, ok: false, statusCode: status, gone, message: e?.message ?? String(e) };
    }
  }));

  return new Response(JSON.stringify({ sent: results.length, results }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
