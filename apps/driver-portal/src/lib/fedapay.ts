// FedaPay Checkout widget helper — charge le SDK au moment de l'usage
// et retourne une promise 'completed' | 'cancelled'.
//
// Le webhook fera le vrai crédit du wallet côté serveur ; le client
// n'a qu'à attendre que la RPC `apply_fedapay_success` soit appelée.

import { supabaseBrowser } from '@/lib/supabase-browser';

const SDK_URL = 'https://cdn.fedapay.com/checkout.js?v=1.1.7';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { FedaPay?: any }
}

function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FedaPay) return resolve();
    if (document.querySelector(`script[src^="${SDK_URL.split('?')[0]}"]`)) {
      // Déjà en cours de chargement — poll
      const start = Date.now();
      const it = setInterval(() => {
        if (window.FedaPay) { clearInterval(it); resolve(); }
        else if (Date.now() - start > 15000) { clearInterval(it); reject(new Error('FedaPay SDK timeout')); }
      }, 100);
      return;
    }
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load FedaPay SDK'));
    document.head.appendChild(s);
  });
}

export type LaunchOpts = {
  publicKey: string;
  amountFcfa: number;
  reference: string;
  customerEmail?: string | null;
  customerLastName?: string | null;
  customerFirstName?: string | null;
  description?: string;
};

export type LaunchResult = 'completed' | 'cancelled' | 'error';

export async function launchFedapayCheckout(opts: LaunchOpts): Promise<LaunchResult> {
  await loadSdk();
  const FedaPay = window.FedaPay;
  if (!FedaPay) return 'error';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: any = {
    public_key: opts.publicKey,
    transaction: {
      amount: opts.amountFcfa,
      description: opts.description || 'Recharge TamCar Crédit',
    },
    currency: { iso: 'XOF' },
    custom_metadata: { reference: opts.reference },
  };

  // N'inclure `customer` que si on a de vraies valeurs — sinon le widget
  // stringifie `undefined` en "undefined" et FedaPay rejette la transaction.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customer: any = {};
  if (opts.customerEmail) customer.email = opts.customerEmail;
  if (opts.customerFirstName) customer.firstname = opts.customerFirstName;
  if (opts.customerLastName) customer.lastname = opts.customerLastName;
  if (Object.keys(customer).length > 0) config.customer = customer;

  return new Promise<LaunchResult>((resolve) => {
    try {
      config.onComplete = (resp: unknown) => {
        const reason = String((resp as { reason?: string } | null)?.reason || '').toUpperCase();
        if (reason === 'CHECKOUT_COMPLETED') resolve('completed');
        else if (reason === 'DIALOG_DISMISSED') resolve('cancelled');
        else resolve('cancelled');
      };
      const widget = FedaPay.init(config);
      widget.open();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[fedapay] init failed', e);
      resolve('error');
    }
  });
}

export const FEDAPAY_PUBLIC_KEY = process.env.NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY;

export type PaymentOutcome =
  | { status: 'success' }
  | { status: 'failed' }
  | { status: 'pending' }
  | { status: 'error'; message: string };

/**
 * Paiement Mobile Money complet : une transaction « en attente » est créée en base (RPC `initiate_fedapay_*`), la fenêtre FedaPay
 * s'ouvre, puis on suit le résultat. La source de vérité est le webhook (l'utilisateur peut fermer la fenêtre après avoir validé
 * son paiement sur son téléphone) : on interroge donc la base pendant 45 s au lieu de se fier à la fermeture de la fenêtre.
 */
export async function payWithFedapay(
  rpcName: 'initiate_fedapay_debt',
  params: Record<string, unknown>,
  amountFcfa: number,
  description: string,
): Promise<PaymentOutcome> {
  if (!FEDAPAY_PUBLIC_KEY) {
    return { status: 'error', message: 'Paiement indisponible (configuration FedaPay manquante).' };
  }
  const { data, error } = await supabaseBrowser.rpc(rpcName, params);
  if (error || !Array.isArray(data) || !data[0]) {
    return { status: 'error', message: error?.message ?? "Impossible d'initier le paiement." };
  }
  const ref = (data[0] as { reference: string }).reference;

  // Pré-remplit le client (évite « undefined » dans la fenêtre FedaPay)
  const { data: { user } } = await supabaseBrowser.auth.getUser();
  const { data: profileRows } = await supabaseBrowser.from('profiles').select('full_name').eq('id', user?.id ?? '').limit(1);
  const fullName = ((Array.isArray(profileRows) ? profileRows[0] : null) as { full_name?: string } | null)?.full_name?.trim() ?? '';
  const parts = fullName.split(/\s+/);

  const launched = await launchFedapayCheckout({
    publicKey: FEDAPAY_PUBLIC_KEY,
    amountFcfa,
    reference: ref,
    customerEmail: user?.email || undefined,
    customerFirstName: parts[0] || undefined,
    customerLastName: parts.slice(1).join(' ') || undefined,
    description,
  });
  if (launched === 'error') return { status: 'error', message: 'La fenêtre de paiement ne s\'est pas ouverte. Réessayez.' };

  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const { data: rows } = await supabaseBrowser.from('wallet_transactions').select('status').eq('fedapay_reference', ref).limit(1);
    const s = Array.isArray(rows) ? (rows[0] as { status?: string } | undefined)?.status : undefined;
    if (s === 'success') return { status: 'success' };
    if (s === 'failed') return { status: 'failed' };
  }
  return { status: 'pending' };
}
