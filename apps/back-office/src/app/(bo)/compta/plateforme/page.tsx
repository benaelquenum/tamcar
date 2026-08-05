import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import { formatDate, formatFcfa, type BoEntry } from '@/lib/bo';
import { SyncButton } from './SyncButton';

export const dynamic = 'force-dynamic';

export default async function PlateformePage() {
  const supabase = createServerSupabase();
  const { data: entries } = await supabase
    .from('bo_entries_view')
    .select('*')
    .eq('journal_code', 'PL')
    .order('entry_date', { ascending: false })
    .limit(60);

  const list = (entries ?? []) as BoEntry[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900">
            Synchronisation plateforme
          </h1>
          <p className="mt-xs text-sm text-neutral-600">
            Une écriture de synthèse par jour d&apos;activité : wallets =
            comptes de tiers, la commission TamCar est dégagée automatiquement
            en produit (7061).
          </p>
        </div>
        <SyncButton />
      </div>

      <div className="mt-lg rounded-xl bg-info/5 p-lg text-sm text-neutral-700 ring-1 ring-info/20">
        <p className="font-bold text-info">Comment ça marche</p>
        <p className="mt-xs">
          Chaque jour comptabilisé agrège les transactions wallet réussies :
          recharges et régularisations (contrepartie agrégateur 5318), courses
          prépayées et commissions cash (compte de liaison 4718), épargne
          TamAssur (4672), assurance conducteur (4676). Le solde du compte de
          liaison en fin de journée correspond à la commission TamCar et est
          reclassé en produit. La synchronisation est idempotente : un jour déjà
          comptabilisé n&apos;est jamais repris deux fois.
        </p>
      </div>

      <div className="mt-lg overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        {list.length === 0 ? (
          <p className="p-xl text-center text-sm text-neutral-500">
            Aucune écriture plateforme — lancez la première synchronisation.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-lg py-md font-bold">Pièce</th>
                <th className="px-lg py-md font-bold">Jour</th>
                <th className="px-lg py-md text-right font-bold">
                  Mouvement total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {list.map((e) => (
                <tr key={e.id} className="hover:bg-neutral-50">
                  <td className="px-lg py-md font-mono text-xs text-neutral-500">
                    <Link href={`/compta/ecritures/${e.id}`} className="block">
                      {e.entry_no}
                    </Link>
                  </td>
                  <td className="px-lg py-md text-neutral-800">
                    {formatDate(e.entry_date)}
                  </td>
                  <td className="px-lg py-md text-right font-bold text-neutral-900">
                    {formatFcfa(e.total_fcfa ?? 0)} F
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
