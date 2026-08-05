import { createServerSupabase } from '@/lib/supabase-server';
import { type BoDeadline } from '@/lib/bo';
import { DeadlineList } from './DeadlineList';
import { NewDeadlineForm } from './NewDeadlineForm';

export const dynamic = 'force-dynamic';

export default async function EcheancesPage() {
  const supabase = createServerSupabase();

  const [{ data: pending }, { data: done }] = await Promise.all([
    supabase
      .from('bo_deadlines')
      .select('*')
      .eq('status', 'pending')
      .order('due_date', { ascending: true })
      .limit(100),
    supabase
      .from('bo_deadlines')
      .select('*')
      .eq('status', 'done')
      .order('done_at', { ascending: false })
      .limit(20),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-neutral-900">
        Échéancier réglementaire
      </h1>
      <p className="mt-xs text-sm text-neutral-600">
        ANATT, patente, CNSS, assurances, visites techniques, AG… rien ne passe
        à la trappe : chaque échéance récurrente se reprogramme toute seule.
      </p>

      <div className="mt-xl grid grid-cols-1 gap-xl lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DeadlineList
            pending={(pending ?? []) as BoDeadline[]}
            done={(done ?? []) as BoDeadline[]}
          />
        </div>
        <div>
          <NewDeadlineForm />
        </div>
      </div>
    </div>
  );
}
