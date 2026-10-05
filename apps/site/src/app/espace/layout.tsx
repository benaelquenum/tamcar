import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogOutIcon } from '@/components/Icon';
import { EspaceNav } from '@/components/espace/EspaceNav';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { TERMS_VERSION } from '@/lib/terms';
import { signOutAction } from '@/app/connexion/actions';

export const metadata = { title: 'Espace partenaire', robots: { index: false } };

export default async function EspaceLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/connexion?next=/espace');

  // Connecté mais pas partenaire (client ou chauffeur) : message clair plutôt qu'une boucle de redirections.
  if (profile.role !== 'dealer' && profile.role !== 'admin') {
    return (
      <main className="grid min-h-dvh place-items-center bg-neutral-100 px-lg">
        <div className="max-w-md rounded-2xl bg-white p-xl text-center shadow-md">
          <h1 className="text-xl font-extrabold text-neutral-900">Espace réservé aux partenaires</h1>
          <p className="mt-sm text-sm text-neutral-600">
            Ce compte n’est pas un compte partenaire véhicule. Les clients et les chauffeurs utilisent les applications TamCar.
          </p>
          <form action={signOutAction} className="mt-lg">
            <button type="submit" className="rounded-full bg-primary-500 px-xl py-sm text-sm font-bold text-white">
              Me déconnecter
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Acceptation des CGU (version courante, toutes applications confondues) : exigée des partenaires.
  // Les administrateurs (aperçu) n’ont pas à les accepter.
  if (profile.role === 'dealer') {
    const supabase = createServerSupabase();
    const { count, error } = await supabase
      .from('terms_acceptances')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profile.id)
      .eq('doc', 'cgu')
      .eq('version', TERMS_VERSION);
    if (!error && !count) redirect('/conditions');
  }

  return (
    <div className="min-h-dvh bg-neutral-100">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-lg gap-y-sm px-lg py-md">
          <div className="flex items-center gap-md">
            <Link href="/espace" aria-label="Espace partenaire, accueil">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="TamCar" className="h-9 w-auto" />
            </Link>
            <span className="rounded-full bg-primary-500 px-md py-xs text-xs font-bold uppercase tracking-wider text-white">Partenaire</span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-lg gap-y-xs">
            <Suspense fallback={null}>
              <EspaceNav />
            </Suspense>
            <Link href="/" className="text-sm text-neutral-600 hover:text-primary-500">
              Le site
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Se déconnecter"
                className="inline-flex items-center gap-xs rounded-lg border border-neutral-200 bg-white px-sm py-xs text-xs font-semibold text-neutral-700 hover:border-error/30 hover:text-error"
              >
                <LogOutIcon className="h-3.5 w-3.5" />
                Déconnexion
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-lg py-xl">{children}</main>
    </div>
  );
}
