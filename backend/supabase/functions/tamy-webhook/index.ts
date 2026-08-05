// Supabase Edge Function : tamy-webhook
// Tamy — le bot WhatsApp de commande de course TamCar.
//
// Parcours complet, 100 % WhatsApp, sans installer d'application :
//   accueil → CGU (« J'ACCEPTE ») → départ (position partagée ou texte
//   géocodé via la table places) → destination → grille de prix par
//   catégorie → confirmation → création de la course (RPC wa_create_ride,
//   qui réutilise create_ride) → suivi (chauffeur trouvé, arrivé, ...).
//
// Paiement : espèces par défaut.
//
// Endpoints :
//   GET  ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
//        → vérification du webhook Meta.
//   POST → réception des messages. La signature X-Hub-Signature-256
//        (HMAC SHA-256 du corps brut avec le secret de l'app Meta) est
//        VÉRIFIÉE avant tout traitement : un webhook non signé est rejeté.
//
// Secrets requis :
//   WHATSAPP_TOKEN            jeton d'accès permanent (System User)
//   WHATSAPP_PHONE_NUMBER_ID  identifiant du numéro expéditeur
//   WHATSAPP_VERIFY_TOKEN     chaîne libre, recopiée dans la console Meta
//   WHATSAPP_APP_SECRET       « App secret » de l'application Meta
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (injectés par la plateforme)
//
// Secrets optionnels :
//   MAPBOX_TOKEN              distance/durée routières réelles (sinon
//                             estimation à vol d'oiseau × 1,35)
//   WHATSAPP_GRAPH_VERSION    défaut v21.0
//   TAMY_TERMS_VERSION        défaut 2026-07-22 (doit suivre lib/terms.ts)
//   TAMY_SITE_URL             base des liens CGU, défaut https://tamcar.app
//   TAMY_DRY_RUN=1            mode test local : n'appelle pas l'API Meta,
//                             renvoie les réponses dans le corps HTTP et
//                             tolère l'absence de signature. NE JAMAIS
//                             poser ce secret en production.
//
// Déploiement : la vérification JWT doit être désactivée (Meta n'envoie
// pas de JWT) → supabase functions deploy tamy-webhook --no-verify-jwt

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
const WA_VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const WA_APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';
const GRAPH_VERSION = Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v21.0';
const MAPBOX_TOKEN = Deno.env.get('MAPBOX_TOKEN') ?? '';
const TERMS_VERSION = Deno.env.get('TAMY_TERMS_VERSION') || '2026-07-22';
const SITE_URL = (Deno.env.get('TAMY_SITE_URL') || 'https://tamcar.app').replace(/\/$/, '');
const DRY_RUN = Deno.env.get('TAMY_DRY_RUN') === '1';

const SESSION_TTL_MIN = 30;
const MAX_CANDIDATES = 5;

// Centre de repli pour la recherche de lieux (place de l'Étoile Rouge,
// Cotonou) quand on n'a encore aucune position du client.
const DEFAULT_PROXIMITY = { lng: 2.4183, lat: 6.3708 };

const CATEGORY_LABELS: Record<string, string> = {
  moto: 'Moto',
  tricycle: 'Tricycle',
  essentiel: 'Essentiel',
  confort: 'Confort',
  premium: 'VIP',
};

const CATEGORY_HINTS: Record<string, string> = {
  moto: '2 places',
  tricycle: '3 places',
  essentiel: '4 places',
  confort: '4 places, plus confortable',
  premium: '4 places, prestige',
};

// ------------------------------------------------------------
// Secrets : échec propre et explicite si la configuration manque
// ------------------------------------------------------------
function missingSecrets(needSending: boolean): string[] {
  const missing: string[] = [];
  if (!SB_URL) missing.push('SUPABASE_URL');
  if (!SB_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!WA_VERIFY_TOKEN) missing.push('WHATSAPP_VERIFY_TOKEN');
  if (!DRY_RUN && !WA_APP_SECRET) missing.push('WHATSAPP_APP_SECRET');
  if (needSending && !DRY_RUN) {
    if (!WA_TOKEN) missing.push('WHATSAPP_TOKEN');
    if (!WA_PHONE_ID) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  }
  return missing;
}

