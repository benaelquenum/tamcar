import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { BottomTabBar } from '@/components/BottomTabBar';
import { getCurrentUser } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import type { FavoritePlace } from '@/components/QuickDestinations';
import { FavoritePlacesManager } from './FavoritePlacesManager';

export default async function LieuxPage({
  searchParams,
}: {
  searchParams: { kind?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('my_favorite_places');
  const places = (Array.isArray(data) ? data : []) as FavoritePlace[];

  const kind =
    searchParams.kind === 'home' || searchParams.kind === 'work'
      ? searchParams.kind
      : 'other';

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="mx-auto max-w-md px-lg py-lg">
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

        <h1 className="mt-lg text-2xl font-extrabold text-neutral-900">Mes lieux</h1>
        <p className="mt-xs text-sm text-neutral-600">
          Une adresse enregistrée, c&apos;est une course en deux touches.
        </p>

        <FavoritePlacesManager initial={places} initialKind={kind} />

        <BottomTabBar />
      </div>
    </main>
  );
}
