import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { getCurrentUser } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import type { VehicleCategory } from '@/lib/pricing';
import { ReservationActions } from './ReservationActions';

/**
 * Écran de décision d'une réservation sans chauffeur.
 *
 * On y arrive par la notification envoyée une minute après le début d'une
 * recherche restée infructueuse (désistement du chauffeur engagé, ou
 * relance). Trois issues : continuer la recherche, changer de catégorie,
 * annuler. Dès qu'un chauffeur s'engage, la page bascule d'elle-même.
 */
export default async function ReservationPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('rides_view')
    .select(
      'id, status, scheduled_at, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, distance_km, duration_min, price_total_fcfa, requested_category, driver_id',
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!data) notFound();

  // Passé H-10 la réservation rejoint le cycle ordinaire : c'est l'écran de
  // course qui prend le relais, plus celui-ci.
  if (data.status !== 'scheduled') redirect(`/ride/${data.id}`);

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-64 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-violet-500/20 opacity-70 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
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

        <ReservationActions
          ride={{
            id: data.id as string,
            scheduled_at: data.scheduled_at as string,
            pickup_address: data.pickup_address as string,
            dropoff_address: data.dropoff_address as string,
            pickup_lat: data.pickup_lat as number,
            pickup_lng: data.pickup_lng as number,
            dropoff_lat: data.dropoff_lat as number,
            dropoff_lng: data.dropoff_lng as number,
            distance_km: data.distance_km as number,
            duration_min: data.duration_min as number,
            price_total_fcfa: data.price_total_fcfa as number,
            requested_category: data.requested_category as VehicleCategory,
            driver_confirmed: data.driver_id != null,
          }}
        />
      </div>
    </main>
  );
}
