/**
 * TamCar Office — types et libellés du module RH & paie (phase 4).
 *
 * Rappel : toutes ces données sont réservées au fondateur (is_admin en
 * base). Les barèmes vivent dans bo_payroll_settings, jamais en dur ici.
 */

export type ContractType = 'cdi' | 'cdd' | 'stage' | 'prestation';
export type EmployeeStatus = 'actif' | 'sorti';
export type LeaveKind =
  | 'annuel'
  | 'maladie'
  | 'maternite'
  | 'sans_solde'
  | 'exceptionnel';
export type LeaveStatus = 'demande' | 'approuve' | 'refuse';
export type PayslipStatus = 'brouillon' | 'valide' | 'paye';

export type BoEmployee = {
  id: string;
  matricule: string;
  last_name: string;
  first_names: string;
  job_title: string | null;
  birth_date: string | null;
  id_card_no: string | null;
  id_card_expiry: string | null;
  phone: string | null;
  address: string | null;
  hired_on: string;
  contract_type: ContractType;
  contract_end_on: string | null;
  trial_end_on: string | null;
  gross_salary_fcfa: number;
  cnss_no: string | null;
  status: EmployeeStatus;
  exit_on: string | null;
  exit_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BoLeave = {
  id: string;
  employee_id: string;
  kind: LeaveKind;
  start_on: string;
  end_on: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decided_at: string | null;
  created_at: string;
};

export type BoPayslip = {
  id: string;
  employee_id: string;
  period: string;
  days_paid: number;
  days_in_month: number;
  gross_fcfa: number;
  cnss_employee_fcfa: number;
  taxable_fcfa: number;
  its_fcfa: number;
  ortb_fcfa: number;
  net_fcfa: number;
  cnss_employer_fcfa: number;
  vps_fcfa: number;
  status: PayslipStatus;
  entry_id: string | null;
  paid_entry_id: string | null;
  computed_at: string;
};

export type BoPayslipView = BoPayslip & {
  matricule: string;
  employee_name: string;
  job_title: string | null;
  cnss_no: string | null;
};

export type BoLeaveBalance = {
  employee_id: string;
  matricule: string;
  employee_name: string;
  hired_on: string;
  months_service: number;
  acquired_days: number;
  taken_days: number;
  balance_days: number;
};

export type BoHrAlert = {
  employee_id: string;
  matricule: string;
  employee_name: string;
  kind: 'periode_essai' | 'fin_cdd' | 'cni';
  label: string;
  due_date: string;
  days_left: number;
};

export const CONTRACT_LABELS: Record<ContractType, string> = {
  cdi: 'CDI',
  cdd: 'CDD',
  stage: 'Stage',
  prestation: 'Prestation de services',
};

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  actif: 'Actif',
  sorti: 'Sorti des effectifs',
};

export const LEAVE_KIND_LABELS: Record<LeaveKind, string> = {
  annuel: 'Congé annuel',
  maladie: 'Congé maladie',
  maternite: 'Congé de maternité',
  sans_solde: 'Congé sans solde',
  exceptionnel: 'Congé exceptionnel',
};

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  demande: 'Demandé',
  approuve: 'Approuvé',
  refuse: 'Refusé',
};

export const LEAVE_STATUS_STYLES: Record<LeaveStatus, string> = {
  demande: 'bg-warning/10 text-warning',
  approuve: 'bg-success/10 text-success',
  refuse: 'bg-neutral-100 text-neutral-500',
};

export const PAYSLIP_STATUS_LABELS: Record<PayslipStatus, string> = {
  brouillon: 'Brouillon',
  valide: 'Validé',
  paye: 'Payé',
};

export const PAYSLIP_STATUS_STYLES: Record<PayslipStatus, string> = {
  brouillon: 'bg-neutral-100 text-neutral-500',
  valide: 'bg-info/10 text-info',
  paye: 'bg-success/10 text-success',
};

export const ALERT_STYLES: Record<BoHrAlert['kind'], string> = {
  periode_essai: 'bg-warning/10 text-warning',
  fin_cdd: 'bg-error/10 text-error',
  cni: 'bg-info/10 text-info',
};

/** Mois d'une période au format « août 2026 ». */
export function formatPeriod(period: string): string {
  return new Date(`${period.slice(0, 7)}-01T00:00:00`).toLocaleDateString(
    'fr-FR',
    { month: 'long', year: 'numeric' },
  );
}

/** Valeur d'un `<input type="month">` (AAAA-MM) → 1er du mois. */
export function monthToPeriod(month: string): string {
  return `${month}-01`;
}

/** Nom d'affichage d'un employé. */
export function employeeName(e: {
  last_name: string;
  first_names: string;
}): string {
  return `${e.last_name} ${e.first_names}`;
}