function configError(missing: string[]): Response {
  const body = {
    error: 'Configuration Tamy incomplète.',
    missing,
    hint:
      'Posez ces secrets avec : supabase secrets set ' +
      missing.map((m) => `${m}=...`).join(' '),
  };
  console.error('[tamy-webhook] secrets manquants :', missing.join(', '));
  return new Response(JSON.stringify(body), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ------------------------------------------------------------
// Signature Meta : HMAC SHA-256 du corps BRUT
// ------------------------------------------------------------
async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signatureIsValid(req: Request, rawBody: string): Promise<boolean> {
  const header = req.headers.get('x-hub-signature-256') ?? '';
  if (!header.startsWith('sha256=')) return false;
  const expected = await hmacSha256Hex(WA_APP_SECRET, rawBody);
  return timingSafeEqual(header.slice('sha256='.length).toLowerCase(), expected);
}

// ------------------------------------------------------------
// Utilitaires texte
// ------------------------------------------------------------
function normalize(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Réduit à [a-z0-9] : « J'ACCEPTE », « j accepte », « j'accepte! » → « jaccepte ». */
function squash(s: string): string {
  return normalize(s).replace(/[^a-z0-9]/g, '');
}

function fcfa(n: number): string {
  if (!Number.isFinite(n)) return '— F';
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
}

function km(n: number): string {
  if (!Number.isFinite(n)) return '— km';
  return `${n.toFixed(1).replace('.', ',')} km`;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type LatLng = { lat: number; lng: number };
type Place = { lat: number; lng: number; address: string };

// ------------------------------------------------------------
// Envoi WhatsApp (Cloud API)
// ------------------------------------------------------------
type Outbox = { to: string; body: string }[];

async function sendText(
  sb: any,
  to: string,
  body: string,
  outbox: Outbox,
  stateBefore?: string,
  stateAfter?: string,
): Promise<void> {
  outbox.push({ to, body });

  if (DRY_RUN || !WA_TOKEN || !WA_PHONE_ID) {
    console.log(`[tamy-webhook][dry-run] → ${to}\n${body}`);
    await logMessage(sb, {
      wa_phone: to,
      direction: 'out',
      msg_type: 'text',
      body,
      payload: { dry_run: true },
      state_before: stateBefore,
      state_after: stateAfter,
    });
    return;
  }

  let waId: string | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${WA_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to.replace(/^\+/, ''),
          type: 'text',
          text: { preview_url: false, body },
        }),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      error = `Meta ${res.status} : ${JSON.stringify(json?.error ?? json)}`;
      console.error('[tamy-webhook] envoi échoué', error);
    } else {
      waId = json?.messages?.[0]?.id ?? null;
    }
  } catch (err: any) {
    error = `Réseau : ${err?.message ?? err}`;
    console.error('[tamy-webhook] envoi échoué', error);
  }

  await logMessage(sb, {
    wa_phone: to,
    direction: 'out',
    wa_message_id: waId,
    msg_type: 'text',
    body,
    state_before: stateBefore,
    state_after: stateAfter,
    error,
  });
}

async function logMessage(sb: any, m: Record<string, any>): Promise<boolean> {
  const { data, error } = await sb.rpc('wa_log_message', {
    p_wa_phone: m.wa_phone,
    p_direction: m.direction,
    p_wa_message_id: m.wa_message_id ?? null,
    p_msg_type: m.msg_type ?? null,
    p_body: m.body ?? null,
    p_payload: m.payload ?? {},
    p_state_before: m.state_before ?? null,
    p_state_after: m.state_after ?? null,
    p_error: m.error ?? null,
  });
  if (error) {
    console.error('[tamy-webhook] wa_log_message', error.message);
    return true; // on ne bloque jamais le parcours pour un souci de journal
  }
  return data === true;
}

// ------------------------------------------------------------
// Itinéraire : Mapbox si disponible, sinon estimation
// ------------------------------------------------------------
async function route(from: LatLng, to: LatLng): Promise<{ distance_km: number; duration_min: number }> {
  if (MAPBOX_TOKEN) {
    try {
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving/` +
        `${from.lng},${from.lat};${to.lng},${to.lat}` +
        `?overview=false&access_token=${MAPBOX_TOKEN}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const r = data?.routes?.[0];
        if (r) {
          return {
            distance_km: Math.round((r.distance / 1000) * 100) / 100,
            duration_min: Math.max(1, Math.round(r.duration / 60)),
          };
        }
      }
    } catch (err: any) {
      console.error('[tamy-webhook] Mapbox Directions indisponible', err?.message ?? err);
    }
  }
  // Repli : vol d'oiseau × 1,35 (sinuosité urbaine), 22 km/h de moyenne.
  const straight = haversineKm(from, to);
  const distance = Math.round(straight * 1.35 * 100) / 100;
  return {
    distance_km: distance,
    duration_min: Math.max(1, Math.round((distance / 22) * 60)),
  };
}

