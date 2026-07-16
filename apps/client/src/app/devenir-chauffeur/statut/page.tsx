import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { CheckIcon } from '@/components/Icon';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  APPLICATION_TYPE_META,
  REQUIRED_DOCS,
  STATUS_META,
  formatSlotFull,
  type DriverAppointment,
} from '@/lib/appointment';
import { CancelAppointmentButton } from './CancelAppointmentButton';

export default async function StatutPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('my_appointment');
  const app = data as DriverAppointment | null;

  if (!app) redirect('/devenir-chauffeur');

  const meta = STATUS_META[app.status];
  const typeMeta = APPLICATION_TYPE_META[app.application_type];
  const isActive = app.status === 'scheduled' || app.status === 'confirmed';

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-64 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-70 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <Link
            href="/"
            aria-label="Retour à l'accueil"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
        </header>

        <h1 className="mt-xl text-2xl font-extrabold text-neutral-900">
          Mon rendez-vous chauffeur
        </h1>

        {/* Visitor number en gros */}
        <section className="mt-lg rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 p-lg text-white shadow-glow">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary-100">
            Ton numéro visiteur
          </p>
          <p
            className="mt-xs text-5xl font-extrabold leading-none"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {app.visitor_number}
          </p>
          <p className="mt-md text-xs opacity-90">
            Présente ce numéro à l&apos;accueil TamCar le jour du RDV.
          </p>
        </section>

        {/* Statut */}
        <div className={`mt-md rounded-2xl ${meta.color} p-lg`}>
          <p className="text-xs font-bold uppercase tracking-wider opacity-80">Statut</p>
          <p className="mt-xs text-xl font-extrabold">{meta.label}</p>
          <p className="mt-xs text-sm opacity-90">{meta.sub}</p>
        </div>

        {isActive && (
          <section className="mt-md rounded-xl border border-primary-200 bg-primary-50 p-lg">
            <p className="text-xs font-bold uppercase text-primary-700">Date et lieu</p>
            <p
              className="mt-xs text-base font-bold text-neutral-900"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatSlotFull(app.slot_at)}
            </p>
            <p className="mt-xs text-sm text-neutral-900">{app.location}</p>
          </section>
        )}

        {app.status === 'completed_rejected' && app.rejection_reason && (
          <div className="mt-md rounded-xl border border-error/30 bg-error/5 p-lg">
            <p className="text-xs font-bold uppercase text-error">Raison du refus</p>
            <p className="mt-xs text-sm text-neutral-900">{app.rejection_reason}</p>
            <Link
              href="/devenir-chauffeur/rdv"
              className="mt-md inline-block text-sm font-semibold text-primary-500 underline"
            >
              Reprendre un rendez-vous →
            </Link>
          </div>
        )}

        {app.status === 'completed_approved' && (
          <div className="mt-md rounded-xl border border-success/30 bg-success/5 p-lg text-center">
            <span className="grid mx-auto mb-md h-12 w-12 place-items-center rounded-full bg-success text-white">
              <CheckIcon className="h-6 w-6" strokeWidth={3} />
            </span>
            <p className="font-bold text-neutral-900">Bienvenue chez TamCar !</p>
            <p className="mt-xs text-xs text-neutral-600">
              Ton profil chauffeur est actif. Tu peux te connecter à ton espace chauffeur.
            </p>
            <a
              href={process.env.NEXT_PUBLIC_DRIVER_URL || 'http://localhost:3002'}
              className="mt-lg inline-block rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 px-xl py-md text-sm font-bold text-white shadow-glow"
            >
              Accéder à mon espace chauffeur →
            </a>
          </div>
        )}

        {(app.status === 'no_show' || app.status === 'cancelled_by_user') && (
          <div className="mt-md">
            <Link
              href="/devenir-chauffeur/rdv"
              className="inline-block rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 px-lg py-md text-sm font-bold text-white shadow-glow"
            >
              Reprendre un rendez-vous →
            </Link>
          </div>
        )}

        {/* Récap */}
        <section className="mt-2xl rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
          <h2 className="mb-md text-xs font-bold uppercase tracking-wider text-neutral-500">
            Récap de ta demande
          </h2>
          <dl className="space-y-sm text-sm">
            <Row label="Formule" value={typeMeta.label} />
            <Row label="Nom" value={`${app.first_name} ${app.last_name}`} />
            <Row label="Téléphone" value={app.phone} />
            {app.email && <Row label="Email" value={app.email} />}
            <Row label="Créneau" value={formatSlotFull(app.slot_at)} />
            <Row label="Adresse" value={app.location} />
          </dl>
        </section>

        {/* Rappel documents si RDV à venir */}
        {isActive && (
          <section className="mt-lg rounded-xl bg-neutral-100 p-lg">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              À apporter le jour du rendez-vous
            </h2>
            <ul className="mt-md space-y-xs text-sm text-neutral-900">
              {REQUIRED_DOCS.map((doc) => (
                <li key={doc}>• {doc}</li>
              ))}
            </ul>
          </section>
        )}

        {isActive && (
          <div className="mt-lg">
            <CancelAppointmentButton appointmentId={app.id} />
          </div>
        )}

        <div className="h-2xl" />
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-md">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="text-right font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}
