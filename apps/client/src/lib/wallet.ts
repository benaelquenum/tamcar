// Même fichier dans apps/client et apps/driver-portal : un compte peut avoir plusieurs portefeuilles (client + chauffeur + responsable),
// donc chaque écran doit connaître tous les types, sinon une ligne inconnue fait planter la page.
export type WalletKind = 'tamcar_credit' | 'tamcar_revenus' | 'tamcar_rachat' | 'tamcar_epargne' | 'tamcar_ops';

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
  | 'referral_bonus'
  | 'dealer_share_credit'
  | 'cash_commission'
  | 'debt_settlement'
  | 'insurance_premium'
  | 'tamassur_saving'
  | 'tamassur_withdrawal'
  | 'goodwill_credit'
  | 'tamassur_from_rachat'
  | 'performance_bonus'
  | 'approach_bonus'
  | 'floor_topup'
  | 'floor_refund'
  | 'ops_commission'
  | 'senteur_fee'
  | 'ops_payout'
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

// `icon` : clé d'une icône SVG (voir WalletKindIcon dans WalletView), jamais d'emoji.
export type WalletIconKey = 'wallet' | 'coins' | 'car' | 'chart' | 'badge';

type WalletKindMeta = { label: string; sub: string; gradient: string; icon: WalletIconKey };

const UNKNOWN_KIND: WalletKindMeta = {
  label: 'Portefeuille',
  sub: '',
  gradient: 'from-primary-500 to-primary-700',
  icon: 'wallet',
};

const KIND_META: Record<WalletKind, WalletKindMeta> = {
  tamcar_credit: {
    label: 'TamCar Crédit',
    sub: 'Solde pour payer vos courses',
    gradient: 'from-primary-500 to-primary-700',
    icon: 'wallet',
  },
  tamcar_revenus: {
    label: 'TamCar Revenus',
    sub: 'Cash gagné sur vos courses',
    gradient: 'from-violet-500 to-primary-700',
    icon: 'coins',
  },
  tamcar_rachat: {
    label: 'Fonds rachat véhicule',
    sub: 'Cession échelonnée · le véhicule est à vous au terme du contrat',
    gradient: 'from-gold to-warning',
    icon: 'car',
  },
  tamcar_ops: {
    label: 'Portefeuille responsable',
    sub: 'Commissions de responsable opérations',
    gradient: 'from-violet-500 to-primary-700',
    icon: 'chart',
  },
  tamcar_epargne: {
    label: 'TamAssur — Épargne',
    sub: 'Votre capital récupérable',
    gradient: 'from-success to-cyan',
    icon: 'badge',
  },
};

export function walletKindMeta(kind: string): WalletKindMeta {
  return KIND_META[kind as WalletKind] ?? UNKNOWN_KIND;
}

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
  referral_bonus: 'Bonus de parrainage',
  dealer_share_credit: 'Part partenaire véhicule',
  cash_commission: 'Commission course (encaissée en direct)',
  debt_settlement: 'Régularisation dette',
  insurance_premium: 'TamAssur (vers épargne)',
  tamassur_saving: 'Épargne TamAssur',
  tamassur_from_rachat: 'TamAssur (vers épargne)',
  performance_bonus: 'Bonus de performance',
  approach_bonus: 'Prime d\'approche',
  floor_topup: 'Versement du jour (complément)',
  floor_refund: 'Versement remboursé (jour non travaillé)',
  ops_commission: 'Commission responsable opérations',
  senteur_fee: 'Produits de senteur',
  ops_payout: 'Règlement responsable opérations',
  tamassur_withdrawal: 'Retrait épargne TamAssur',
  goodwill_credit: 'Crédit d\'excuse',
  adjustment: 'Ajustement admin',
};

const CREDIT_TYPES = new Set<WalletTxType>([
  'topup',
  'refund',
  'revenue_share_credit',
  'rachat_credit',
  'cancellation_reimbursement',
  'goodwill_credit',
  'change_return_in',
  'referral_bonus',
  'dealer_share_credit',
  'performance_bonus',
  'approach_bonus',
  'floor_refund',
  'ops_commission',
  'tamassur_saving',
  'debt_settlement',
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