// ------------------------------------------------------------
// Messages
// ------------------------------------------------------------
const HELP =
  'À tout moment : *ANNULER* pour tout arrêter, *AIDE* pour revoir ce message, ' +
  '*STATUT* pour suivre votre course.';

function welcome(name: string | null): string {
  const hello = name ? `Bonjour ${name},` : 'Bonjour,';
  return (
    `${hello} je suis *Tamy*, l'assistant TamCar.\n` +
    `Je commande votre course en quelques messages, sans installer d'application.\n\n` +
    `Avant de commencer, merci de lire nos conditions :\n` +
    `• CGU : ${SITE_URL}/cgu\n` +
    `• Confidentialité : ${SITE_URL}/confidentialite\n\n` +
    `Répondez *J'ACCEPTE* pour continuer.`
  );
}

const ASK_PICKUP =
  `Où souhaitez-vous être pris en charge ?\n\n` +
  `• Partagez votre position : trombone (+) puis *Localisation*\n` +
  `• Ou écrivez le nom du lieu (ex. : « Marché Dantokpa »)`;

const ASK_DROPOFF = `Parfait. Et où allez-vous ?\n\nÉcrivez le nom du lieu, ou partagez la position d'arrivée.`;

function candidatesMessage(label: string, list: any[]): string {
  const lines = list
    .map((p, i) => {
      const where = [p.district, p.city].filter(Boolean).join(', ');
      const dist = p.distance_m != null ? ` — ${km(p.distance_m / 1000)}` : '';
      return `${i + 1}. ${p.name}${where ? ` (${where})` : ''}${dist}`;
    })
    .join('\n');
  return `Plusieurs lieux correspondent pour *${label}* :\n\n${lines}\n\nRépondez avec le numéro (1-${list.length}), ou écrivez un autre nom.`;
}

function priceMenu(distanceKm: number, durationMin: number, quotes: any[]): string {
  const lines = quotes
    .map((q, i) => {
      const label = CATEGORY_LABELS[q.category] ?? q.category;
      const hint = CATEGORY_HINTS[q.category] ? ` — ${CATEGORY_HINTS[q.category]}` : '';
      return `${i + 1}. *${label}* : ${fcfa(q.price_total_fcfa)}${hint}`;
    })
    .join('\n');
  return (
    `Trajet estimé : ${km(distanceKm)} · environ ${durationMin} min.\n\n` +
    `${lines}\n\n` +
    `Répondez avec le numéro du véhicule souhaité.`
  );
}

function recap(ctx: any): string {
  const label = CATEGORY_LABELS[ctx.category] ?? ctx.category;
  return (
    `*Récapitulatif*\n` +
    `Départ : ${ctx.pickup.address}\n` +
    `Arrivée : ${ctx.dropoff.address}\n` +
    `Véhicule : ${label}\n` +
    `Prix : *${fcfa(ctx.price_fcfa)}* — paiement en *espèces* au chauffeur\n\n` +
    `Répondez *OUI* pour commander, *ANNULER* pour abandonner.`
  );
}

// ------------------------------------------------------------
// Compte léger : retrouver ou créer le profil client
// ------------------------------------------------------------
async function ensureProfile(
  sb: any,
  phone: string,
  displayName: string | null,
): Promise<string | null> {
  // 1. Un compte TamCar existe-t-il déjà avec ce numéro ?
  const { data: found, error: findErr } = await sb.rpc('wa_find_profile_by_phone', {
    p_phone: phone,
  });
  if (findErr) console.error('[tamy-webhook] wa_find_profile_by_phone', findErr.message);
  if (found) {
    await sb.rpc('wa_link_profile', { p_wa_phone: phone, p_profile_id: found });
    return found as string;
  }

  // 2. Sinon on crée le user auth (le trigger handle_new_user insère le
  //    profile, qui déclenche à son tour la création des wallets).
  const digits = phone.replace(/[^0-9]/g, '');
  const fullName = (displayName ?? '').trim() || `Client WhatsApp ${digits.slice(-4)}`;
  const email = `wa-${digits}@tamcar.local`;

  let userId: string | null = null;
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    phone,
    phone_confirm: true,
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName, source: 'whatsapp' },
  });
  if (created?.user) {
    userId = created.user.id;
  } else {
    console.error('[tamy-webhook] createUser (phone) échoué', createErr?.message);
    // Repli : projets où le provider téléphone est désactivé.
    const { data: created2, error: createErr2 } = await sb.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName, source: 'whatsapp' },
    });
    if (!created2?.user) {
      console.error('[tamy-webhook] createUser (email) échoué', createErr2?.message);
      return null;
    }
    userId = created2.user.id;
  }

  await sb
    .from('profiles')
    .update({ full_name: fullName, phone, role: 'client' })
    .eq('id', userId);

  await sb.rpc('wa_link_profile', { p_wa_phone: phone, p_profile_id: userId });
  return userId;
}

