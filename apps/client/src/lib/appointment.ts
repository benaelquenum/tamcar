export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'no_show'
  | 'completed_approved'
  | 'completed_rejected'
  | 'cancelled_by_user';

export type DriverApplicationType = 'cession' | 'proprietaire';

export type DriverAppointment = {
  id: string;
  visitor_number: string;
  profile_id: string | null;
  application_type: DriverApplicationType;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  slot_at: string;
  location: string;
  status: AppointmentStatus;
  approved_at: string | null;
  approved_by: string | null;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type AvailableSlot = {
  slot_at: string;
  day_label: string;
};

export const STATUS_META: Record<AppointmentStatus, { label: string; color: string; sub: string }> = {
  scheduled: {
    label: 'Rendez-vous pris',
    color: 'bg-primary-500 text-white',
    sub: 'Ton créneau est réservé. Viens avec tes documents.',
  },
  confirmed: {
    label: 'Confirmé',
    color: 'bg-gold text-neutral-900',
    sub: 'RDV confirmé par SMS. À bientôt !',
  },
  no_show: {
    label: 'Absent au RDV',
    color: 'bg-neutral-500 text-white',
    sub: 'Tu peux reprendre un nouveau rendez-vous quand tu veux.',
  },
  completed_approved: {
    label: 'Validé',
    color: 'bg-success text-white',
    sub: 'Ton profil chauffeur est actif. Bienvenue !',
  },
  completed_rejected: {
    label: 'Refusé',
    color: 'bg-error text-white',
    sub: 'Consulte la raison ci-dessous et postule à nouveau si tu veux.',
  },
  cancelled_by_user: {
    label: 'Annulé',
    color: 'bg-neutral-400 text-white',
    sub: 'Tu peux reprendre un rendez-vous quand tu veux.',
  },
};

export const APPLICATION_TYPE_META: Record<DriverApplicationType, { label: string; sub: string; split: string }> = {
  cession: {
    label: 'Formule Cession',
    sub: 'TamCar te fournit la voiture, tu la possèdes en 24 mois (36 si neuve)',
    split: '40% cash · 10% rachat · 30% concession · 20% plateforme · bonus 5% dès la 16e course/jour',
  },
  proprietaire: {
    label: 'Formule Propriétaire',
    sub: 'Tu viens avec ta propre voiture et roules librement',
    split: '80% cash · 20% plateforme · bonus 10% plafonné 100 F/course',
  },
};

export const REQUIRED_DOCS = [
  'CIP ou Carte biométrique CEDEAO (recto + verso)',
  'Permis de conduire en cours de validité',
  'Attestation de résidence',
  'Carte grise du véhicule',
  'Assurance auto valide',
  'Visite technique à jour',
];

export const TAMCAR_RDV_ADDRESS = 'Ilot 2054, M/HOUNGBEDJI, Mènontin Cotonou';

const DAY_FMT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
});
const TIME_FMT = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});
const FULL_FMT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatSlotDay(iso: string): string {
  return DAY_FMT.format(new Date(iso));
}
export function formatSlotTime(iso: string): string {
  return TIME_FMT.format(new Date(iso));
}
export function formatSlotFull(iso: string): string {
  return FULL_FMT.format(new Date(iso));
}
