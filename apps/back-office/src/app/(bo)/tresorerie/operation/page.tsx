import { createServerSupabase } from '@/lib/supabase-server';
import { type BoExpenseCategory } from '@/lib/bo';
import { OperationForm } from './OperationForm';

export const dynamic = 'force-dynamic';

export default async function OperationPage() {
  const supabase = createServerSupabase();
  const { data: categories } = await supabase
    .from('bo_expense_categories')
    .select('*')
    .order('sort');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold text-neutral-900">
        Nouvelle opération
      </h1>
      <p className="mt-xs text-sm text-neutral-600">
        Photographiez le justificatif ou décrivez l&apos;opération en une
        phrase : l&apos;assistant analyse, classe dans le bon compte et
        pré-remplit tout. Vous n&apos;avez qu&apos;à vérifier et confirmer.
      </p>
      <OperationForm categories={(categories ?? []) as BoExpenseCategory[]} />
    </div>
  );
}