// ------------------------------------------------------------
// Recherche de lieu
// ------------------------------------------------------------
async function searchPlaces(sb: any, query: string, near: LatLng) {
  const { data, error } = await sb.rpc('search_places', {
    query,
    proximity_lng: near.lng,
    proximity_lat: near.lat,
    limit_count: MAX_CANDIDATES,
  });
  if (error) {
    console.error('[tamy-webhook] search_places', error.message);
    return [];
  }
  return (data ?? []) as any[];
}

async function inServiceZone(sb: any, p: LatLng): Promise<boolean> {
  const { data, error } = await sb.rpc('_is_within_service_zone', {
    p_lat: p.lat,
    p_lng: p.lng,
  });
  if (error) {
    console.error('[tamy-webhook] _is_within_service_zone', error.message);
    return true; // on laisse create_ride trancher plutôt que bloquer à tort
  }
  return data === true;
}

// ------------------------------------------------------------
// Extraction du contenu d'un message entrant
// ------------------------------------------------------------
function extractText(msg: any): string {
  if (msg?.type === 'text') return msg.text?.body ?? '';
  if (msg?.type === 'interactive') {
    return (
      msg.interactive?.button_reply?.title ??
      msg.interactive?.list_reply?.title ??
      msg.interactive?.button_reply?.id ??
      msg.interactive?.list_reply?.id ??
      ''
    );
  }
  if (msg?.type === 'button') return msg.button?.text ?? '';
  return '';
}

function extractLocation(msg: any): (LatLng & { name?: string; address?: string }) | null {
  if (msg?.type !== 'location') return null;
  const lat = Number(msg.location?.latitude);
  const lng = Number(msg.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, name: msg.location?.name, address: msg.location?.address };
}

// ------------------------------------------------------------
// Étapes du parcours
// ------------------------------------------------------------
async function askDropoff(sb: any, phone: string, ctx: any, outbox: Outbox) {
  await sb.rpc('wa_set_state', {
    p_wa_phone: phone,
    p_state: 'awaiting_dropoff',
    p_context: ctx,
    p_ttl_minutes: SESSION_TTL_MIN,
  });
  await sendText(sb, phone, ASK_DROPOFF, outbox);
}

/** Départ + arrivée connus → itinéraire, grille de prix, choix du véhicule. */
async function proposePrices(sb: any, phone: string, ctx: any, outbox: Outbox) {
  const r = await route(ctx.pickup, ctx.dropoff);
  ctx.distance_km = r.distance_km;
  ctx.duration_min = r.duration_min;

  const { data, error } = await sb.rpc('wa_price_menu', {
    p_pickup_lat: ctx.pickup.lat,
    p_pickup_lng: ctx.pickup.lng,
    p_dropoff_lat: ctx.dropoff.lat,
    p_dropoff_lng: ctx.dropoff.lng,
    p_distance_km: ctx.distance_km,
    p_duration_min: ctx.duration_min,
    p_is_night: false,
    p_with_ac: false,
  });

  if (error || !data || data.length === 0) {
    console.error('[tamy-webhook] wa_price_menu', error?.message);
    await sb.rpc('wa_set_state', { p_wa_phone: phone, p_state: 'idle', p_context: {} });
    await sendText(
      sb,
      phone,
      `Je n'arrive pas à calculer le prix pour ce trajet. Réessayez dans un instant en écrivant *TAXI*.`,
      outbox,
    );
    return;
  }

  ctx.quotes = data;
  await sb.rpc('wa_set_state', {
    p_wa_phone: phone,
    p_state: 'awaiting_category',
    p_context: ctx,
    p_ttl_minutes: SESSION_TTL_MIN,
  });
  await sendText(sb, phone, priceMenu(ctx.distance_km, ctx.duration_min, data), outbox);
}

