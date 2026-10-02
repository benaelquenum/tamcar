import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

// Serveurs ICE (STUN + TURN) pour l'appel audio. Réservé aux comptes connectés ;
// les identifiants du relais restent côté serveur.
//
// Configuration (variables d'environnement Vercel), au choix :
//   1. Cloudflare Realtime TURN : CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN
//      (identifiants temporaires générés à chaque demande) ;
//   2. Metered : METERED_APP (nom de l'application) + METERED_API_KEY ;
//   3. un TURN à vous (coturn, Twilio…) : TURN_URLS (liste séparée par des virgules),
//      TURN_USERNAME, TURN_CREDENTIAL.
// Sans configuration : `configured: false` — le navigateur retombe sur un relais
// public de dépannage.

export const dynamic = 'force-dynamic';

type Body = { iceServers: unknown[]; configured: boolean; source: string };

const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] };
let cache: { at: number; body: Body } | null = null;

async function build(): Promise<Body> {
  const cfId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const cfToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (cfId && cfToken) {
    // Deux points d'accès existent : le récent (generate-ice-servers) puis l'ancien (generate).
    for (const path of ['generate-ice-servers', 'generate']) {
      try {
        const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${cfId}/credentials/${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl: 86_400 }),
        });
        if (!r.ok) continue;
        const j = (await r.json()) as { iceServers?: unknown };
        const list = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
        if (list.length) return { iceServers: [STUN, ...list], configured: true, source: 'cloudflare' };
      } catch {
        /* on essaie le point d'accès suivant, puis la source suivante */
      }
    }
  }

  const mApp = process.env.METERED_APP;
  const mKey = process.env.METERED_API_KEY;
  if (mApp && mKey) {
    try {
      const r = await fetch(`https://${mApp}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(mKey)}`);
      if (r.ok) {
        const list = (await r.json()) as unknown;
        if (Array.isArray(list) && list.length) return { iceServers: [STUN, ...list], configured: true, source: 'metered' };
      }
    } catch {
      /* on essaie la source suivante */
    }
  }

  const urls = (process.env.TURN_URLS ?? '').split(',').map((u) => u.trim()).filter(Boolean);
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_CREDENTIAL;
  if (urls.length && username && credential) {
    return { iceServers: [STUN, { urls, username, credential }], configured: true, source: 'static' };
  }

  return { iceServers: [STUN], configured: false, source: 'none' };
}

export async function GET() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });

  if (!cache || Date.now() - cache.at > 5 * 60_000) {
    cache = { at: Date.now(), body: await build() };
  }
  return NextResponse.json(cache.body, { headers: { 'Cache-Control': 'no-store' } });
}
