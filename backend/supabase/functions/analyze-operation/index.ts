// Supabase Edge Function : analyze-operation
// Analyse IA d'une opération de trésorerie (TamCar Office, phase 2b).
// Reçoit { storage_path?, mime_type?, text? } :
//   - storage_path : chemin d'un justificatif (image/PDF) dans le bucket
//     privé 'backoffice' — lu côté serveur, jamais exposé.
//   - text : description libre (« payé 45 000 F de carburant à la station
//     JNP en espèces »), utilisable seule ou en complément de la pièce.
// Retourne l'opération structurée : fournisseur, date, montant, catégorie
// comptable, mode de paiement, confiance (0-1), notes.
//
// Accès : réservé aux rôles back-office (admin, staff) — JWT vérifié.
// Secrets requis : ANTHROPIC_API_KEY (+ optionnel ANTHROPIC_MODEL,
// défaut claude-haiku-4-5 — choix économique validé : ~1-3 F CFA/pièce),
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

// deno-lint-ignore-file no-explicit-any
import Anthropic from 'npm:@anthropic-ai/sdk@0.115.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const CATEGORIES = [
  ['loyer', 'Loyer et charges des bureaux'],
  ['eau_energie', 'Eau et électricité (SBEE, SONEB…)'],
  ['carburant', 'Carburant, essence, gasoil, lubrifiants'],
  ['fournitures', 'Fournitures de bureau'],
  ['entretien', 'Entretien et réparations (véhicules, locaux, matériel)'],
  ['assurances', 'Primes d’assurance'],
  ['marketing', 'Marketing, communication, publicité, impression'],
  ['telecom', 'Téléphone, internet, SMS, crédit de communication'],
  ['numerique', 'Hébergement et services numériques (Supabase, Vercel…)'],
  ['frais_bancaires', 'Frais et commissions bancaires'],
  ['frais_momo', 'Frais Mobile Money ou agrégateur de paiement'],
  ['honoraires', 'Honoraires (comptable, avocat…) et commissions'],
  ['deplacements', 'Transports et déplacements (taxi, carburant mission…)'],
  ['impots_taxes', 'Impôts, taxes, patente, redevances (ANATT…)'],
  ['salaires', 'Salaires nets payés au personnel'],
  ['cnss', 'Cotisations sociales CNSS'],
  ['autres', 'Toute autre dépense'],
] as const;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    supplier: {
      type: 'string',
      description:
        "Fournisseur ou bénéficiaire du paiement (ex. : 'SBEE', 'Station JNP'). Chaîne vide si inconnu.",
    },
    doc_date: {
      type: 'string',
      description:
        "Date de l'opération au format YYYY-MM-DD. Chaîne vide si illisible ou absente.",
    },
    amount_fcfa: {
      type: 'integer',
      description:
        'Montant total TTC en francs CFA, entier sans séparateurs. 0 si introuvable.',
    },
    category: {
      type: 'string',
      enum: CATEGORIES.map(([code]) => code),
      description: 'Catégorie comptable de la dépense.',
    },
    payment_account: {
      type: 'string',
      enum: ['5211', '5311', '5312', '571', ''],
      description:
        "Mode de paiement détecté : 5211 = virement/chèque bancaire, 5311 = MTN Mobile Money, 5312 = Moov Money, 571 = espèces. Chaîne vide si non déterminable.",
    },
    confidence: {
      type: 'number',
      description:
        'Confiance globale de 0 à 1 : 1 = toutes les informations clés (montant, nature) sont claires ; < 0.75 = pièce ambiguë ou illisible.',
    },
    notes: {
      type: 'string',
      description:
        "Précision utile pour la comptable (période couverte, n° de facture, doute à signaler). Chaîne vide sinon.",
    },
  },
  required: [
    'supplier',
    'doc_date',
    'amount_fcfa',
    'category',
    'payment_account',
    'confidence',
    'notes',
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Tu es l'assistant comptable de TamCar, une plateforme VTC au Bénin (monnaie : franc CFA, FCFA).
On te fournit un justificatif de dépense (photo de reçu, facture, capture Mobile Money) et/ou une description en français.
Extrais l'opération et classe-la dans une catégorie comptable.

Catégories disponibles :
${CATEGORIES.map(([code, label]) => `- ${code} : ${label}`).join('\n')}

Règles :
- Le montant est le TOTAL payé, en FCFA, entier (« 45 000 F » → 45000). Ne confonds pas montant et numéro de téléphone ou de reçu.
- Si la description et la pièce se contredisent, privilégie la pièce et signale l'écart dans notes.
- Date au format YYYY-MM-DD ; si seule la description donne un indice (« hier », « ce matin »), laisse la date vide plutôt que d'inventer.
- Baisse la confiance sous 0.75 dès qu'un élément clé (montant, nature de la dépense) est incertain ou illisible.`;

function isImage(mime: string): boolean {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime);
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  const supabase = createClient(SB_URL, SB_KEY);

  // --- Auth : JWT valide + rôle back-office ---
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !userData.user) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile || !['admin', 'staff'].includes(profile.role)) {
    return new Response(JSON.stringify({ error: 'Accès refusé' }), {
      status: 403,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const storagePath: string | null = body?.storage_path ?? null;
  const mimeType: string = body?.mime_type ?? 'image/jpeg';
  const text: string = (body?.text ?? '').trim();

  if (!storagePath && !text) {
    return new Response(
      JSON.stringify({ error: 'Fournissez une pièce ou une description.' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  // --- Contenu du message : pièce (image ou PDF) puis description ---
  const content: any[] = [];
  if (storagePath) {
    const { data: file, error: dlErr } = await supabase.storage
      .from('backoffice')
      .download(storagePath);
    if (dlErr || !file) {
      return new Response(
        JSON.stringify({ error: `Pièce introuvable : ${dlErr?.message ?? ''}` }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }
    const b64 = toBase64(await file.arrayBuffer());
    if (isImage(mimeType)) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mimeType, data: b64 },
      });
    } else if (mimeType === 'application/pdf') {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: b64 },
      });
    } else {
      return new Response(
        JSON.stringify({ error: `Format non analysable : ${mimeType}` }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }
  }
  content.push({
    type: 'text',
    text: text
      ? `Description fournie par l'opérateur : « ${text} »`
      : 'Analyse le justificatif ci-dessus.',
  });

  // --- Appel Claude : extraction structurée ---
  const anthropic = new Anthropic();
  let result: any;
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') {
      return new Response(
        JSON.stringify({ error: 'Analyse refusée par le modèle.' }),
        { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }
    const textBlock = response.content.find((b: any) => b.type === 'text');
    result = JSON.parse(textBlock?.text ?? '{}');
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `Analyse impossible : ${err?.message ?? err}` }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify(result), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
