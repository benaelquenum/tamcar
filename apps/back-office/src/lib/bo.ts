/**
 * TamCar Office — types et libellés partagés du back-office.
 */

export type BoDocKind =
  | 'courrier_arrivee'
  | 'courrier_depart'
  | 'piece_comptable'
  | 'contrat'
  | 'administratif'
  | 'autre';

export type BoDocStatus = 'a_traiter' | 'en_cours' | 'traite' | 'archive';

export type BoDocument = {
  id: string;
  kind: BoDocKind;
  reg_number: string;
  title: string;
  correspondent: string | null;
  doc_date: string | null;
  logged_on: string;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  status: BoDocStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BoDeadline = {
  id: string;
  label: string;
  category: string;
  due_date: string;
  amount_fcfa: number | null;
  recurrence: 'none' | 'monthly' | 'quarterly' | 'yearly';
  notes: string | null;
  status: 'pending' | 'done';
  done_at: string | null;
  created_at: string;
};

export const DOC_KIND_LABELS: Record<BoDocKind, string> = {
  courrier_arrivee: 'Courrier arrivée',
  courrier_depart: 'Courrier départ',
  piece_comptable: 'Pièce comptable',
  contrat: 'Contrat',
  administratif: 'Document administratif',
  autre: 'Autre document',
};

export const DOC_STATUS_LABELS: Record<BoDocStatus, string> = {
  a_traiter: 'À traiter',
  en_cours: 'En cours',
  traite: 'Traité',
  archive: 'Archivé',
};

export const DOC_STATUS_STYLES: Record<BoDocStatus, string> = {
  a_traiter: 'bg-warning/10 text-warning',
  en_cours: 'bg-info/10 text-info',
  traite: 'bg-success/10 text-success',
  archive: 'bg-neutral-100 text-neutral-500',
};

export const DEADLINE_CATEGORIES = [
  'Fiscal',
  'Social (CNSS)',
  'ANATT',
  'Assurances',
  'Visites techniques',
  'Juridique (AG, dépôts)',
  'Loyers',
  'Autre',
] as const;

export const RECURRENCE_LABELS: Record<BoDeadline['recurrence'], string> = {
  none: 'Ponctuelle',
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  yearly: 'Annuelle',
};

export function formatFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/ /g, ' ').replace(/,/g, ' ');
}

export function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
