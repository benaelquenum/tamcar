import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { getCurrentUser } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { RentalForm, type RentalRate } from './RentalForm';

export const metadata = { title: 'Louer un VIP avec chauffeur — TamCar' };

export default async function LocationPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('rental_rates')
    .select('hour_fcfa, min_hours, max_hours, km_included_per_day, km_extra_fcfa, lead_minutes')
    .eq('category', 'premium')
    .eq('active', true)
    .maybeSingle();
  const rate = data as RentalRate | null;

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <Link
            href="/history"
            aria-label="Retour"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
        </header>

        <h1 className="mt-lg text-2xl font-extrabold text-neutral-900">Louer un VIP avec chauffeur</h1>
        <p className="mt-xs text-sm text-neutral-600">
          Un véhicule VIP et son chauffeur à votre disposition pour la durée de votre choix :
          déplacements professionnels, séminaires, cérémonies, accueil d’invités.
        </p>

        {rate ? (
          <RentalForm rate={rate} />
        ) : (
          <div className="mt-lg rounded-xl bg-neutral-100 p-lg text-center text-sm text-neutral-600">
            La location VIP arrive très bientôt.
          </div>
        )}
      </div>
    </main>
  );
}
