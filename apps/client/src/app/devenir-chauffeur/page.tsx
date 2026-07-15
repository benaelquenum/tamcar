import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { CarIcon, CheckIcon, WalletIcon } from '@/components/Icon';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import type { DriverApplication } from '@/lib/driver-application';

export default async function DevenirChauffeurPage() {
  const profile = await getCurrentProfile();

  // Si connecté, check s'il a déjà une candidature ou s'il est déjà driver
  let existingApp: DriverApplication | null = null;
  let alreadyDriver = false;
  if (profile) {
    const supabase = createServerSupabase();
    const [{ data: app }, { data: driver }] = await Promise.all([
      supabase.rpc('my_driver_application'),
      supabase.from('drivers').select('id, status').eq('profile_id', profile.id).maybeSingle(),
    ]);
    if (app) existingApp = app as DriverApplication;
    if (driver && driver.status === 'active') alreadyDriver = true;
  }

  // Si déjà driver actif, redirect vers dashboard
  if (alreadyDriver) redirect('/driver');
  // Si candidature en cours, redirect vers statut
  if (existingApp && (existingApp.status === 'submitted' || existingApp.status === 'in_review')) {
    redirect('/devenir-chauffeur/statut');
  }

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-96 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-80 blur-3xl" />
        <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <Link
            href="/"
            aria-label="Retour"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
        </header>

        <h1 className="mt-xl text-4xl font-extrabold leading-[1.05] tracking-tight text-neutral-900">
          Deviens chauffeur
          <br />
          <span className="bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">
            TamCar
          </span>
        </h1>
        <p className="mt-md text-base text-neutral-600">
          Roule dans ta ville, gagne des revenus réguliers, et deviens
          propriétaire de ta voiture au bout de 24 mois grâce au fonds
          rachat TamCar.
        </p>

        <section className="mt-xl space-y-md">
          <Perk
            icon={<WalletIcon />}
            title="Revenus + fonds rachat"
            body="Tu touches 52 % du prix de chaque course en cash immédiat. 5 % en plus vont dans ton fonds rachat pour posséder ta voiture."
          />
          <Perk
            icon={<CarIcon />}
            title="Voiture cédée en 24 mois"
            body="Après 24 mois de service régulier (notation ≥ 4,5, entretiens à jour), la voiture est à toi. Zéro apport, zéro emprunt."
          />
          <Perk
            icon={<CheckIcon />}
            title="Prix fixe, jamais de surge"
            body="Le client sait ce qu'il paie à l'avance. Tu roules l'esprit tranquille, sans marchander."
          />
        </section>

        <div className="mt-2xl rounded-xl bg-neutral-100 p-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Ce dont tu as besoin
          </h2>
          <ul className="mt-md space-y-xs text-sm text-neutral-900">
            <li>• Carte nationale d&apos;identité (recto + verso)</li>
            <li>• Permis de conduire en cours de validité</li>
            <li>• Carte grise de ton véhicule</li>
            <li>• Un smartphone Android ou iPhone</li>
          </ul>
        </div>

        {existingApp && existingApp.status === 'rejected' && (
          <div className="mt-lg rounded-xl bg-error/10 p-lg">
            <p className="text-sm font-bold text-error">
              Ta candidature précédente a été refusée
            </p>
            <p className="mt-xs text-xs text-neutral-600">
              Raison : {existingApp.rejection_reason || 'non précisée'}
            </p>
            <p className="mt-md text-xs text-neutral-600">
              Tu peux postuler à nouveau en corrigeant les points signalés.
            </p>
          </div>
        )}

        <div className="mt-2xl">
          <Link
            href="/devenir-chauffeur/candidature"
            className="flex w-full items-center justify-center gap-sm rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow"
          >
            Postuler maintenant
          </Link>
          {!profile && (
            <p className="mt-md text-center text-xs text-neutral-500">
              Tu devras te connecter en premier (email ou téléphone).
            </p>
          )}
        </div>

        <div className="h-2xl" />
      </div>
    </main>
  );
}

function Perk({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-md rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
      <div className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white">
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-neutral-900">{title}</p>
        <p className="mt-xs text-xs text-neutral-600">{body}</p>
      </div>
    </div>
  );
}
