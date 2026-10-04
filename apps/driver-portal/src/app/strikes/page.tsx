import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { ContestForm } from './ContestForm';

export const dynamic = 'force-dynamic';

type StrikeRow = {
  ride_id: string;
  ended_at: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  cancel_reason_user: string | null;
  cancel_driver_fault_evidence: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  resolved_at: string | null;
  upheld: boolean | null;
  can_dispute: boolean;
};

type Reliability = { active_points: number; warn_at: number; next_expiry: string | null };

const REASON_LABELS: Record<string, string> = {
  driver_asked: 'Le client indique que vous lui avez demandé d’annuler',
  driver_not_moving: 'Le client indique que vous ne bougiez pas',
  wrong_direction: 'Le client indique que vous alliez dans la mauvaise direction',
  wait_too_long: 'Attente jugée trop longue',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default async function StrikesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'driver' && profile.role !== 'admin') redirect('/');

  const supabase = createServerSupabase();
  const [{ data: sData }, { data: rData }] = await Promise.all([
    supabase.rpc('my_driver_strikes'),
    supabase.rpc('my_reliability'),
  ]);
  const strikes = (sData ?? []) as StrikeRow[];
  const rel = ((rData ?? []) as Reliability[])[0] ?? { active_points: 0, warn_at: 4, next_expiry: null };

  return (
    <main className="min-h-dvh bg-neutral-50">
      <div className="mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            aria-label="Retour"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
          <div className="w-11" />
        </header>

        <h1 className="mt-lg text-xl font-extrabold text-neutral-900">Mes signalements</h1>

        <section className="mt-md rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Points de fiabilité</p>
          <p
            className={`mt-xs text-3xl font-extrabold ${rel.active_points >= rel.warn_at ? 'text-error' : 'text-neutral-900'}`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {rel.active_points}
          </p>
          <p className="mt-xs text-xs text-neutral-600">
            Chaque faute établie ajoute des points. Ils s’effacent tout seuls avec le temps
            {rel.next_expiry ? ` (prochain effacement le ${new Date(rel.next_expiry).toLocaleDateString('fr-FR')})` : ''}.
            À partir de {rel.warn_at} points, vous recevez un avertissement. Aucune suspension automatique.
          </p>
        </section>

        {strikes.length === 0 ? (
          <p className="mt-lg rounded-xl bg-white p-lg text-center text-sm text-neutral-600 shadow-sm">
            Aucun signalement actif. Continuez ainsi.
          </p>
        ) : (
          <ul className="mt-lg space-y-md">
            {strikes.map((s) => (
              <li key={s.ride_id} className="rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
                <p className="text-xs text-neutral-500">{fmtDate(s.ended_at)}</p>
                <p className="mt-xs truncate text-sm font-semibold text-neutral-900">{s.pickup_address ?? '—'}</p>
                <p className="truncate text-xs text-neutral-500">→ {s.dropoff_address ?? '—'}</p>
                <p className="mt-sm text-xs text-neutral-700">
                  {REASON_LABELS[s.cancel_reason_user ?? ''] ?? 'Annulation imputée'}
                </p>
                {s.cancel_driver_fault_evidence && (
                  <p className="mt-xs whitespace-pre-line rounded-md bg-neutral-50 p-sm text-[11px] text-neutral-600">
                    {s.cancel_driver_fault_evidence}
                  </p>
                )}

                {s.disputed_at ? (
                  <p className="mt-sm rounded-md bg-warning/10 p-sm text-xs text-neutral-800">
                    {s.resolved_at
                      ? s.upheld === false
                        ? 'Votre contestation est acceptée : le signalement est retiré.'
                        : 'Votre contestation est refusée.'
                      : 'Votre contestation est en cours d’examen.'}
                  </p>
                ) : s.can_dispute ? (
                  <ContestForm rideId={s.ride_id} />
                ) : (
                  <p className="mt-sm text-[11px] text-neutral-500">Le délai de contestation (7 jours) est dépassé.</p>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-lg text-[11px] text-neutral-500">
          Une contestation est examinée automatiquement : refusée tout de suite si la faute est établie par les données
          de la course (GPS, délais), transmise à l’équipe TamCar sinon.
        </p>
      </div>
    </main>
  );
}
