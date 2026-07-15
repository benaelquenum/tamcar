import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { CheckIcon } from '@/components/Icon';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { STATUS_META, type DriverApplication } from '@/lib/driver-application';

export default async function StatutPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('my_driver_application');
  const app = data as DriverApplication | null;

  if (!app) redirect('/devenir-chauffeur');

  const meta = STATUS_META[app.status];

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
          Ma candidature chauffeur
        </h1>

        <div className={`mt-lg rounded-2xl ${meta.color} p-lg shadow-glow`}>
          <p className="text-xs font-bold uppercase tracking-wider opacity-80">Statut</p>
          <p className="mt-xs text-2xl font-extrabold">{meta.label}</p>
          <p className="mt-xs text-sm opacity-90">{meta.sub}</p>
        </div>

        {app.status === 'rejected' && app.rejection_reason && (
          <div className="mt-md rounded-xl border border-error/30 bg-error/5 p-lg">
            <p className="text-xs font-bold uppercase text-error">Raison du refus</p>
            <p className="mt-xs text-sm text-neutral-900">{app.rejection_reason}</p>
            <Link
              href="/devenir-chauffeur/candidature"
              className="mt-md inline-block text-sm font-semibold text-primary-500 underline"
            >
              Postuler à nouveau →
            </Link>
          </div>
        )}

        {app.status === 'approved' && (
          <div className="mt-md rounded-xl border border-success/30 bg-success/5 p-lg text-center">
            <span className="grid mx-auto mb-md h-12 w-12 place-items-center rounded-full bg-success text-white">
              <CheckIcon className="h-6 w-6" strokeWidth={3} />
            </span>
            <p className="font-bold text-neutral-900">
              Ta candidature est validée
            </p>
            <p className="mt-xs text-xs text-neutral-600">
              Ton véhicule {app.vehicle_brand} {app.vehicle_model} ({app.vehicle_plate}) est
              associé à ton compte. Bienvenue !
            </p>
            <Link
              href="/driver"
              className="mt-lg inline-block rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 px-xl py-md text-sm font-bold text-white shadow-glow"
            >
              Accéder à mon espace chauffeur →
            </Link>
          </div>
        )}

        <section className="mt-2xl rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
          <h2 className="mb-md text-xs font-bold uppercase tracking-wider text-neutral-500">
            Détail de ta candidature
          </h2>
          <dl className="space-y-sm text-sm">
            <Row label="Nom" value={`${app.first_name} ${app.last_name}`} />
            <Row label="Téléphone" value={app.phone} />
            <Row label="Concessionnaire" value={app.dealer_company_name} />
            {app.dealer_rccm && <Row label="RCCM" value={app.dealer_rccm} />}
            <Row label="Véhicule" value={`${app.vehicle_brand} ${app.vehicle_model}${app.vehicle_year ? ` (${app.vehicle_year})` : ''}`} />
            <Row label="Plaque" value={app.vehicle_plate} />
            <Row label="Catégorie" value={`TamCar ${app.vehicle_category}`} />
            <Row
              label="Envoyée le"
              value={new Date(app.submitted_at).toLocaleString('fr-FR', {
                day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            />
          </dl>
        </section>

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
