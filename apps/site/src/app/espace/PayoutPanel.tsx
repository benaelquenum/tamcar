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

/**
 * Demande de versement de la part disponible (contrat de partenariat, article 9) : à tout moment, un mois après la première course de ses
 * véhicules ; frais de transaction à la charge du partenaire ; facture normalisée ; retenue d'AIB selon sa situation fiscale.
 * Les chiffres affichés viennent de la base (dealer_payout_quote) : le partenaire voit exactement ce qui lui sera versé avant de valider.
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
  const [amount, setAmount] = useState(String(overview.available_fcfa));
  const [method, setMethod] = useState<'mobile_money' | 'virement'>('mobile_money');
  const [provider, setProvider] = useState<'mtn' | 'moov'>('mtn');
  const [account, setAccount] = useState('');
  const [invoice, setInvoice] = useState('');
  const [quote, setQuote] = useState<DealerPayoutQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountNum = useMemo(() => Math.round(Number(amount) || 0), [amount]);
  const pending = requests.find((r) => r.status === 'requested') ?? null;
  const canAsk = overview.eligible && overview.available_fcfa >= Math.max(overview.min_fcfa, 1) && !pending && !readOnly;

  useEffect(() => {
    if (!open || amountNum < Math.max(overview.min_fcfa, 1)) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error: err } = await supabaseBrowser.rpc('dealer_payout_quote', { p_amount: amountNum, p_method: method });
      if (cancelled) return;
      if (err) {
        setQuote(null);
        return;
      }
      setQuote(((data ?? []) as DealerPayoutQuote[])[0] ?? null);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, amountNum, method, overview.min_fcfa]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (amountNum > overview.available_fcfa) {
      setError(`Votre part disponible est de ${fmt(overview.available_fcfa)} F.`);
      return;
    }
    setBusy(true);
    const { error: err } = await supabaseBrowser.rpc('dealer_request_payout', {
      p_amount: amountNum,
      p_method: method,
      p_account: account,
      p_provider: method === 'mobile_money' ? provider : null,
      p_invoice_number: invoice || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setOpen(false);
    setAccount('');
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

  const input =
    'w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500';
  const label = 'text-[10px] font-bold uppercase tracking-wider text-neutral-500';

  return (
    <div className="mt-md space-y-md border-t border-neutral-100 pt-md">
      {/* État de la demande */}
      {!overview.eligible && (
        <p className="rounded-lg bg-neutral-100 p-md text-[11px] leading-relaxed text-neutral-600">
          {overview.eligible_from
            ? `Les demandes de versement s’ouvrent le ${new Date(`${overview.eligible_from}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}, ${overview.wait_months} mois après la première course de vos véhicules.`
            : 'Les demandes de versement s’ouvrent un mois après la première course de vos véhicules.'}
        </p>
      )}
      {overview.eligible && pending && (
        <p className="rounded-lg bg-warning/15 p-md text-[11px] leading-relaxed text-neutral-800">
          Demande en cours : {fmt(pending.amount_fcfa)} F demandés, {fmt(pending.net_fcfa)} F à recevoir. TamCar la traite et vous prévient.
        </p>
      )}
      {overview.eligible && !pending && !canAsk && !readOnly && (
        <p className="rounded-lg bg-neutral-100 p-md text-[11px] leading-relaxed text-neutral-600">
          Votre part disponible ({fmt(overview.available_fcfa)} F) est inférieure au minimum d’une demande ({fmt(overview.min_fcfa)} F).
        </p>
      )}

      {canAsk && !open && (
        <button
          type="button"
          onClick={() => {
            setAmount(String(overview.available_fcfa));
            setOpen(true);
          }}
          className="w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-sm text-sm font-bold text-white shadow-glow"
        >
          Demander un versement
        </button>
      )}

      {canAsk && open && (
        <form onSubmit={submit} className="space-y-sm rounded-xl border border-neutral-200 bg-neutral-50 p-md">
          <label className="block">
            <span className={label}>Montant demandé (F, hors taxes)</span>
            <input
              type="number"
              inputMode="numeric"
              min={Math.max(overview.min_fcfa, 1)}
              max={overview.available_fcfa}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={input}
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-sm">
            <label className="block">
              <span className={label}>Mode</span>
              <select value={method} onChange={(e) => setMethod(e.target.value as 'mobile_money' | 'virement')} className={input}>
                <option value="mobile_money">Mobile Money</option>
                <option value="virement">Virement bancaire</option>
              </select>
            </label>
            {method === 'mobile_money' && (
              <label className="block">
                <span className={label}>Opérateur</span>
                <select value={provider} onChange={(e) => setProvider(e.target.value as 'mtn' | 'moov')} className={input}>
                  <option value="mtn">MTN</option>
                  <option value="moov">Moov</option>
                </select>
              </label>
            )}
          </div>

          <label className="block">
            <span className={label}>{method === 'mobile_money' ? 'Numéro Mobile Money' : 'Coordonnées bancaires (IBAN ou RIB)'}</span>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder={method === 'mobile_money' ? '+229 97 00 00 00' : 'BJ66 …'}
              className={input}
              required
            />
          </label>

          <label className="block">
            <span className={label}>N° de la facture normalisée</span>
            <input type="text" value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Exigé avant le versement" className={input} />
          </label>

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
              disabled={busy || !quote}
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
      {!open && error && <p className="rounded-md bg-error/10 p-md text-xs text-error">{error}</p>}

      <p className="text-[11px] leading-relaxed text-neutral-500">
        Chaque versement fait l’objet d’une facture normalisée. TamCar retient l’AIB selon votre situation fiscale
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
