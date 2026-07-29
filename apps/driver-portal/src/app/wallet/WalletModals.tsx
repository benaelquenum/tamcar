'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon } from '@/components/Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { formatFcfa } from '@/lib/wallet';

type ModalKind = 'topup' | 'withdraw' | 'settle';

type Props = {
  open: boolean;
  onClose: () => void;
  kind: ModalKind;
  availableBalance?: number;
  debt?: number;
};

const AMOUNT_CHIPS_TOPUP = [1000, 2000, 5000, 10000, 25000];
const AMOUNT_CHIPS_WITHDRAW = [5000, 10000, 25000, 50000, 100000];

export function WalletModal({ open, onClose, kind, availableBalance, debt }: Props) {
  const [amount, setAmount] = useState<number>(0);
  const [provider, setProvider] = useState<'mtn' | 'moov'>('mtn');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (open && kind === 'settle') setAmount(debt ?? 0);
  }, [open, kind, debt]);

  if (!open) return null;

  const chips =
    kind === 'topup' ? AMOUNT_CHIPS_TOPUP
    : kind === 'withdraw' ? AMOUNT_CHIPS_WITHDRAW
    : debt && debt > 0 ? [debt] : [];
  const title =
    kind === 'topup' ? 'Recharger TamCar Crédit'
    : kind === 'withdraw' ? 'Retirer mes revenus'
    : 'Régler ma dette';
  const cta = kind === 'topup' ? 'Recharger' : kind === 'withdraw' ? 'Retirer' : 'Régler';
  const minAmount = kind === 'topup' ? 100 : kind === 'withdraw' ? 500 : 1;
  const maxAmount = kind === 'settle' ? (debt ?? 0) : 500000;

  function submit() {
    if (amount < minAmount) {
      setError(`Minimum ${formatFcfa(minAmount)} FCFA.`);
      return;
    }
    if (kind === 'withdraw' && availableBalance != null && amount > availableBalance) {
      setError(`Solde insuffisant (${formatFcfa(availableBalance)} F).`);
      return;
    }
    if (kind === 'settle' && debt != null && amount > debt) {
      setError(`Dette de ${formatFcfa(debt)} F seulement.`);
      return;
    }

    setError(null);
    startTransition(async () => {
      if (kind === 'topup') {
        const { error: rpcErr } = await supabaseBrowser.rpc('topup_tamcar_credit', {
          amount_fcfa: amount,
          provider,
        });
        if (rpcErr) { setError(rpcErr.message); return; }
      } else if (kind === 'settle') {
        const { error: rpcErr } = await supabaseBrowser.rpc('settle_driver_debt', {
          p_amount: amount,
          p_provider: provider,
        });
        if (rpcErr) { setError(rpcErr.message); return; }
      } else {
        // Retrait réel : réserve (débite) le wallet puis déclenche le payout FedaPay.
        const { data, error: reqErr } = await supabaseBrowser.rpc('request_driver_payout', {
          p_amount_fcfa: amount,
          p_provider: provider,
        });
        if (reqErr) { setError(reqErr.message); return; }
        const payout = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
        if (!payout?.id) { setError('Retrait impossible pour le moment.'); return; }

        const { data: fnData, error: fnErr } = await supabaseBrowser.functions.invoke('fedapay-payout', {
          body: { payout_id: payout.id },
        });
        if (fnErr) {
          setError('Retrait en cours de traitement — vérifiez votre historique dans quelques minutes.');
          return;
        }
        const status = (fnData as { status?: string } | null)?.status;
        if (status === 'failed') {
          setError('Retrait refusé par l\'opérateur — le montant a été recrédité.');
          return;
        }
        // 'processing' ou 'sent' → confirmé par webhook
      }
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setAmount(0);
        router.refresh();
      }, 900);
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
                ? 'Simulation Mobile Money (intégration API réelle à venir).'
                : kind === 'settle'
                  ? 'Encaissement Mobile Money (FeexPay à venir). Régularise votre solde Revenus.'
                  : 'Vers votre Mobile Money · virement FedaPay. Le solde est débité puis recrédité si le virement échoue.'}
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
              {kind === 'topup' ? 'Crédit ajouté à votre compte' : kind === 'settle' ? 'Dette régularisée' : 'Retrait effectué'}
            </p>
          </div>
        ) : (
          <>
            <label className="mb-xs block text-sm font-semibold text-neutral-900">Montant</label>
            <div className="flex items-center overflow-hidden rounded-xl bg-neutral-100 shadow-sm ring-1 ring-neutral-200 transition focus-within:ring-2 focus-within:ring-primary-500">
              <input
                type="number"
                min={minAmount}
                max={maxAmount}
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
                  label="MTN Money"
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

export function EpargneWithdrawModal({
  open,
  onClose,
  amount,
}: {
  open: boolean;
  onClose: () => void;
  amount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  if (!open) return null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const { error: rpcErr } = await supabaseBrowser.rpc('request_tamassur_withdrawal', {
        p_amount: amount,
      });
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        router.refresh();
      }, 1200);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/50 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl">
        <div className="mb-lg flex items-start justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-neutral-900">Retirer mon épargne</h2>
            <p className="mt-xs text-xs text-neutral-600">Épargne TamAssur · capital récupérable</p>
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
            <span className="mx-auto mb-md grid h-12 w-12 place-items-center rounded-full bg-success text-white">
              <CheckIcon className="h-6 w-6" strokeWidth={3} />
            </span>
            <p className="text-xl font-bold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatFcfa(amount)} FCFA
            </p>
            <p className="mt-xs text-sm text-neutral-600">
              Demande enregistrée · paiement sous 30 jours
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-success/5 p-lg text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Montant retiré
              </p>
              <p className="mt-xs text-3xl font-extrabold text-success" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatFcfa(amount)}
                <span className="ml-xs text-base font-medium text-neutral-500">F</span>
              </p>
            </div>
            <p className="mt-md rounded-md bg-neutral-100 p-md text-xs text-neutral-700">
              TamCar vous règle <strong>sous 30 jours</strong> à compter de cette demande, en espèces
              ou par Mobile Money. Le montant est réservé dès maintenant.
            </p>
            {error && (
              <div className="mt-md rounded-md bg-error/10 p-md text-sm text-error">{error}</div>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="mt-lg w-full rounded-xl bg-gradient-to-r from-success to-cyan py-md text-base font-bold text-white shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? '…' : 'Confirmer le retrait'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
