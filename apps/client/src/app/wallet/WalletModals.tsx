'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon } from '@/components/Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { formatFcfa } from '@/lib/wallet';
import { fetchPaymentsConfig, payWithMobileMoney, type Network, type PaymentsConfig } from '@/lib/payments';
import { MobileMoneyFields, WaitingForConfirmation } from '@/components/MobileMoneyFields';

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
  const [network, setNetwork] = useState<Network>('mtn');
  const [phone, setPhone] = useState('');
  const [cfg, setCfg] = useState<PaymentsConfig | null>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!open || kind !== 'topup') return;
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

  if (!open) return null;

  const realTopup = kind === 'topup' && !!cfg?.feexpay;

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
        if (cfg?.feexpay) {
          // Paiement réel FeexPay : demande de confirmation sur le téléphone du client, puis suivi du résultat (webhook +
          // confirmation directe). Voir lib/payments.ts.
          const outcome = await payWithMobileMoney({
            rpcName: 'initiate_fedapay_topup',
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
        } else if (cfg?.testMode) {
          // Paiement réel pas encore branché : recharge simulée (gratuite), réservée au mode TEST
          const { error: rpcErr } = await supabaseBrowser.rpc('topup_tamcar_credit', { amount_fcfa: amount, provider });
          if (rpcErr) { setError(rpcErr.message); return; }
        } else {
          setError('Le paiement Mobile Money n’est pas encore disponible. Réessayez plus tard.');
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
        // Retrait : demande enregistrée (montant réservé), payée par l'équipe TamCar ou par virement automatique.
        const { data: payoutData, error: reqErr } = await supabaseBrowser.rpc('request_driver_payout', {
          p_amount_fcfa: amount,
          p_provider: provider,
        });
        if (reqErr) {
          setError(reqErr.message);
          return;
        }
        const payout = (Array.isArray(payoutData) ? payoutData[0] : payoutData) as { id?: string } | null;
        if (!payout?.id) {
          setError('Retrait impossible pour le moment.');
          return;
        }
        const { data: fnData } = await supabaseBrowser.functions.invoke('feexpay-payout', {
          body: { payout_id: payout.id },
        });
        if ((fnData as { status?: string } | null)?.status === 'failed') {
          setError('Retrait refusé par l’opérateur — le montant a été recrédité.');
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
                ? (realTopup ? 'Paiement Mobile Money sécurisé (MTN, Moov, Celtiis).' : 'Recharge simulée (mode test).')
                : 'Vers votre Mobile Money · Simulation (intégration réelle à venir).'}
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
              {kind === 'topup' ? 'Crédit ajouté à votre compte' : 'Retrait effectué'}
            </p>
          </div>
        ) : (
          <>
            {kind === 'topup' && cfg && !cfg.feexpay && cfg.testMode && (
              <div className="mb-md rounded-md bg-warning/15 p-md text-xs font-bold text-warning">
                MODE TEST : cette recharge est simulée, aucun argent n&apos;est prélevé.
              </div>
            )}
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

            {realTopup && (
              <MobileMoneyFields network={network} onNetwork={setNetwork} phone={phone} onPhone={setPhone} disabled={pending} />
            )}

            <div className={`mt-lg ${realTopup ? 'hidden' : ''}`}>
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
              disabled={pending || amount < minAmount || (kind === 'topup' && !cfg) || (realTopup && phone.replace(/\D/g, '').length < 8)}
              className="mt-lg w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-base font-bold text-white shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? '…' : `${cta} ${formatFcfa(amount)} FCFA`}
            </button>
            {pending && waiting && <WaitingForConfirmation network={network} phone={phone} />}
            {pending && !waiting && (
              <p className="mt-md text-center text-xs text-neutral-600" role="status">
                Envoi de la demande de paiement…
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
