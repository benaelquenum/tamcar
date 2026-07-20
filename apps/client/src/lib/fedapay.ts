// FedaPay Checkout widget helper — charge le SDK au moment de l'usage
// et retourne une promise 'completed' | 'cancelled'.
//
// Le webhook fera le vrai crédit du wallet côté serveur ; le client
// n'a qu'à attendre que la RPC `apply_fedapay_success` soit appelée.

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
