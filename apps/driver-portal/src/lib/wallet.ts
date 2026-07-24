export type WalletKind = 'tamcar_credit' | 'tamcar_revenus' | 'tamcar_rachat';

export type WalletTxType =
  | 'topup'
  | 'payment'
  | 'withdrawal'
  | 'refund'
  | 'revenue_share_credit'
  | 'rachat_credit'
  | 'cancellation_fee'
  | 'cancellation_reimbursement'
  | 'change_return_in'
  | 'change_return_out'
  | 'dealer_share_credit'
  | 'adjustment';

export type Wallet = {
  id: string;
  kind: WalletKind;
  balance_fcfa: number;
};

export type WalletTransaction = {
  id: string;
  wallet_kind: WalletKind;
  type: WalletTxType;
  amount_fcfa: number;
  provider: 'mtn' | 'moov' | 'internal';
  status: 'pending' | 'success' | 'failed';
  ride_id: string | null;
  created_at: string;
};

export const WALLET_KIND_META: Record<WalletKind, { label: string; sub: string; gradient: string; icon: string }> = {
  tamcar_credit: {
    label: 'TamCar Crédit',
    sub: 'Solde pour payer tes courses',
    gradient: 'from-primary-500 to-primary-700',
    icon: '💳',
  },
  tamcar_revenus: {
    label: 'TamCar Revenus',
    sub: 'Cash gagné sur tes courses',
    gradient: 'from-violet-500 to-primary-700',
    icon: '💼',
  },
  tamcar_rachat: {
    label: 'Fonds rachat véhicule',
    sub: 'Cession échelonnée · 24 mois pour posséder ta voiture',
    gradient: 'from-gold to-warning',
    icon: '🔑',
  },
};

const TX_LABEL: Record<WalletTxType, string> = {
  topup: 'Recharge',
  payment: 'Paiement course',
  withdrawal: 'Retrait',
  refund: 'Remboursement',
  revenue_share_credit: 'Revenus course',
  rachat_credit: 'Fonds rachat course',
  cancellation_fee: 'Frais annulation',
  cancellation_reimbursement: 'Compensation annulation',
  change_return_in: 'Monnaie reçue',
  change_return_out: 'Monnaie rendue au client',
  dealer_share_credit: 'Part concessionnaire',
  adjustment: 'Ajustement admin',
};

const CREDIT_TYPES = new Set<WalletTxType>([
  'topup',
  'refund',
  'revenue_share_credit',
  'rachat_credit',
  'cancellation_reimbursement',
]);

export function txLabel(t: WalletTxType): string {
  return TX_LABEL[t] ?? t;
}

export function isCredit(t: WalletTxType): boolean {
  return CREDIT_TYPES.has(t);
}

export function formatFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}
