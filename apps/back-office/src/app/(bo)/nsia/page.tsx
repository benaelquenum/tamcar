import { createServerSupabase } from '@/lib/supabase-server';
import type { NsiaLine, NsiaPeriod, NsiaRedemption } from '@/lib/nsia';
import { NsiaBoard } from './NsiaBoard';

export const dynamic = 'force-dynamic';

export default async function NsiaPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle();
  const role = (profile as { role?: string } | null)?.role ?? '';

  const [{ data: lines }, { data: periods }, { data: reds }] = await Promise.all([
    supabase.from('bo_nsia_lines').select('*').order('opened_on', { ascending: true }).order('label', { ascending: true }),
    supabase.from('bo_nsia_periods').select('*').order('starts_on', { ascending: true }),
    supabase.from('bo_nsia_redemptions').select('*').order('due_on', { ascending: true }),
  ]);

  // Date du jour au Bénin (UTC+1, pas d'heure d'été) : transmise au navigateur pour que serveur et client calculent la même chose.
  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-neutral-900">Lignes d&apos;épargne NSIA</h1>
      <p className="mt-xs max-w-3xl text-sm text-neutral-600">
        Chaque ligne est un emplacement de 6 ans à 1 000 F par jour (lundi-samedi), alimenté par une chaîne de conducteurs. TamCar rachète
        tous les 24 mois, rembourse les conducteurs sortis (60 jours après le terme, 90 jours après un départ anticipé) et avance l&apos;écart
        entre un remboursement et le rachat suivant. Cet écran ne déplace aucun argent : il sert à suivre et à anticiper.
      </p>
      <NsiaBoard
        lines={(lines ?? []) as NsiaLine[]}
        periods={(periods ?? []) as NsiaPeriod[]}
        reds={(reds ?? []) as NsiaRedemption[]}
        today={today}
        canWrite={role === 'admin' || role === 'staff'}
        isAdmin={role === 'admin'}
      />
    </div>
  );
}
