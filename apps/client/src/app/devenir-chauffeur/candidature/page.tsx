import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { getCurrentProfile, getCurrentUser } from '@/lib/session';
import { ApplicationForm } from './ApplicationForm';

export default async function CandidaturePage() {
  const user = await getCurrentUser();
  const profile = await getCurrentProfile();
  if (!user || !profile) redirect('/login?next=/devenir-chauffeur/candidature');

  // Pré-remplir depuis le profil existant
  const nameParts = (profile.full_name || '').trim().split(/\s+/);
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ');

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

        <h1 className="mt-lg text-2xl font-extrabold text-neutral-900">
          Candidature chauffeur
        </h1>
        <p className="mt-xs text-sm text-neutral-600">
          Remplis les 4 sections. Un membre de l&apos;équipe vérifie sous 48h.
        </p>

        <ApplicationForm
          userId={user.id}
          initialFirstName={firstName}
          initialLastName={lastName}
          initialPhone={profile.phone ? '+' + profile.phone.replace(/^\+/, '') : ''}
        />

        <div className="h-2xl" />
      </div>
    </main>
  );
}
