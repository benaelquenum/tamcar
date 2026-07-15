export type DriverApplicationStatus = 'submitted' | 'in_review' | 'approved' | 'rejected';

export type DriverApplication = {
  id: string;
  profile_id: string;
  status: DriverApplicationStatus;
  first_name: string;
  last_name: string;
  phone: string;
  id_card_url: string;
  driver_license_url: string;
  dealer_company_name: string;
  dealer_rccm: string | null;
  vehicle_plate: string;
  vehicle_brand: string;
  vehicle_model: string;
  vehicle_year: number | null;
  vehicle_color: string | null;
  vehicle_seats: number;
  vehicle_category: 'essentiel' | 'confort' | 'premium';
  vehicle_registration_url: string;
  created_at: string;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
};

export const STATUS_META: Record<DriverApplicationStatus, { label: string; color: string; sub: string }> = {
  submitted: {
    label: 'Candidature envoyée',
    color: 'bg-primary-500 text-white',
    sub: 'On examine ton dossier. Réponse sous 48h en semaine.',
  },
  in_review: {
    label: 'En examen',
    color: 'bg-gold text-neutral-900',
    sub: 'L\'équipe TamCar étudie tes documents.',
  },
  approved: {
    label: 'Approuvée',
    color: 'bg-success text-white',
    sub: 'Bienvenue ! Tu peux te connecter à ton espace chauffeur.',
  },
  rejected: {
    label: 'Refusée',
    color: 'bg-error text-white',
    sub: 'Consulte la raison ci-dessous et postule à nouveau si besoin.',
  },
};
