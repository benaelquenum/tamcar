import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { LogOutIcon } from '@/components/Icon';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { logout } from '@/app/login/actions';

export const dynamic = 'force-dynamic';

/**
 * Gate de l'espace responsable opérations.
 *
 * ⚠️ Volontairement PAS de contrôle sur `profile.role` : un responsable
 * opérations est très souvent aussi chauffeur, et un compte n'a qu'un seul
 * rôle. L'autorisation vient de `ops_is_manager()` (appartenance à
 * `ops_city_managers`). Le middleware de l'app ne filtre que l'auth + les
 * CGU, il n'empêche donc aucun rôle d'atteindre cette route.
 */
export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login?next=/ops');

  const supabase = createServerSupabase();
  const { data: isManager } = await supabase.rpc('ops_is_manager');

  // L'admin garde l'accès pour vérifier l'espace ; sinon appartenance stricte.
  if (!isManager && profile.role !== 'admin') redirect('/');

  return (
    <div className="min-h-dvh bg-neutral-100">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-md px-lg py-md">
          <div className="flex min-w-0 items-center gap-sm">
            <Link href="/ops" aria-label="Espace responsable opérations">
              <Logo className="h-7 w-auto" />
            </Link>
            <span className="rounded-full bg-primary-500 px-sm py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Ops
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-sm">
            <span className="truncate text-xs font-semibold text-neutral-700">
              {profile.full_name}
            </span>
            <form action={logout}>
              <button
                type="submit"
                aria-label="Se déconnecter"
                className="inline-flex items-center rounded-lg border border-neutral-200 bg-white p-sm text-neutral-600 transition hover:border-error/30 hover:text-error"
              >
                <LogOutIcon className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-lg py-lg pb-3xl">{children}</main>
    </div>
  );
}
