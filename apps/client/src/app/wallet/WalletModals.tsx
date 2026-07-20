'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon } from '@/components/Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { formatFcfa } from '@/lib/wallet';
import { launchFedapayCheckout } from '@/lib/fedapay';

const FEDAPAY_PUBLIC_KEY = process.env.NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY;

type ModalKind = 'topup' | 'withdraw';

type Props = {
  open: boolean;
  onClose: () => void;
  kind: ModalKind;
  availableBalance?: number;
};

const AMOUNT_CHIPS_TOPUP = [1000, 2000, 5000, 10000, 25000];
const AMOUNT_CHIPS_WITHDRAW = [5000, 10000, 25000, 50000, 100000];

export function WalletModal({ open, onClose, kind, availableBalance }: Props) {
  const [amount, setAmount] = useState<number>(0);
  const [provider, setProvider] = useState<'mtn' | 'moov'>('mtn');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  if (!open) return null;

  const chips = kind === 'topup' ? AMOUNT_CHIPS_TOPUP : AMOUNT_CHIPS_WITHDRAW;
  const title = kind === 'topup' ? 'Recharger TamCar Crédit' : 'Retirer mes revenus';
  const cta = kind === 'topup' ? 'Recharger' : 'Retirer';
  const minAmount = kind === 'topup' ? 100 : 500;

  function submit() {
    if (amount < minAmount) {
      setError(`Minimum ${formatFcfa(minAmount)} FCFA.`);
      return;
    }
    if (kind === 'withdraw' && availableBalance != null && amount > availableBalance) {
      setError(`Solde insuffisant (${formatFcfa(availableBalance)} F).`);
      return;
    }

    setError(null);
    startTransition(async () => {
      if (kind === 'topup') {
        // Flow FedaPay : initie une transaction pending côté DB,
        // ouvre le widget, attend le webhook via polling.
        if (!FEDAPAY_PUBLIC_KEY) {
          setError('Recharge indisponible (config FedaPay manquante).');
          return;
        }
        const { data, error: initErr } = await supabaseBrowser.rpc('initiate_fedapay_topup', {
          p_amount_fcfa: amount,
        });
        if (initErr || !Array.isArray(data) || !data[0]) {
          setError(initErr?.message ?? 'Impossible d\'initier la recharge');
          return;
        }
        const ref = (data[0] as { reference: string }).reference;

        // Pré-remplir customer avec les infos du user (évite "undefined" dans le widget)
        const { data: { user } } = await supabaseBrowser.auth.getUser();
        const { data: profileRows } = await supabaseBrowser
          .from('profiles')
          .select('full_name, phone')
          .eq('id', user?.id ?? '')
          .limit(1);
        const profile = Array.isArray(profileRows) ? profileRows[0] as { full_name?: string; phone?: string } | undefined : undefined;
        const fullName = profile?.full_name?.trim() ?? '';
        const parts = fullName.split(/\s+/);
        const firstName = parts[0] || undefined;
        const lastName = parts.slice(1).join(' ') || undefined;
        const email = user?.email || undefined;

        await launchFedapayCheckout({
          publicKey: FEDAPAY_PUBLIC_KEY,
          amountFcfa: amount,
          reference: ref,
          customerEmail: email,
          customerFirstName: firstName,
          customerLastName: lastName,
        });
        // Toujours poll — la source de vérité est le webhook, pas l'onComplete
        // (l'user peut fermer la fenêtre après avoir validé MoMo).
        let finalStatus: string | null = null;
        for (let i = 0; i < 45; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const { data: rows } = await supabaseBrowser
            .from('wallet_transactions')
            .select('status')
            .eq('fedapay_reference', ref)
            .limit(1);
          const s = Array.isArray(rows) ? (rows[0] as { status?: string } | undefined)?.status : undefined;
          if (s === 'success' || s === 'failed') { finalStatus = s; break; }
        }
        if (finalStatus === 'failed') {
          setError('Paiement refusé');
          return;
        }
        if (finalStatus !== 'success') {
          setError('Paiement en attente de confirmation — vérifie ton portefeuille dans quelques minutes.');
          return;
        }
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setAmount(0);
          router.refresh();
        }, 900);
      } else {
        // Withdraw : reste sur le flow simulé pour l'instant
        const { error: rpcErr } = await supabaseBrowser.rpc('withdraw_tamcar_revenus', {
          amount_fcfa: amount,
          provider,
        });
        if (rpcErr) {
          setError(rpcErr.message);
          return;
        }
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setAmount(0);
          router.refresh();
        }, 900);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/50 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl">
        <div className="mb-lg flex items-start justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-neutral-900">{title}</h2>
            <p className="mt-xs text-xs text-neutral-600">
              {kind === 'topup'
                ? 'Paiement sécurisé via FedaPay (MTN, Moov, carte).'
                : 'Vers ton Mobile Money · Simulation (intégration réelle à venir).'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-xs text-neutral-400 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="rounded-xl bg-success/10 p-xl text-center">
            <span className="grid mx-auto mb-md h-12 w-12 place-items-center rounded-full bg-success text-white">
              <CheckIcon className="h-6 w-6" strokeWidth={3} />
            </span>
            <p className="text-xl font-bold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatFcfa(amount)} FCFA
            </p>
            <p className="mt-xs text-sm text-neutral-600">
              {kind === 'topup' ? 'Crédit ajouté à ton compte' : 'Retrait effectué'}
            </p>
          </div>
        ) : (
          <>
            <label className="mb-xs block text-sm font-semibold text-neutral-900">Montant</label>
            <div className="flex items-center overflow-hidden rounded-xl bg-neutral-100 shadow-sm ring-1 ring-neutral-200 transition focus-within:ring-2 focus-within:ring-primary-500">
              <input
                type="number"
                min={minAmount}
                max={500000}
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                placeholder={`${formatFcfa(minAmount)}`}
                className="flex-1 bg-transparent px-lg py-md text-right text-xl font-extrabold text-neutral-900 outline-none placeholder:text-neutral-300"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
              <span className="pr-lg text-sm font-semibold text-neutral-600">FCFA</span>
            </div>

            <div className="mt-md flex flex-wrap gap-xs">
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAmount(c)}
                  className="rounded-full bg-neutral-100 px-md py-xs text-xs font-semibold text-neutral-900 hover:bg-primary-100 hover:text-primary-700"
                >
                  {formatFcfa(c)}
                </button>
              ))}
            </div>

            <div className="mt-lg">
              <label className="mb-xs block text-sm font-semibold text-neutral-900">Via</label>
              <div className="grid grid-cols-2 gap-sm">
                <ProviderChoice
                  active={provider === 'mtn'}
                  onClick={() => setProvider('mtn')}
                  label="MTN MoMo"
                  sub="+229 6X XX XX XX"
                />
                <ProviderChoice
                  active={provider === 'moov'}
                  onClick={() => setProvider('moov')}
                  label="Moov Money"
                  sub="+229 9X XX XX XX"
                />
              </div>
            </div>

            {error && (
              <div className="mt-md rounded-md bg-error/10 p-md text-sm text-error">{error}</div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={pending || amount < minAmount}
              className="mt-lg w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-base font-bold text-white shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? '…' : `${cta} ${formatFcfa(amount)} FCFA`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ProviderChoice({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-2 p-md text-left transition ${
        active ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 bg-white hover:border-primary-300'
      }`}
    >
      <p className="text-sm font-bold text-neutral-900">{label}</p>
      <p className="text-[10px] text-neutral-600">{sub}</p>
    </button>
  );
}
