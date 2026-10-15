'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon } from '@/components/Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { formatFcfa } from '@/lib/wallet';
import { fetchPaymentsConfig, payWithMobileMoney, type Network, type PaymentsConfig } from '@/lib/payments';
import { MobileMoneyFields, WaitingForConfirmation } from '@/components/MobileMoneyFields';

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
  const [result, setResult] = useState<'paid' | 'processing' | 'manual' | null>(null);
  const [network, setNetwork] = useState<Network>('mtn');
  const [phone, setPhone] = useState('');
  const [cfg, setCfg] = useState<PaymentsConfig | null>(null);
  const [waiting, setWaiting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open || kind === 'withdraw') return;
    let alive = true;
    fetchPaymentsConfig().then((c) => { if (alive) setCfg(c); });
    // Numéro du compte comme valeur par défaut (modifiable : le numéro Mobile Money peut être un autre)
    supabaseBrowser.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: rows } = await supabaseBrowser.from('profiles').select('phone').eq('id', data.user.id).limit(1);
      const p = (Array.isArray(rows) ? rows[0] : null) as { phone?: string | null } | null;
      const national = p?.phone ? p.phone.replace(/^\+?229/, '') : '';
      if (alive && national) setPhone((cur) => cur || national);
    });
    return () => { alive = false; };
  }, [open, kind]);

  useEffect(() => {
    if (open && kind === 'settle') setAmount(Math.max(debt ?? 0, cfg?.feexpay ? 100 : 0));
  }, [open, kind, debt, cfg?.feexpay]);

  if (!open) return null;

  // Paiement Mobile Money réel (FeexPay) pour la recharge et le règlement de dette ; le retrait reste manuel
  const real = kind !== 'withdraw' && !!cfg?.feexpay;

  const chips =
    kind === 'topup' ? AMOUNT_CHIPS_TOPUP
    : kind === 'withdraw' ? AMOUNT_CHIPS_WITHDRAW
    : debt && debt > 0 ? [debt] : [];
  const title =
    kind === 'topup' ? 'Recharger TamCar Crédit'
    : kind === 'withdraw' ? 'Retirer mes revenus'
    : 'Régler ma dette';
  const cta = kind === 'topup' ? 'Recharger' : kind === 'withdraw' ? 'Retirer' : 'Régler';
  const minAmount = kind === 'topup' ? 100 : kind === 'withdraw' ? 500 : cfg?.feexpay ? 100 : 1;
  const maxAmount = kind === 'settle' ? Math.max(debt ?? 0, cfg?.feexpay ? 100 : 0) : 500000;

  function submit() {
    if (amount < minAmount) {
      setError(`Minimum ${formatFcfa(minAmount)} FCFA.`);
      return;
    }
    if (kind === 'withdraw' && availableBalance != null && amount > availableBalance) {
      setError(`Solde insuffisant (${formatFcfa(availableBalance)} F).`);
      return;
    }
    if (kind === 'settle' && debt != null && amount > maxAmount) {
      setError(`Dette de ${formatFcfa(debt)} F seulement.`);
      return;
    }

    setError(null);
    startTransition(async () => {
      if (kind === 'topup' || kind === 'settle') {
        if (cfg?.feexpay) {
          // Paiement réel (FeexPay) : demande de confirmation sur le téléphone ; le crédit du portefeuille (et, pour une dette,
          // la réactivation du compte) se fait à la réception du résultat (webhook / confirmation directe). Voir lib/payments.ts.
          const outcome = await payWithMobileMoney({
            rpcName: kind === 'topup' ? 'initiate_fedapay_topup' : 'initiate_fedapay_debt',
            amountFcfa: amount,
            network,
            phone,
            onWaiting: () => setWaiting(true),
          });
          setWaiting(false);
          if (outcome.status === 'error') { setError(outcome.message); return; }
          if (outcome.status === 'failed') { setError(outcome.reason); return; }
          if (outcome.status === 'pending') {
            setError('Paiement en attente de confirmation : votre solde se mettra à jour dès que vous aurez confirmé sur votre téléphone.');
            return;
          }
        } else if (kind === 'topup') {
          // Paiement réel pas encore branché (mode test) : recharge simulée, gratuite
          const { error: rpcErr } = await supabaseBrowser.rpc('topup_tamcar_credit', {
            amount_fcfa: amount,
            provider,
          });
          if (rpcErr) { setError(rpcErr.message); return; }
        } else {
          // Paiement réel pas encore branché (mode test) : règlement simulé, gratuit
          const { error: rpcErr } = await supabaseBrowser.rpc('settle_driver_debt', {
            p_amount: amount,
            p_provider: provider,
          });
          if (rpcErr) { setError(rpcErr.message); return; }
        }
      } else {
        // Retrait réel : réserve (débite) le wallet, puis la fonction FeexPay envoie le virement si le réglage « virement
        // automatique » est actif et que le retrait respecte les règles de validation ; sinon TamCar le paie à la main.
        const { data, error: reqErr } = await supabaseBrowser.rpc('request_driver_payout', {
          p_amount_fcfa: amount,
          p_provider: provider,
        });
        if (reqErr) { setError(reqErr.message); return; }
        const payout = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
        if (!payout?.id) { setError('Retrait impossible pour le moment.'); return; }

        const { data: fnData, error: fnErr } = await supabaseBrowser.functions.invoke('feexpay-payout', {
          body: { payout_id: payout.id },
        });
        if (fnErr) {
          // La demande est enregistrée et le montant réservé : l'équipe la traite (ou la vérification automatique, si le virement est parti)
          setResult('manual');
        } else {
          const status = (fnData as { status?: string } | null)?.status;
          if (status === 'failed') {
            setError('Retrait refusé par l\'opérateur — le montant a été recrédité.');
            return;
          }
          // 'paid' : envoyé et confirmé ; 'processing' : parti, confirmation en cours ; 'manual' / 'hold' : TamCar le paie (ou le valide d'abord)
          setResult(status === 'paid' ? 'paid' : status === 'processing' ? 'processing' : 'manual');
        }
      }
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setResult(null);
        setAmount(0);
        router.refresh();
      }, kind === 'withdraw' ? 2600 : 900);
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
                ? (real ? 'Paiement Mobile Money sécurisé (MTN, Moov, Celtiis).' : 'Simulation Mobile Money (mode test).')
                : kind === 'settle'
                  ? (real ? 'Paiement Mobile Money sécurisé (MTN, Moov, Celtiis). Votre compte est réactivé automatiquement dès la réception.' : 'Règlement simulé (mode test).')
                  : 'Vers votre Mobile Money. Le solde est débité puis recrédité si le virement échoue.'}
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
              {kind === 'topup' ? 'Crédit ajouté à votre compte' : kind === 'settle' ? 'Dette régularisée' : result === 'paid' ? 'Retrait envoyé sur votre Mobile Money' : result === 'processing' ? 'Retrait en cours : vous recevrez la confirmation de votre opérateur dans quelques instants' : result === 'manual' ? 'Demande envoyée : TamCar vous paie sous 24 h' : 'Retrait demandé'}
            </p>
          </div>
        ) : (
          <>
            {kind !== 'withdraw' && cfg && !cfg.feexpay && (
              <div className="mb-md rounded-md bg-warning/15 p-md text-xs font-bold text-warning">
                MODE TEST : {kind === 'settle' ? 'ce règlement' : 'cette recharge'} est simulé{kind === 'settle' ? '' : 'e'}, aucun argent n&apos;est prélevé.
              </div>
            )}
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

            {real && (
              <MobileMoneyFields network={network} onNetwork={setNetwork} phone={phone} onPhone={setPhone} disabled={pending} />
            )}

            <div className={`mt-lg ${real ? 'hidden' : ''}`}>
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
              disabled={pending || amount < minAmount || (kind !== 'withdraw' && !cfg) || (real && phone.replace(/\D/g, '').length < 8)}
              className="mt-lg w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-base font-bold text-white shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? '…' : `${cta} ${formatFcfa(amount)} FCFA`}
            </button>
            {pending && waiting && <WaitingForConfirmation network={network} phone={phone} />}
            {pending && !waiting && (
              <p className="mt-md text-center text-xs text-neutral-600" role="status">
                {real ? 'Envoi de la demande de paiement…' : 'Traitement en cours…'}
              </p>
            )}
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
            <p className="mt-xs text-xs text-neutral-600">Épargne TamAssur · garantie TamCar</p>
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
              Demande enregistrée · paiement sous 60 jours au plus
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
              Votre demande est transmise à l&apos;équipe TamCar, qui effectue le virement (espèces ou
              Mobile Money) <strong>sous 60 jours au plus</strong> à compter d&apos;aujourd&apos;hui. Le montant est
              réservé dès maintenant.
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
              {pending ? '…' : 'Confirmer ma demande de retrait'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
