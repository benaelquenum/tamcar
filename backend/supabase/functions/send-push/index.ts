// Supabase Edge Function : send-push (v2 — Web Push + FCM natif)
// Reçoit { profile_id, title, body, url?, tag?, requireInteraction? } et pousse :
//   1. Web Push (VAPID) vers les PushSubscriptions navigateur/PWA du profile.
//   2. FCM v1 vers les tokens natifs (APK Capacitor) — fonctionne même app
//      tuée. Ignoré silencieusement tant que FCM_SERVICE_ACCOUNT n'est pas
//      configuré.
//
// Secrets requis :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT (mailto:...)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   FCM_SERVICE_ACCOUNT (JSON complet du service account Firebase — optionnel)

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import webpush from 'npm:web-push@3.6.7';
import { SignJWT, importPKCS8 } from 'npm:jose@5.9.6';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUB = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIV = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_CONTACT = Deno.env.get('VAPID_CONTACT') || 'mailto:contact@tamcar.app';
const FCM_SA_RAW = Deno.env.get('FCM_SERVICE_ACCOUNT') || '';

webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUB, VAPID_PRIV);

// --- FCM v1 : access token OAuth2 depuis le service account, mis en cache ---
let fcmTokenCache: { token: string; expiresAt: number } | null = null;

function fcmServiceAccount(): { project_id: string; client_email: string; private_key: string } | null {
  if (!FCM_SA_RAW) return null;
  try {
    return JSON.parse(FCM_SA_RAW);
  } catch {
    return null;
  }
}

async function fcmAccessToken(sa: { client_email: string; private_key: string }): Promise<string | null> {
  if (fcmTokenCache && fcmTokenCache.expiresAt > Date.now() + 60_000) {
    return fcmTokenCache.token;
  }
  try {
    const key = await importPKCS8(sa.private_key, 'RS256');
    const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(sa.client_email)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    const j = await res.json();
    if (!j.access_token) return null;
    fcmTokenCache = { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return j.access_token;
  } catch {
    return null;
  }
}

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

  // ---------- Canal 1 : Web Push (navigateur / PWA) ----------
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

  const webResults = await Promise.all((subs ?? []).map(async (s: any) => {
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

  // ---------- Canal 2 : FCM (APK natif) ----------
  let fcmResults: any[] = [];
  const sa = fcmServiceAccount();
  if (sa) {
    const { data: tokens } = await admin
      .from('native_push_tokens')
      .select('token')
      .eq('profile_id', profile_id);

    if (tokens && tokens.length > 0) {
      const access = await fcmAccessToken(sa);
      if (access) {
        fcmResults = await Promise.all(tokens.map(async (t: any) => {
          try {
            const res = await fetch(
              `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${access}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  message: {
                    token: t.token,
                    notification: { title, body: text ?? '' },
                    data: { url: url ?? '/', tag: tag ?? '' },
                    android: {
                      priority: 'HIGH',
                      notification: { sound: 'default' },
                    },
                  },
                }),
              },
            );
            if (res.ok) return { token: t.token.slice(0, 12), ok: true };
            const err = await res.json().catch(() => null);
            const code = err?.error?.details?.[0]?.errorCode ?? err?.error?.status ?? res.status;
            // Token mort (app désinstallée / token régénéré) → purge
            if (code === 'UNREGISTERED' || code === 'NOT_FOUND' || res.status === 404) {
              await admin.from('native_push_tokens').delete().eq('token', t.token);
            }
            return { token: t.token.slice(0, 12), ok: false, code };
          } catch (e: any) {
            return { token: t.token.slice(0, 12), ok: false, message: e?.message ?? String(e) };
          }
        }));
      }
    }
  }

  return new Response(
    JSON.stringify({
      web: { sent: webResults.length, results: webResults },
      fcm: { sent: fcmResults.length, results: fcmResults, configured: Boolean(sa) },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
