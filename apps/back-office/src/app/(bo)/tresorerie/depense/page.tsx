import { createServerSupabase } from '@/lib/supabase-server';
import { type BoExpenseCategory } from '@/lib/bo';
import { ExpenseForm } from './ExpenseForm';

export const dynamic = 'force-dynamic';

export default async function DepensePage() {
  const supabase = createServerSupabase();
  const { data: categories } = await supabase
    .from('bo_expense_categories')
    .select('*')
    .order('sort');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold text-neutral-900">
        Nouvelle dépense
      </h1>
      <p className="mt-xs text-sm text-neutral-600">
        Photographiez le justificatif, choisissez la catégorie : l&apos;écriture
        comptable est passée automatiquement dans le bon journal.
      </p>
      <ExpenseForm categories={(categories ?? []) as BoExpenseCategory[]} />
    </div>
  );
}
