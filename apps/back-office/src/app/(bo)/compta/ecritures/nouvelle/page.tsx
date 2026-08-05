import { createServerSupabase } from '@/lib/supabase-server';
import { type BoAccount } from '@/lib/bo';
import { EntryEditor } from './EntryEditor';

export const dynamic = 'force-dynamic';

export default async function NouvelleEcriturePage() {
  const supabase = createServerSupabase();
  const { data: accounts } = await supabase
    .from('bo_accounts')
    .select('code, label, class, is_active')
    .eq('is_active', true)
    .order('code');

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-extrabold text-neutral-900">
        Nouvelle écriture
      </h1>
      <p className="mt-xs text-sm text-neutral-600">
        Saisie libre en partie double — l&apos;écriture doit être équilibrée
        (total débits = total crédits) pour être validée. Utilisez le journal OD
        pour l&apos;ouverture (apports en capital) et les régularisations.
      </p>
      <EntryEditor accounts={(accounts ?? []) as BoAccount[]} />
    </div>
  );
}
