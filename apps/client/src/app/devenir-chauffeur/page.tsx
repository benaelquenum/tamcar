import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { CarIcon, CheckIcon, WalletIcon } from '@/components/Icon';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  APPLICATION_TYPE_META,
  REQUIRED_DOCS,
  TAMCAR_RDV_ADDRESS,
  type DriverAppointment,
} from '@/lib/appointment';

export default async function DevenirChauffeurPage() {
  const profile = await getCurrentProfile();

  let existingApp: DriverAppointment | null = null;
  let alreadyDriver = false;
  if (profile) {
    const supabase = createServerSupabase();
    const [{ data: app }, { data: driver }] = await Promise.all([
      supabase.rpc('my_appointment'),
      supabase.from('drivers').select('id, status').eq('profile_id', profile.id).maybeSingle(),
    ]);
    if (app) existingApp = app as DriverAppointment;
    if (driver && driver.status === 'active') alreadyDriver = true;
  }

  if (alreadyDriver) redirect('/driver');
  if (
    existingApp &&
    (existingApp.status === 'scheduled' || existingApp.status === 'confirmed')
  ) {
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
          Deux formules au choix. Toi seul décides.
        </p>

        <section className="mt-xl space-y-md">
          <FormulaCard
            tag="Formule A"
            title={APPLICATION_TYPE_META.cession.label}
            sub={APPLICATION_TYPE_META.cession.sub}
            perks={[
              '40 % du prix de chaque course en cash immédiat',
              'Bonus +5 % dès ta 16e course du jour',
              '10 % en plus dans ton fonds rachat, voiture à toi en 24 mois',
              'Assurance et grosses réparations à la charge du concessionnaire',
            ]}
            icon={<CarIcon />}
          />
          <FormulaCard
            tag="Formule B"
            title={APPLICATION_TYPE_META.proprietaire.label}
            sub={APPLICATION_TYPE_META.proprietaire.sub}
            perks={[
              '80 % du prix de chaque course pour toi',
              'Bonus 10 % par course, plafonné 100 FCFA',
              'Ta voiture, tes règles, entretien à ta charge',
              'Aucun engagement de durée',
            ]}
            icon={<WalletIcon />}
          />
        </section>

        <div className="mt-2xl rounded-xl bg-neutral-100 p-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            À apporter le jour du rendez-vous
          </h2>
          <ul className="mt-md space-y-xs text-sm text-neutral-900">
            {REQUIRED_DOCS.map((doc) => (
              <li key={doc}>• {doc}</li>
            ))}
          </ul>
          <div className="mt-md rounded-lg border border-primary-100 bg-primary-50 p-md">
            <p className="text-[10px] font-bold uppercase text-primary-700">
              Adresse TamCar
            </p>
            <p className="mt-xs text-sm font-semibold text-neutral-900">
              {TAMCAR_RDV_ADDRESS}
            </p>
          </div>
        </div>

        {existingApp && existingApp.status === 'completed_rejected' && existingApp.rejection_reason && (
          <div className="mt-lg rounded-xl bg-error/10 p-lg">
            <p className="text-sm font-bold text-error">
              Ton précédent rendez-vous s&apos;est soldé par un refus
            </p>
            <p className="mt-xs text-xs text-neutral-600">
              Raison : {existingApp.rejection_reason}
            </p>
            <p className="mt-md text-xs text-neutral-600">
              Tu peux reprendre un rendez-vous en corrigeant les points signalés.
            </p>
          </div>
        )}

        <div className="mt-2xl">
          <Link
            href="/devenir-chauffeur/rdv"
            className="flex w-full items-center justify-center gap-sm rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow"
          >
            Prendre rendez-vous
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

function FormulaCard({
  tag,
  title,
  sub,
  perks,
  icon,
}: {
  tag: string;
  title: string;
  sub: string;
  perks: string[];
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
      <div className="flex items-start gap-md">
        <div className="grid h-11 w-11 flex-none place-items-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-glow">
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
            {tag}
          </p>
          <p className="text-base font-extrabold text-neutral-900">{title}</p>
          <p className="mt-xs text-xs text-neutral-600">{sub}</p>
        </div>
      </div>
      <ul className="mt-md space-y-xs text-xs text-neutral-800">
        {perks.map((p) => (
          <li key={p} className="flex items-start gap-xs">
            <CheckIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-success" strokeWidth={3} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
