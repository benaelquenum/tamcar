'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { PlusIcon } from '@/components/Icon';
import {
  WALLET_KIND_META,
  formatFcfa,
  isCredit,
  txLabel,
  type Wallet,
  type WalletKind,
  type WalletTransaction,
} from '@/lib/wallet';
import { WalletModal } from './WalletModals';

type Props = {
  wallets: Wallet[];
  transactions: WalletTransaction[];
  isDriver: boolean;
  driverApplicationType?: 'cession' | 'proprietaire' | null;
};

export function WalletView({ wallets, transactions, isDriver, driverApplicationType }: Props) {
  const [modal, setModal] = useState<'topup' | 'withdraw' | null>(null);

  const creditWallet = wallets.find((w) => w.kind === 'tamcar_credit');
  const revenusWallet = wallets.find((w) => w.kind === 'tamcar_revenus');
  const rachatWallet = wallets.find((w) => w.kind === 'tamcar_rachat');

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-72 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-72 w-72 rounded-full bg-primary-100 opacity-70 blur-3xl" />
        <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <Link
            href={isDriver ? '/' : '/'}
            aria-label="Retour"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
        </header>

        <h1 className="mt-lg text-2xl font-extrabold text-neutral-900">
          Portefeuille
        </h1>

        {/* Wallet cards */}
        <div className="mt-lg space-y-md">
          {/* Client : TamCar Crédit (recharge Mobile Money) */}
          {!isDriver && creditWallet && (
            <BigWalletCard
              wallet={creditWallet}
              actionLabel="Recharger"
              onAction={() => setModal('topup')}
            />
          )}
          {/* Chauffeur : cash reçu → retirer sur Mobile Money */}
          {isDriver && revenusWallet && (
            <BigWalletCard
              wallet={revenusWallet}
              actionLabel="Retirer"
              onAction={() => setModal('withdraw')}
              disabled={revenusWallet.balance_fcfa < 500}
            />
          )}
          {/* Chauffeur formule A uniquement : fonds rachat */}
          {isDriver && driverApplicationType === 'cession' && rachatWallet && (
            <BigWalletCard wallet={rachatWallet} note="Débloqué au bout de 24 mois de service" />
          )}
        </div>

        {/* Historique */}
        <section className="mt-2xl">
          <h2 className="mb-md text-xs font-bold uppercase tracking-wider text-neutral-500">
            Dernières transactions
          </h2>
          {transactions.length === 0 ? (
            <div className="rounded-xl bg-neutral-100 p-xl text-center text-sm text-neutral-600">
              Aucune transaction encore.
            </div>
          ) : (
            <div className="space-y-xs">
              {transactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </div>
          )}
        </section>

        <div className="h-2xl" />
      </div>

      <WalletModal
        open={modal === 'topup'}
        onClose={() => setModal(null)}
        kind="topup"
      />
      <WalletModal
        open={modal === 'withdraw'}
        onClose={() => setModal(null)}
        kind="withdraw"
        availableBalance={revenusWallet?.balance_fcfa}
      />
    </main>
  );
}

function BigWalletCard({
  wallet,
  actionLabel,
  onAction,
  disabled,
  note,
}: {
  wallet: Wallet;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  note?: string;
}) {
  const meta = WALLET_KIND_META[wallet.kind];
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${meta.gradient} p-lg text-white shadow-glow`}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-white/80">{meta.label}</p>
          <p className="mt-xs text-xs text-white/80">{meta.sub}</p>
        </div>
        <span className="text-3xl" aria-hidden>{meta.icon}</span>
      </div>
      <p className="mt-lg text-4xl font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatFcfa(wallet.balance_fcfa)}
        <span className="ml-xs text-lg font-medium text-white/80">FCFA</span>
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="mt-md inline-flex items-center gap-xs rounded-md bg-white px-md py-sm text-sm font-bold text-neutral-900 shadow-md disabled:opacity-50"
        >
          <PlusIcon className="h-3 w-3" strokeWidth={3} />
          {actionLabel}
        </button>
      )}
      {note && <p className="mt-md text-[11px] text-white/85">{note}</p>}
    </div>
  );
}

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const credit = isCredit(tx.type);
  const kindMeta = WALLET_KIND_META[tx.wallet_kind];
  return (
    <div className="flex items-center gap-md rounded-xl border border-neutral-200 bg-white p-md">
      <span className={`grid h-9 w-9 flex-none place-items-center rounded-full text-lg ${credit ? 'bg-success/10' : 'bg-neutral-100'}`} aria-hidden>
        {credit ? '↓' : '↑'}
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-neutral-900">{txLabel(tx.type)}</p>
        <p className="text-[10px] text-neutral-500">
          {kindMeta.label} · {new Date(tx.created_at).toLocaleString('fr-FR', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </div>
      <p
        className={`text-sm font-bold ${credit ? 'text-success' : 'text-neutral-900'}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {credit ? '+' : '−'}{formatFcfa(tx.amount_fcfa)}
        <span className="ml-xs text-[10px] font-medium text-neutral-500">F</span>
      </p>
    </div>
  );
}