/** Résout un texte libre en lieu : 0 résultat → relance, 1 → accepté, N → liste numérotée. */
async function resolvePlaceStep(
  sb: any,
  phone: string,
  ctx: any,
  text: string,
  which: 'pickup' | 'dropoff',
  outbox: Outbox,
): Promise<void> {
  const label = which === 'pickup' ? 'le départ' : 'la destination';

  if (text.trim().length < 3) {
    await sendText(
      sb,
      phone,
      `Merci de préciser ${label} en au moins 3 lettres (ou partagez votre position).`,
      outbox,
    );
    return;
  }

  const near: LatLng =
    which === 'dropoff' && ctx.pickup
      ? { lat: ctx.pickup.lat, lng: ctx.pickup.lng }
      : DEFAULT_PROXIMITY;

  const results = await searchPlaces(sb, text.trim(), near);

  if (results.length === 0) {
    await sendText(
      sb,
      phone,
      `Je ne trouve pas « ${text.trim()} » pour ${label}.\n` +
        `Essayez un repère connu (marché, carrefour, hôtel, école), ou partagez la position via le trombone (+) puis *Localisation*.`,
      outbox,
    );
    return;
  }

  if (results.length === 1) {
    await acceptPlace(
      sb,
      phone,
      ctx,
      which,
      {
        lat: results[0].lat,
        lng: results[0].lng,
        address: [results[0].name, results[0].city].filter(Boolean).join(', '),
      },
      outbox,
    );
    return;
  }

  ctx.candidates = results.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    address: [p.name, p.city].filter(Boolean).join(', '),
  }));
  await sb.rpc('wa_set_state', {
    p_wa_phone: phone,
    p_state: which === 'pickup' ? 'awaiting_pickup_choice' : 'awaiting_dropoff_choice',
    p_context: ctx,
    p_ttl_minutes: SESSION_TTL_MIN,
  });
  await sendText(sb, phone, candidatesMessage(label, results), outbox);
}

/** Valide un point (zone de service) puis passe à l'étape suivante. */
async function acceptPlace(
  sb: any,
  phone: string,
  ctx: any,
  which: 'pickup' | 'dropoff',
  place: Place,
  outbox: Outbox,
): Promise<void> {
  if (!(await inServiceZone(sb, place))) {
    await sendText(
      sb,
      phone,
      `« ${place.address} » est hors de notre zone de service.\n` +
        `TamCar circule à Cotonou, Porto-Novo, Sèmè-Podji, Pahou et Ouidah. Indiquez un autre lieu.`,
      outbox,
    );
    return;
  }

  delete ctx.candidates;
  if (which === 'pickup') {
    ctx.pickup = place;
    await sendText(sb, phone, `Départ noté : *${place.address}*.`, outbox);
    await askDropoff(sb, phone, ctx, outbox);
  } else {
    ctx.dropoff = place;
    await sendText(sb, phone, `Arrivée notée : *${place.address}*.`, outbox);
    await proposePrices(sb, phone, ctx, outbox);
  }
}

async function startOrder(sb: any, phone: string, outbox: Outbox) {
  await sb.rpc('wa_set_state', {
    p_wa_phone: phone,
    p_state: 'awaiting_pickup',
    p_context: {},
    p_ttl_minutes: SESSION_TTL_MIN,
  });
  await sendText(sb, phone, ASK_PICKUP, outbox);
}

async function sendStatus(sb: any, phone: string, outbox: Outbox) {
  const { data: rideId } = await sb.rpc('wa_active_ride', { p_wa_phone: phone });
  if (!rideId) {
    await sendText(sb, phone, `Vous n'avez aucune course en cours. Écrivez *TAXI* pour en commander une.`, outbox);
    return;
  }
  const { data } = await sb.rpc('wa_ride_summary', { p_ride_id: rideId });
  const s = Array.isArray(data) ? data[0] : data;
  if (!s) {
    await sendText(sb, phone, `Course introuvable. Écrivez *TAXI* pour recommencer.`, outbox);
    return;
  }
  const etat: Record<string, string> = {
    requested: 'Recherche d\'un chauffeur en cours.',
    matched: 'Un chauffeur est en route vers vous.',
    arrived: 'Votre chauffeur est arrivé au point de départ.',
    in_progress: 'Course en cours.',
  };
  const driver = s.driver_full_name
    ? `\nChauffeur : ${s.driver_full_name}${s.driver_phone ? ` (${s.driver_phone})` : ''}` +
      `${s.vehicle_brand ? `\nVéhicule : ${[s.vehicle_brand, s.vehicle_model, s.vehicle_color].filter(Boolean).join(' ')}${s.vehicle_plate ? ` — ${s.vehicle_plate}` : ''}` : ''}`
    : '';
  await sendText(
    sb,
    phone,
    `${etat[s.status] ?? `Statut : ${s.status}`}\n` +
      `De ${s.pickup_address} à ${s.dropoff_address}\n` +
      `Prix : ${fcfa(s.price_total_fcfa)} (espèces)${driver}` +
      (s.share_token ? `\nSuivi en direct : ${SITE_URL}/suivi/${s.share_token}` : ''),
    outbox,
  );
}

