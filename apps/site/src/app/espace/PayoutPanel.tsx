'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import {
  PAYOUT_STATUS_LABEL,
  fmt,
  type DealerPayoutOverview,
  type DealerPayoutQuote,
  type DealerPayoutRequest,
} from './lib';

const STATUS_STYLE: Record<DealerPayoutRequest['status'], string> = {
  requested: 'bg-warning/15 text-neutral-800',
  paid: 'bg-primary-100 text-primary-700',
  rejected: 'bg-error/10 text-error',
  cancelled: 'bg-neutral-200 text-neutral-700',
};

function pctLabel(permille: number): string {
  return `${(permille / 10).toLocaleString('fr-FR')} %`;
}

function dateFr(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Porto-Novo' });
}

function dayFr(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function accountLabel(o: DealerPayoutOverview): string {
  if (!o.payout_account) return '';
  return o.payout_method === 'virement' ? `Virement bancaire ${o.payout_account}` : `Mobile Money ${String(o.payout_provider ?? '').toUpperCase()} ${o.payout_account}`;
}

const INPUT =
  'w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500';
const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-neutral-500';

/**
 * Versement de la part du partenaire (contrat de partenariat, article 9) : le partenaire enregistre UNE fois son compte de paiement, que TamCar valide ;
 * il demande ensuite son versement dans les premiers jours de chaque mois, sur présentation de sa facture normalisée, pour les sommes acquises à la fin du
 * mois écoulé. Frais de transaction à sa charge, AIB retenu selon sa situation fiscale : les chiffres viennent de la base (dealer_payout_quote), il voit
 * exactement ce qu'il recevra avant de valider.
 */
export function PayoutPanel({
  overview,
  requests,
  readOnly,
}: {
  overview: DealerPayoutOverview;
  requests: DealerPayoutRequest[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editAccount, setEditAccount] = useState(false);
  const [amount, setAmount] = useState(String(overview.requestable_fcfa));
  const [invoice, setInvoice] = useState('');
  const [method, setMethod] = useState<'mobile_money' | 'virement'>(overview.payout_method ?? 'mobile_money');
  const [provider, setProvider] = useState<'mtn' | 'moov'>(overview.payout_provider === 'moov' ? 'moov' : 'mtn');
  const [account, setAccount] = useState(overview.payout_account ?? '');
  const [quote, setQuote] = useState<DealerPayoutQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountNum = useMemo(() => Math.round(Number(amount) || 0), [amount]);
  const pending = requests.find((r) => r.status === 'requested') ?? null;
  const hasValidatedAccount = overview.account_status === 'validated';
  const minAmount = Math.max(overview.min_fcfa, 1);
  const canAsk =
    overview.eligible && overview.window_open && hasValidatedAccount && overview.requestable_fcfa >= minAmount && !pending && !readOnly;
  const quoteMethod = overview.payout_method ?? 'mobile_money';

  useEffect(() => {
    if (!open || amountNum < minAmount) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error: err } = await supabaseBrowser.rpc('dealer_payout_quote', { p_amount: amountNum, p_method: quoteMethod });
      if (cancelled) return;
      setQuote(err ? null : ((data ?? []) as DealerPayoutQuote[])[0] ?? null);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, amountNum, quoteMethod, minAmount]);

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabaseBrowser.rpc('dealer_save_payout_account', {
      p_method: method,
      p_provider: method === 'mobile_money' ? provider : null,
      p_account: account,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditAccount(false);
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (amountNum > overview.requestable_fcfa) {
      setError(`Vous pouvez demander ${fmt(overview.requestable_fcfa)} F au plus.`);
      return;
    }
    setBusy(true);
    const { error: err } = await supabaseBrowser.rpc('dealer_request_payout', { p_amount: amountNum, p_invoice_number: invoice });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setOpen(false);
    setInvoice('');
    router.refresh();
  }

  async function cancel(id: string) {
    if (!window.confirm('Annuler cette demande de versement ? Le montant redevient disponible.')) return;
    setBusy(true);
    const { error: err } = await supabaseBrowser.rpc('dealer_cancel_payout', { p_id: id });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-md space-y-md border-t border-neutral-100 pt-md">
      {/* Compte de paiement */}
      <div className="rounded-lg bg-neutral-50 p-md text-xs text-neutral-700 ring-1 ring-neutral-200">
        <p className={LABEL}>Compte de paiement</p>
        {overview.account_status === 'none' && !editAccount && (
          <p className="mt-xs leading-relaxed text-neutral-600">
            Enregistrez le compte qui recevra vos versements : TamCar le valide, puis vous pourrez demander vos versements.
          </p>
        )}
        {overview.payout_account && !editAccount && (
          <p className="mt-xs font-semibold text-neutral-900">
            {accountLabel(overview)}{' '}
            <span
              className={`ml-xs rounded-full px-sm py-0.5 text-[10px] font-bold ${
                hasValidatedAccount ? 'bg-primary-100 text-primary-700' : 'bg-warning/15 text-neutral-800'
              }`}
            >
              {hasValidatedAccount ? 'Validé' : 'En attente de validation par TamCar'}
            </span>
          </p>
        )}
        {!readOnly && !editAccount && (
          <button
            type="button"
            disabled={Boolean(pending)}
            onClick={() => {
              setEditAccount(true);
              setError(null);
            }}
            className="mt-xs text-[11px] font-semibold text-primary-700 underline disabled:opacity-50"
          >
            {overview.payout_account ? 'Modifier mon compte (à faire revalider)' : 'Enregistrer mon compte de paiement'}
          </button>
        )}
        {editAccount && (
          <form onSubmit={saveAccount} className="mt-sm space-y-sm">
            <div className="grid grid-cols-2 gap-sm">
              <label className="block">
                <span className={LABEL}>Mode</span>
                <select value={method} onChange={(e) => setMethod(e.target.value as 'mobile_money' | 'virement')} className={INPUT}>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="virement">Virement bancaire</option>
                </select>
              </label>
              {method === 'mobile_money' && (
                <label className="block">
                  <span className={LABEL}>Opérateur</span>
                  <select value={provider} onChange={(e) => setProvider(e.target.value as 'mtn' | 'moov')} className={INPUT}>
                    <option value="mtn">MTN</option>
                    <option value="moov">Moov</option>
                  </select>
                </label>
              )}
            </div>
            <label className="block">
              <span className={LABEL}>{method === 'mobile_money' ? 'Numéro Mobile Money' : 'Coordonnées bancaires (IBAN ou RIB)'}</span>
              <input
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder={method === 'mobile_money' ? '+229 97 00 00 00' : 'BJ66 …'}
                className={INPUT}
                required
              />
            </label>
            <div className="flex gap-sm">
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-sm text-sm font-bold text-white shadow-glow disabled:opacity-50"
              >
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditAccount(false);
                  setError(null);
                }}
                className="rounded-xl px-lg py-sm text-sm font-semibold text-neutral-500 hover:text-neutral-800"
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Conditions d'ouverture */}
      {!overview.eligible && (
        <p className="rounded-lg bg-neutral-100 p-md text-[11px] leading-relaxed text-neutral-600">
          {overview.eligible_from
            ? `Les demandes de versement s’ouvrent le ${dayFr(overview.eligible_from)}, ${overview.wait_months} mois après la première course de vos véhicules.`
            : 'Les demandes de versement s’ouvrent un mois après la première course de vos véhicules.'}
        </p>
      )}
      {overview.eligible && !overview.window_open && (
        <p className="rounded-lg bg-neutral-100 p-md text-[11px] leading-relaxed text-neutral-600">
          Les demandes de versement sont ouvertes du 1<sup>er</sup> au {overview.window_days} de chaque mois, pour les sommes acquises à la fin du mois écoulé. Prochaine
          ouverture : <strong>{dayFr(overview.next_window_start)}</strong>. Vous pourrez alors demander jusqu’à <strong>{fmt(overview.requestable_fcfa)} F</strong>.
        </p>
      )}
      {overview.eligible && overview.window_open && pending && (
        <p className="rounded-lg bg-warning/15 p-md text-[11px] leading-relaxed text-neutral-800">
          Demande en cours : {fmt(pending.amount_fcfa)} F demandés, {fmt(pending.net_fcfa)} F à recevoir. TamCar la traite et vous prévient.
        </p>
      )}
      {overview.eligible && overview.window_open && !pending && !hasValidatedAccount && !readOnly && (
        <p className="rounded-lg bg-neutral-100 p-md text-[11px] leading-relaxed text-neutral-600">
          Les demandes s’ouvrent dès que votre compte de paiement est validé par TamCar.
        </p>
      )}
      {overview.eligible && overview.window_open && !pending && hasValidatedAccount && overview.requestable_fcfa < minAmount && !readOnly && (
        <p className="rounded-lg bg-neutral-100 p-md text-[11px] leading-relaxed text-neutral-600">
          La part demandable ({fmt(overview.requestable_fcfa)} F, sommes acquises à la fin du mois écoulé) est inférieure au minimum d’une demande ({fmt(minAmount)} F).
        </p>
      )}

      {canAsk && !open && (
        <button
          type="button"
          onClick={() => {
            setAmount(String(overview.requestable_fcfa));
            setOpen(true);
            setError(null);
          }}
          className="w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-sm text-sm font-bold text-white shadow-glow"
        >
          Demander un versement ({fmt(overview.requestable_fcfa)} F demandables)
        </button>
      )}

      {canAsk && open && (
        <form onSubmit={submit} className="space-y-sm rounded-xl border border-neutral-200 bg-neutral-50 p-md">
          <label className="block">
            <span className={LABEL}>Montant demandé (F, hors taxes)</span>
            <input
              type="number"
              inputMode="numeric"
              min={minAmount}
              max={overview.requestable_fcfa}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={INPUT}
              required
            />
          </label>
          <label className="block">
            <span className={LABEL}>N° de la facture normalisée (obligatoire)</span>
            <input type="text" value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Numéro de votre facture" className={INPUT} required />
          </label>
          <p className="text-[11px] text-neutral-500">Versement sur : {accountLabel(overview)}</p>

          {quote && (
            <dl className="space-y-xs rounded-lg bg-white p-md text-xs ring-1 ring-neutral-200" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <div className="flex justify-between gap-md">
                <dt className="text-neutral-600">Montant de la facture (hors taxes)</dt>
                <dd className="font-semibold text-neutral-900">{fmt(quote.amount_fcfa)} F</dd>
              </div>
              <div className="flex justify-between gap-md">
                <dt className="text-neutral-600">
                  AIB retenu ({pctLabel(quote.aib_permille)}
                  {overview.aib_exempt ? ', exonération constatée' : overview.ifu ? ', avec identifiant fiscal' : ', sans identifiant fiscal'})
                </dt>
                <dd className="font-semibold text-neutral-900">− {fmt(quote.aib_fcfa)} F</dd>
              </div>
              <div className="flex justify-between gap-md">
                <dt className="text-neutral-600">Frais de transaction (à votre charge)</dt>
                <dd className="font-semibold text-neutral-900">− {fmt(quote.fee_fcfa)} F</dd>
              </div>
              <div className="flex justify-between gap-md border-t border-neutral-200 pt-xs">
                <dt className="font-bold text-neutral-900">Vous recevez</dt>
                <dd className="text-sm font-extrabold text-primary-700">{fmt(quote.net_fcfa)} F</dd>
              </div>
            </dl>
          )}

          {error && <p className="rounded-md bg-error/10 p-md text-xs text-error">{error}</p>}
          <div className="flex gap-sm">
            <button
              type="submit"
              disabled={busy || !quote || !invoice.trim()}
              className="flex-1 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-sm text-sm font-bold text-white shadow-glow disabled:opacity-50"
            >
              {busy ? 'Envoi…' : 'Envoyer la demande'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-xl px-lg py-sm text-sm font-semibold text-neutral-500 hover:text-neutral-800"
            >
              Annuler
            </button>
          </div>
        </form>
      )}
      {!open && !editAccount && error && <p className="rounded-md bg-error/10 p-md text-xs text-error">{error}</p>}
      {editAccount && error && <p className="rounded-md bg-error/10 p-md text-xs text-error">{error}</p>}

      <p className="text-[11px] leading-relaxed text-neutral-500">
        Chaque versement fait l’objet d’une facture normalisée, que vous établissez et nous remettez avec votre demande. TamCar retient l’AIB selon votre
        situation fiscale
        {overview.ifu ? '' : ' (3 % avec un identifiant fiscal, 5 % sans : communiquez le vôtre à TamCar)'} et les frais de transaction sont à votre charge.
      </p>

      {/* Demandes */}
      {requests.length > 0 && (
        <ul className="space-y-xs border-t border-neutral-100 pt-md">
          <li className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Mes demandes de versement</li>
          {requests.map((r) => (
            <li key={r.id} className="rounded-lg bg-neutral-50 p-sm text-xs text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <div className="flex items-baseline justify-between gap-sm">
                <span>
                  {dateFr(r.requested_at)}
                  {r.invoice_number && <span className="text-neutral-400"> · facture {r.invoice_number}</span>}
                </span>
                <span className={`rounded-full px-sm py-0.5 text-[10px] font-bold ${STATUS_STYLE[r.status]}`}>{PAYOUT_STATUS_LABEL[r.status]}</span>
              </div>
              <div className="mt-xs flex items-baseline justify-between gap-sm">
                <span className="text-neutral-500">
                  {fmt(r.amount_fcfa)} F demandés · AIB {fmt(r.aib_fcfa)} F · frais {fmt(r.fee_fcfa)} F
                </span>
                <strong className="text-neutral-900">{fmt(r.net_fcfa)} F</strong>
              </div>
              {r.status === 'rejected' && r.reason && <p className="mt-xs text-[11px] text-error">{r.reason}</p>}
              {r.status === 'paid' && r.reference && <p className="mt-xs text-[11px] text-neutral-500">Référence : {r.reference}</p>}
              {r.status === 'requested' && !readOnly && (
                <button type="button" disabled={busy} onClick={() => cancel(r.id)} className="mt-xs text-[11px] font-semibold text-error underline disabled:opacity-50">
                  Annuler la demande
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
