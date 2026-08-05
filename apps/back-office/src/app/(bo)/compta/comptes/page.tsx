import { createServerSupabase } from '@/lib/supabase-server';
import { type BoAccount } from '@/lib/bo';

export const dynamic = 'force-dynamic';

const CLASS_LABELS: Record<number, string> = {
  1: 'Financement permanent',
  2: 'Actif immobilisé',
  3: 'Stocks',
  4: 'Tiers',
  5: 'Trésorerie',
  6: 'Charges',
  7: 'Produits',
  8: 'HAO et impôt',
};

export default async function ComptesPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('bo_accounts')
    .select('code, label, class, is_active')
    .order('code');

  const accounts = (data ?? []) as BoAccount[];
  const byClass = new Map<number, BoAccount[]>();
  for (const a of accounts) {
    const list = byClass.get(a.class) ?? [];
    list.push(a);
    byClass.set(a.class, list);
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-neutral-900">
        Plan de comptes
      </h1>
      <p className="mt-xs text-sm text-neutral-600">
        Plan SYSCOHADA révisé adapté à TamCar — {accounts.length} comptes. Les
        wallets plateforme correspondent aux comptes de tiers 4191 (clients),
        4671 (revenus), 4672 (épargne TamAssur) et 4674 (séquestre rachat).
      </p>

      <div className="mt-xl grid grid-cols-1 gap-lg lg:grid-cols-2">
        {Array.from(byClass.entries())
          .sort(([a], [b]) => a - b)
          .map(([cls, list]) => (
            <div
              key={cls}
              className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200"
            >
              <p className="bg-neutral-50 px-lg py-sm text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                Classe {cls} — {CLASS_LABELS[cls] ?? ''}
              </p>
              <ul className="divide-y divide-neutral-100">
                {list.map((a) => (
                  <li key={a.code} className="flex items-center gap-md px-lg py-sm">
                    <span className="w-14 shrink-0 font-mono text-xs font-bold text-primary-700">
                      {a.code}
                    </span>
                    <span className="text-sm text-neutral-800">{a.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </div>
  );
}
