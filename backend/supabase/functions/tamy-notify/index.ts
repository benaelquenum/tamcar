// Supabase Edge Function : tamy-notify
// Notifications WhatsApp sortantes de Tamy (chauffeur trouvé, arrivé,
// course démarrée, terminée, annulée).
//
// Appelée par le trigger SQL trg_ride_status_change_wa via pg_net —
// même mécanique que _push_notify / send-push, avec les réglages stockés
// dans public._push_settings :
//   ('tamy_notify_url', 'https://<ref>.supabase.co/functions/v1/tamy-notify')
//   ('service_role_key', '<clé service role>')   -- déjà posée par la migration push
//
// Corps attendu : { "ride_id": "<uuid>", "event": "matched" | "arrived" |
//   "in_progress" | "completed" | "cancelled_by_client" |
//   "cancelled_by_driver" | "expired" }
//
// Secrets requis :
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injectés par la plateforme)
// Secrets optionnels :
//   WHATSAPP_GRAPH_VERSION (défaut v21.0), TAMY_SITE_URL, TAMY_DRY_RUN
//
// Rappel Meta : un message libre (hors template) n'est délivrable que dans
// la fenêtre de 24 h suivant le dernier message du client. Le parcours
// Tamy tient largement dans cette fenêtre ; pour des relances au-delà,
// il faudra un template approuvé.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
const GRAPH_VERSION = Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v21.0';
const SITE_URL = (Deno.env.get('TAMY_SITE_URL') || 'https://tamcar.app').replace(/\/$/, '');
const DRY_RUN = Deno.env.get('TAMY_DRY_RUN') === '1';

const TERMINAL = [
  'completed',
  'cancelled_by_client',
  'cancelled_by_driver',
  'expired',
];

function fcfa(n: number): string {
  if (!Number.isFinite(n)) return '— F';
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
}

function missingSecrets(): string[] {
  const missing: string[] = [];
  if (!SB_URL) missing.push('SUPABASE_URL');
  if (!SB_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!DRY_RUN) {
    if (!WA_TOKEN) missing.push('WHATSAPP_TOKEN');
    if (!WA_PHONE_ID) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  }
  return missing;
}

function vehicleLine(s: any): string {
  const v = [s.vehicle_brand, s.vehicle_model, s.vehicle_color].filter(Boolean).join(' ');
  if (!v && !s.vehicle_plate) return '';
  return `\nVéhicule : ${v}${s.vehicle_plate ? ` — ${s.vehicle_plate}` : ''}`;
}

function driverLine(s: any): string {
  if (!s.driver_full_name) return '';
  return `\nChauffeur : ${s.driver_full_name}${s.driver_phone ? ` (${s.driver_phone})` : ''}`;
}

function buildMessage(event: string, s: any): string | null {
  switch (event) {
    case 'matched':
      return (
        `*Chauffeur trouvé.*${driverLine(s)}${vehicleLine(s)}\n` +
        `Il se dirige vers ${s.pickup_address}.\n` +
        `Prix : ${fcfa(s.price_total_fcfa)} à régler en espèces.` +
        (s.share_token ? `\nSuivi en direct : ${SITE_URL}/suivi/${s.share_token}` : '')
      );
    case 'arrived':
      return (
        `*Votre chauffeur est arrivé* au point de départ${s.driver_full_name ? ` (${s.driver_full_name})` : ''}.` +
        `${vehicleLine(s)}\n` +
        `Merci de le rejoindre rapidement : au-delà de quelques minutes d'attente, la course peut être annulée.`
      );
    case 'in_progress':
      return `*Course démarrée* vers ${s.dropoff_address}. Bon trajet avec TamCar.`;
    case 'completed':
      return (
        `*Course terminée.* Montant à régler en espèces : *${fcfa(s.price_total_fcfa)}*.\n` +
        `Merci d'avoir choisi TamCar. Écrivez *TAXI* quand vous aurez besoin d'une nouvelle course.`
      );
    case 'cancelled_by_driver':
      return (
        `Votre chauffeur a dû annuler la course. Nous en sommes désolés.\n` +
        `Écrivez *TAXI* pour en commander une autre immédiatement.`
      );
    case 'cancelled_by_client':
      return `Votre course est annulée. Écrivez *TAXI* pour en commander une nouvelle.`;
    case 'expired':
      return (
        `Aucun chauffeur n'a pu prendre votre course pour le moment.\n` +
        `Écrivez *TAXI* pour réessayer dans quelques minutes.`
      );
    default:
      return null;
  }
}

async function sendText(sb: any, to: string, body: string): Promise<void> {
  if (DRY_RUN || !WA_TOKEN || !WA_PHONE_ID) {
    console.log(`[tamy-notify][dry-run] → ${to}\n${body}`);
    await sb.rpc('wa_log_message', {
      p_wa_phone: to,
      p_direction: 'out',
      p_msg_type: 'notification',
      p_body: body,
      p_payload: { dry_run: true },
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
      console.error('[tamy-notify] envoi échoué', error);
    } else {
      waId = json?.messages?.[0]?.id ?? null;
    }
  } catch (err: any) {
    error = `Réseau : ${err?.message ?? err}`;
    console.error('[tamy-notify] envoi échoué', error);
  }

  await sb.rpc('wa_log_message', {
    p_wa_phone: to,
    p_direction: 'out',
    p_wa_message_id: waId,
    p_msg_type: 'notification',
    p_body: body,
    p_error: error,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const missing = missingSecrets();
  if (missing.length > 0) {
    console.error('[tamy-notify] secrets manquants :', missing.join(', '));
    return new Response(
      JSON.stringify({
        error: 'Configuration Tamy incomplète.',
        missing,
        hint: 'supabase secrets set ' + missing.map((m) => `${m}=...`).join(' '),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rideId: string | null = body?.ride_id ?? null;
  const event: string = body?.event ?? '';
  if (!rideId || !event) {
    return new Response(JSON.stringify({ error: 'ride_id et event requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

  const { data, error } = await sb.rpc('wa_ride_summary', { p_ride_id: rideId });
  if (error) {
    console.error('[tamy-notify] wa_ride_summary', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const summary = Array.isArray(data) ? data[0] : data;
  if (!summary) {
    // Course non commandée via WhatsApp → rien à faire.
    return new Response(JSON.stringify({ ok: true, skipped: 'not_a_whatsapp_ride' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const message = buildMessage(event, summary);
  if (!message) {
    return new Response(JSON.stringify({ ok: true, skipped: `event_${event}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await sendText(sb, summary.wa_phone, message);

  // Course terminée / annulée → la session redevient disponible pour une
  // nouvelle commande.
  if (TERMINAL.includes(event)) {
    const { error: stateErr } = await sb.rpc('wa_set_state', {
      p_wa_phone: summary.wa_phone,
      p_state: 'idle',
      p_context: {},
      p_ttl_minutes: 30,
    });
    if (stateErr) console.error('[tamy-notify] wa_set_state', stateErr.message);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