// ------------------------------------------------------------
// Machine à états
// ------------------------------------------------------------
async function handleMessage(sb: any, msg: any, displayName: string | null, outbox: Outbox) {
  const phone = `+${String(msg.from ?? '').replace(/[^0-9]/g, '')}`;
  if (phone === '+') return;

  const text = extractText(msg);
  const loc = extractLocation(msg);

  // Session (créée / réinitialisée si expirée) — avant le journal pour
  // disposer de l'état à consigner.
  const { data: sessionRow, error: sessErr } = await sb.rpc('wa_get_session', {
    p_wa_phone: phone,
    p_display_name: displayName,
    p_ttl_minutes: SESSION_TTL_MIN,
  });
  if (sessErr) {
    console.error('[tamy-webhook] wa_get_session', sessErr.message);
    return;
  }
  const session = Array.isArray(sessionRow) ? sessionRow[0] : sessionRow;
  const state: string = session?.state ?? 'idle';
  const ctx: any = session?.context ?? {};

  // Idempotence : Meta rejoue les webhooks non acquittés.
  const fresh = await logMessage(sb, {
    wa_phone: phone,
    direction: 'in',
    wa_message_id: msg.id,
    msg_type: msg.type,
    body: text || (loc ? `[position ${loc.lat},${loc.lng}]` : `[${msg.type}]`),
    payload: msg,
    state_before: state,
  });
  if (!fresh) {
    console.log('[tamy-webhook] message déjà traité, ignoré :', msg.id);
    return;
  }

  const key = squash(text);

  // --- Commandes globales -------------------------------------------
  if (key === 'aide' || key === 'help' || key === 'menu') {
    await sendText(sb, phone, `Je suis *Tamy*, l'assistant TamCar.\nÉcrivez *TAXI* pour commander une course.\n\n${HELP}`, outbox);
    return;
  }

  if (key === 'statut' || key === 'status' || key === 'suivi') {
    await sendStatus(sb, phone, outbox);
    return;
  }

  if (key === 'annuler' || key === 'stop' || key === 'annule') {
    const { data: rideId } = await sb.rpc('wa_active_ride', { p_wa_phone: phone });
    if (rideId) {
      const { error } = await sb.rpc('wa_cancel_ride', { p_wa_phone: phone, p_ride_id: rideId });
      if (error) {
        await sendText(sb, phone, `Annulation impossible : ${error.message}`, outbox);
        return;
      }
      await sb.rpc('wa_set_state', { p_wa_phone: phone, p_state: 'idle', p_context: {} });
      await sendText(
        sb,
        phone,
        `Course annulée. Des frais d'annulation peuvent s'appliquer si un chauffeur était déjà en route.\nÉcrivez *TAXI* pour recommencer.`,
        outbox,
      );
      return;
    }
    await sb.rpc('wa_set_state', { p_wa_phone: phone, p_state: 'idle', p_context: {} });
    await sendText(sb, phone, `C'est annulé. Écrivez *TAXI* quand vous voudrez commander une course.`, outbox);
    return;
  }

  // --- Rattachement du compte (une seule fois par numéro) -------------
  const { data: contactRow } = await sb.rpc('wa_touch_contact', {
    p_wa_phone: phone,
    p_display_name: displayName,
  });
  const contact = Array.isArray(contactRow) ? contactRow[0] : contactRow;

  let profileId: string | null = contact?.profile_id ?? null;
  if (!profileId) {
    profileId = await ensureProfile(sb, phone, displayName);
    if (!profileId) {
      await sendText(
        sb,
        phone,
        `Je n'arrive pas à ouvrir votre compte TamCar pour le moment. Réessayez dans quelques minutes.`,
        outbox,
      );
      return;
    }
  }

  if (contact?.blocked) {
    await sendText(
      sb,
      phone,
      `Votre numéro ne peut plus commander de course : un chauffeur s'est déplacé pour rien à ${contact.no_show_count} reprises.\n` +
        `Pour débloquer votre compte, contactez le support TamCar (${SITE_URL}/contact).`,
      outbox,
    );
    return;
  }

  // --- CGU : aucune course avant acceptation --------------------------
  const { data: accepted } = await sb.rpc('wa_has_accepted_terms', {
    p_profile_id: profileId,
    p_version: TERMS_VERSION,
  });

  if (accepted !== true) {
    if (key === 'jaccepte') {
      const { error } = await sb.rpc('wa_accept_terms', {
        p_profile_id: profileId,
        p_version: TERMS_VERSION,
      });
      if (error) {
        await sendText(sb, phone, `Enregistrement impossible : ${error.message}`, outbox);
        return;
      }
      await sendText(sb, phone, `Merci, c'est enregistré.\n\n${HELP}`, outbox);
      await startOrder(sb, phone, outbox);
      return;
    }
    await sb.rpc('wa_set_state', {
      p_wa_phone: phone,
      p_state: 'awaiting_terms',
      p_context: {},
      p_ttl_minutes: SESSION_TTL_MIN,
    });
    await sendText(sb, phone, welcome(displayName ?? contact?.display_name ?? null), outbox);
    return;
  }

  // --- Parcours -------------------------------------------------------
  switch (state) {
    case 'idle':
    case 'awaiting_terms': {
      await sendText(
        sb,
        phone,
        `Bonjour, je suis *Tamy*, l'assistant TamCar. Je vous commande une course tout de suite.\n\n${HELP}`,
        outbox,
      );
      await startOrder(sb, phone, outbox);
      return;
    }

    case 'awaiting_pickup':
    case 'awaiting_pickup_choice':
    case 'awaiting_dropoff':
    case 'awaiting_dropoff_choice': {
      const which: 'pickup' | 'dropoff' = state.startsWith('awaiting_pickup') ? 'pickup' : 'dropoff';

      // 1. Position WhatsApp native
      if (loc) {
        const address =
          loc.name ||
          loc.address ||
          (await sb.rpc('wa_reverse_place', { p_lat: loc.lat, p_lng: loc.lng })).data ||
          'Position partagée';
        await acceptPlace(sb, phone, ctx, which, { lat: loc.lat, lng: loc.lng, address }, outbox);
        return;
      }

      // 2. Choix d'un candidat par son numéro
      if (state.endsWith('_choice') && Array.isArray(ctx.candidates)) {
        const n = Number(key);
        if (Number.isInteger(n) && n >= 1 && n <= ctx.candidates.length) {
          await acceptPlace(sb, phone, ctx, which, ctx.candidates[n - 1], outbox);
          return;
        }
      }

      // 3. Recherche texte
      if (text.trim()) {
        await resolvePlaceStep(sb, phone, ctx, text, which, outbox);
        return;
      }

      await sendText(
        sb,
        phone,
        which === 'pickup'
          ? `Je n'ai pas compris.\n\n${ASK_PICKUP}`
          : `Je n'ai pas compris.\n\n${ASK_DROPOFF}`,
        outbox,
      );
      return;
    }

    case 'awaiting_category': {
      const quotes: any[] = Array.isArray(ctx.quotes) ? ctx.quotes : [];
      const n = Number(key);
      let chosen = Number.isInteger(n) && n >= 1 && n <= quotes.length ? quotes[n - 1] : null;
      if (!chosen) {
        chosen =
          quotes.find((q) => squash(CATEGORY_LABELS[q.category] ?? q.category) === key) ?? null;
      }
      if (!chosen) {
        await sendText(
          sb,
          phone,
          `Je n'ai pas compris votre choix.\n\n${priceMenu(ctx.distance_km, ctx.duration_min, quotes)}`,
          outbox,
        );
        return;
      }
      ctx.category = chosen.category;
      ctx.price_fcfa = chosen.price_total_fcfa;
      await sb.rpc('wa_set_state', {
        p_wa_phone: phone,
        p_state: 'awaiting_confirm',
        p_context: ctx,
        p_ttl_minutes: SESSION_TTL_MIN,
      });
      await sendText(sb, phone, recap(ctx), outbox);
      return;
    }

    case 'awaiting_confirm': {
      if (key !== 'oui' && key !== 'ok' && key !== 'confirmer' && key !== 'jeconfirme') {
        await sendText(sb, phone, `Répondez *OUI* pour commander, ou *ANNULER* pour abandonner.`, outbox);
        return;
      }

      const { data: ride, error } = await sb.rpc('wa_create_ride', {
        p_wa_phone: phone,
        p_category: ctx.category,
        p_pickup_lat: ctx.pickup.lat,
        p_pickup_lng: ctx.pickup.lng,
        p_pickup_address: ctx.pickup.address,
        p_dropoff_lat: ctx.dropoff.lat,
        p_dropoff_lng: ctx.dropoff.lng,
        p_dropoff_address: ctx.dropoff.address,
        p_distance_km: ctx.distance_km,
        p_duration_min: ctx.duration_min,
        p_with_ac: false,
        p_payment_method: 'cash',
        p_terms_version: TERMS_VERSION,
      });

      if (error || !ride) {
        console.error('[tamy-webhook] wa_create_ride', error?.message);
        await sb.rpc('wa_set_state', { p_wa_phone: phone, p_state: 'idle', p_context: {} });
        await sendText(
          sb,
          phone,
          `Je n'ai pas pu créer la course : ${error?.message ?? 'erreur inconnue'}\nÉcrivez *TAXI* pour réessayer.`,
          outbox,
        );
        return;
      }

      const created = Array.isArray(ride) ? ride[0] : ride;

      // Lien de suivi public : le client WhatsApp n'est pas connecté à l'app.
      const { data: token } = await sb.rpc('wa_ride_share_token', {
        p_wa_phone: phone,
        p_ride_id: created.id,
      });

      await sb.rpc('wa_set_state', {
        p_wa_phone: phone,
        p_state: 'ride_active',
        p_context: {
          ride_id: created.id,
          price_fcfa: created.price_total_fcfa,
          share_token: token ?? null,
        },
        p_ttl_minutes: 180,
      });
      await sendText(
        sb,
        phone,
        `Course confirmée pour ${fcfa(created.price_total_fcfa)} en espèces.\n` +
          `Je cherche un chauffeur et je vous préviens dès qu'il accepte.\n` +
          (token ? `\nSuivi en direct : ${SITE_URL}/suivi/${token}\n` : '\n') +
          `Écrivez *STATUT* à tout moment, ou *ANNULER* pour annuler.`,
        outbox,
      );
      return;
    }

    case 'ride_active': {
      if (key === 'taxi' || key === 'course' || key === 'nouvelle') {
        await sendText(sb, phone, `Vous avez déjà une course en cours. Écrivez *STATUT* pour la suivre, ou *ANNULER* pour l'annuler.`, outbox);
        return;
      }
      await sendStatus(sb, phone, outbox);
      return;
    }

    default: {
      await startOrder(sb, phone, outbox);
      return;
    }
  }
}

