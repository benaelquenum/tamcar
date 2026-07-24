import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  REQUIRED_DOCS,
  TAMCAR_RDV_ADDRESS,
  type AvailableSlot,
  type DriverAppointment,
} from '@/lib/appointment';
import { BookingForm } from './BookingForm';

export default async function RdvPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login?next=/devenir-chauffeur/rdv');

  const supabase = createServerSupabase();

  // RDV existant → redirect vers statut
  const { data: existing } = await supabase.rpc('my_appointment');
  const existingApp = existing as DriverAppointment | null;
  if (
    existingApp &&
    (existingApp.status === 'scheduled' || existingApp.status === 'confirmed')
  ) {
    redirect('/devenir-chauffeur/statut');
  }

  // Charger 30 jours de créneaux disponibles
  const { data: slotsData, error: slotsError } = await supabase.rpc(
    'available_slots',
    { days_ahead: 30 },
  );
  const slots = ((slotsData ?? []) as AvailableSlot[]).map((s) => ({
    slot_at: s.slot_at,
    day_label: s.day_label,
  }));

  // L'e-mail vit sur auth.users, pas sur le profil — on le récupère pour préremplir.
  const { data: { user } } = await supabase.auth.getUser();

  const prefill = {
    first_name: profile.full_name?.split(' ')[0] ?? '',
    last_name: profile.full_name?.split(' ').slice(1).join(' ') ?? '',
    phone: profile.phone ?? '',
    email: user?.email ?? '',
  };

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-64 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-70 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <Link
            href="/devenir-chauffeur"
            aria-label="Retour"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
        </header>

        <h1 className="mt-xl text-3xl font-extrabold leading-tight text-neutral-900">
          Prends ton rendez-vous
        </h1>
        <p className="mt-xs text-sm text-neutral-600">
          Choisis ta formule et un créneau. Tu recevras un numéro de visiteur pour
          l&apos;accueil.
        </p>

        {slotsError && (
          <div className="mt-lg rounded-xl bg-error/10 p-lg">
            <p className="text-sm font-bold text-error">Erreur créneaux</p>
            <p className="mt-xs text-xs text-neutral-600">{slotsError.message}</p>
          </div>
        )}

        <BookingForm slots={slots} prefill={prefill} />

        <section className="mt-2xl rounded-xl bg-neutral-100 p-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            À apporter au rendez-vous
          </h2>
          <ul className="mt-md space-y-xs text-sm text-neutral-900">
            {REQUIRED_DOCS.map((doc) => (
              <li key={doc}>• {doc}</li>
            ))}
          </ul>
          <div className="mt-md rounded-lg border border-primary-100 bg-primary-50 p-md">
            <p className="text-[10px] font-bold uppercase text-primary-700">Adresse TamCar</p>
            <p className="mt-xs text-sm font-semibold text-neutral-900">
              {TAMCAR_RDV_ADDRESS}
            </p>
          </div>
        </section>

        <div className="h-2xl" />
      </div>
    </main>
  );
}
