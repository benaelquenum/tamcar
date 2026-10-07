'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { BadgeIcon, CarIcon, ChartIcon, CoinsIcon, PlusIcon, WalletIcon } from '@/components/Icon';
import {
  formatFcfa,
  isCredit,
  txLabel,
  walletKindMeta,
  type Wallet,
  type WalletIconKey,
  type WalletTransaction,
} from '@/lib/wallet';
import { WalletModal, EpargneWithdrawModal } from './WalletModals';


type TamassurPending = { id: string; amount_fcfa: number; status: string; due_at: string } | null;

// Règle de retrait de l'épargne (calculée par la base : my_tamassur_withdrawal_status).
export type TamassurStatus = {
  start_date: string | null;
  eligible_on: string | null;
  epargne_fcfa: number;
  goal_fcfa: number;
  debt_fcfa: number;
  late_days: number;
  can_withdraw: boolean;
  reason: 'pending' | 'not_started' | 'too_early' | 'below_goal' | 'in_arrears' | 'ok';
};

function fmtLongDate(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

type Props = {
  wallets: Wallet[];
  transactions: WalletTransaction[];
  isDriver: boolean;
  driverApplicationType?: 'cession' | 'proprietaire' | null;
  tamassurPending?: TamassurPending;
  tamassurStatus?: TamassurStatus | null;
};

export function WalletView({
  wallets,
  transactions,
  isDriver,
  driverApplicationType,
  tamassurPending = null,
  tamassurStatus = null,
}: Props) {
  const [modal, setModal] = useState<'topup' | 'withdraw' | 'settle' | 'epargne' | null>(null);

  const creditWallet = wallets.find((w) => w.kind === 'tamcar_credit');
  const revenusWallet = wallets.find((w) => w.kind === 'tamcar_revenus');
  const epargneWallet = wallets.find((w) => w.kind === 'tamcar_epargne');

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
            revenusWallet.balance_fcfa < 0 ? (
              <BigWalletCard
                wallet={revenusWallet}
                actionLabel="Régler ma dette"
                onAction={() => setModal('settle')}
                note={`Vous devez ${formatFcfa(-revenusWallet.balance_fcfa)} F à TamCar. Régularisez pour repasser en ligne.`}
              />
            ) : (
              // Pas de retrait : vous encaissez vos courses en direct. Un solde
              // positif (courses TamCar Crédit) se compense automatiquement avec
              // les commissions de vos prochaines courses en espèces.
              <BigWalletCard
                wallet={revenusWallet}
                note="Solde compensé automatiquement avec les commissions de vos prochaines courses encaissées en direct."
              />
            )
          )}
          {/* TamAssur — épargne récupérable : retrait possible 2 ans après le démarrage, compte à jour ; paiement manuel jusqu'à 60 jours */}
          {isDriver && epargneWallet && (() => {
            const st = tamassurStatus;
            if (tamassurPending) {
              return (
                <BigWalletCard
                  wallet={epargneWallet}
                  note={`Retrait de ${formatFcfa(tamassurPending.amount_fcfa)} F en cours : l'équipe TamCar effectue le virement sous 60 jours au plus (avant le ${new Date(tamassurPending.due_at).toLocaleDateString('fr-FR')}).`}
                />
              );
            }
            if (st?.reason === 'ok') {
              return (
                <BigWalletCard
                  wallet={epargneWallet}
                  actionLabel="Demander mon retrait"
                  onAction={() => setModal('epargne')}
                  note="Votre demande est transmise à l'équipe TamCar, qui effectue le virement : jusqu'à 60 jours."
                />
              );
            }
            if (st?.reason === 'below_goal') {
              return (
                <BigWalletCard
                  wallet={epargneWallet}
                  note={`Retrait ouvert depuis le ${st.eligible_on ? fmtLongDate(st.eligible_on) : '—'}, dès ${formatFcfa(st.goal_fcfa)} F d'épargne : il vous manque encore ${formatFcfa(Math.max(0, st.goal_fcfa - st.epargne_fcfa))} F.`}
                />
              );
            }
            if (st?.reason === 'in_arrears') {
              return (
                <BigWalletCard
                  wallet={epargneWallet}
                  actionLabel="Régler ma dette"
                  onAction={() => setModal('settle')}
                  note={`Retrait ouvert depuis le ${st.eligible_on ? fmtLongDate(st.eligible_on) : '—'}, mais votre compte n'est pas à jour : ${
                    st.late_days > 0 ? `${st.late_days} jour${st.late_days > 1 ? 's' : ''} de retard (dimanches exclus), ` : ''
                  }${formatFcfa(st.debt_fcfa)} F à régler pour pouvoir demander votre retrait.`}
                />
              );
            }
            if (st?.reason === 'too_early' && st.eligible_on) {
              return (
                <BigWalletCard
                  wallet={epargneWallet}
                  note={`Retrait possible à partir du ${fmtLongDate(st.eligible_on)} (2 ans après le démarrage), dès ${formatFcfa(st.goal_fcfa)} F d'épargne et si votre compte est à jour. Paiement jusqu'à 60 jours après la demande.`}
                />
              );
            }
            return (
              <BigWalletCard
                wallet={epargneWallet}
                note={`Retrait possible 2 ans après le premier prélèvement${st ? `, dès ${formatFcfa(st.goal_fcfa)} F d'épargne` : ''} et si votre compte est à jour. Paiement jusqu'à 60 jours après la demande.`}
              />
            );
          })()}
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
        open={modal === 'settle'}
        onClose={() => setModal(null)}
        kind="settle"
        debt={revenusWallet ? Math.max(0, -revenusWallet.balance_fcfa) : 0}
      />
      <EpargneWithdrawModal
        open={modal === 'epargne'}
        onClose={() => setModal(null)}
        amount={epargneWallet?.balance_fcfa ?? 0}
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
  const meta = walletKindMeta(wallet.kind);
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${meta.gradient} p-lg text-white shadow-glow`}>
      <div className="flex items-start justify-between gap-md">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-white/80">{meta.label}</p>
          <p className="mt-xs text-xs text-white/80">{meta.sub}</p>
        </div>
        <WalletKindIcon icon={meta.icon} />
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

function WalletKindIcon({ icon }: { icon: WalletIconKey }) {
  const cls = 'h-8 w-8 text-white/90';
  return (
    <span aria-hidden className="flex-none">
      {icon === 'coins' ? <CoinsIcon className={cls} /> : icon === 'car' ? <CarIcon className={cls} /> : icon === 'chart' ? <ChartIcon className={cls} /> : icon === 'badge' ? <BadgeIcon className={cls} /> : <WalletIcon className={cls} />}
    </span>
  );
}

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const credit = isCredit(tx.type);
  const kindMeta = walletKindMeta(tx.wallet_kind);
  // Une recharge abandonnée ou refusée reste dans l'historique : elle ne doit pas ressembler à un crédit reçu.
  const waiting = tx.status === 'pending';
  const failed = tx.status === 'failed';
  const done = !waiting && !failed;
  return (
    <div className="flex items-center gap-md rounded-xl border border-neutral-200 bg-white p-md">
      <span className={`grid h-9 w-9 flex-none place-items-center rounded-full text-lg ${credit ? 'bg-primary-50' : 'bg-neutral-100'}`} aria-hidden>
        {credit ? '↓' : '↑'}
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-neutral-900">
          {txLabel(tx.type)}
          {waiting && <span className="ml-xs rounded-full bg-warning/15 px-sm py-0.5 text-[10px] font-bold text-warning">En attente</span>}
          {failed && <span className="ml-xs rounded-full bg-error/10 px-sm py-0.5 text-[10px] font-bold text-error">Non abouti</span>}
        </p>
        <p className="text-[10px] text-neutral-500">
          {kindMeta.label} · {new Date(tx.created_at).toLocaleString('fr-FR', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </div>
      <p
        className={`text-sm font-bold ${!done ? 'text-neutral-400 line-through' : credit ? 'text-primary-700' : 'text-neutral-900'}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {done ? (credit ? '+' : '−') : ''}{formatFcfa(Math.abs(tx.amount_fcfa))}
        <span className="ml-xs text-[10px] font-medium text-neutral-500">F</span>
      </p>
    </div>
  );
}