// ------------------------------------------------------------
// Serveur
// ------------------------------------------------------------
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // --- Vérification du webhook (Meta, GET) ---
  if (req.method === 'GET') {
    const missing = missingSecrets(false);
    if (missing.length > 0) return configError(missing);

    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') ?? '';

    if (mode === 'subscribe' && token && timingSafeEqual(token, WA_VERIFY_TOKEN)) {
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    console.error('[tamy-webhook] vérification refusée (mode ou verify_token invalide)');
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const missing = missingSecrets(true);
  if (missing.length > 0) return configError(missing);

  const rawBody = await req.text();

  // --- Signature obligatoire (sauf mode test local explicite) ---
  const hasSignature = req.headers.get('x-hub-signature-256') !== null;
  if (!DRY_RUN || hasSignature) {
    if (!(await signatureIsValid(req, rawBody))) {
      console.error('[tamy-webhook] signature X-Hub-Signature-256 invalide — requête rejetée');
      return new Response(JSON.stringify({ error: 'Signature invalide' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    console.warn('[tamy-webhook] TAMY_DRY_RUN=1 : signature non vérifiée (mode test local)');
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
  const outbox: Outbox = [];

  try {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};
        const contacts: any[] = value?.contacts ?? [];
        for (const msg of value?.messages ?? []) {
          const contact = contacts.find((c) => c?.wa_id === msg?.from) ?? contacts[0];
          const displayName: string | null = contact?.profile?.name ?? null;
          try {
            await handleMessage(sb, msg, displayName, outbox);
          } catch (err: any) {
            console.error('[tamy-webhook] traitement du message échoué', err?.message ?? err);
            await logMessage(sb, {
              wa_phone: `+${String(msg?.from ?? '')}`,
              direction: 'in',
              msg_type: 'error',
              body: null,
              payload: msg,
              error: String(err?.message ?? err),
            });
            await sendText(
              sb,
              `+${String(msg?.from ?? '').replace(/[^0-9]/g, '')}`,
              `Une erreur technique est survenue. Écrivez *TAXI* pour reprendre depuis le début.`,
              outbox,
            );
          }
        }
      }
    }
  } catch (err: any) {
    console.error('[tamy-webhook] payload inattendu', err?.message ?? err);
  }

  // Toujours 200 : un non-2xx déclenche les rejeux Meta en boucle.
  return new Response(JSON.stringify({ ok: true, replies: outbox }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
