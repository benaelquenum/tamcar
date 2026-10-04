import { createServerSupabase } from '@/lib/supabase-server';
import { fmt, monthLabel, previewParam, type DealerMonth, type DealerRecent } from '../lib';

export const dynamic = 'force-dynamic';

export default async function DealerHistoryPage({
  searchParams,
}: {
  searchParams: { as?: string | string[] };
}) {
  const supabase = createServerSupabase();
  const who = { p_dealer_id: previewParam(searchParams.as) };
  const [{ data: mData }, { data: rData }] = await Promise.all([
    supabase.rpc('dealer_my_months', { ...who, p_n: 24 }),
    supabase.rpc('dealer_my_recent', { ...who, p_limit: 150 }),
  ]);

  const months = (mData ?? []) as DealerMonth[];
  const recent = (rData ?? []) as DealerRecent[];
  const total = months.reduce((s, m) => s + m.share_fcfa, 0);

  return (
    <div className="space-y-xl">
      <div className="flex flex-wrap items-baseline justify-between gap-md">
        <h1 className="text-2xl font-extrabold text-neutral-900">Historique de vos gains</h1>
        <p className="text-sm text-neutral-600">
          Votre part sur la période :{' '}
          <strong className="text-primary-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(total)} F
          </strong>
        </p>
      </div>

      <section>
        <h2 className="mb-md text-lg font-bold text-neutral-900">Mois par mois</h2>
        {months.length === 0 ? (
          <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
            Aucun mois pour le moment.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
            <table className="w-full">
              <thead className="border-b border-neutral-200 bg-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-600">
                <tr>
                  <th className="px-md py-sm">Mois</th>
                  <th className="px-md py-sm text-right">Courses</th>
                  <th className="px-md py-sm text-right">Votre part</th>
                  <th className="px-md py-sm text-right">Évolution</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m, i) => {
                  const prev = months[i + 1];
                  // Le mois en cours n'est pas terminé : on ne le compare pas au mois complet précédent.
                  const evo =
                    i > 0 && prev && prev.share_fcfa > 0
                      ? Math.round(((m.share_fcfa - prev.share_fcfa) * 100) / prev.share_fcfa)
                      : null;
                  return (
                    <tr key={m.month_start} className="border-b border-neutral-100 last:border-0">
                      <td className="px-md py-md text-sm font-semibold capitalize text-neutral-900">
                        {monthLabel(m.month_start)}
                        {i === 0 && <span className="ml-xs text-[10px] font-normal normal-case text-neutral-500">en cours</span>}
                      </td>
                      <td className="px-md py-md text-right text-sm text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {m.rides}
                      </td>
                      <td className="px-md py-md text-right text-sm font-bold text-primary-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(m.share_fcfa)} F
                      </td>
                      <td className="px-md py-md text-right text-xs text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {evo === null ? '—' : `${evo >= 0 ? '+' : ''}${evo} %`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-md flex flex-wrap items-baseline justify-between gap-sm">
          <h2 className="text-lg font-bold text-neutral-900">Dernières courses</h2>
          <p className="text-xs text-neutral-500">
            {recent.length} dernière{recent.length > 1 ? 's' : ''} course{recent.length > 1 ? 's' : ''} terminée
            {recent.length > 1 ? 's' : ''}
          </p>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
            Aucune course pour le moment.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
            {recent.map((r) => (
              <li key={r.ride_id} className="flex items-center justify-between gap-md px-md py-sm text-sm">
                <span className="text-xs text-neutral-600">
                  {new Date(r.ended_at).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Africa/Porto-Novo',
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-700">
                  {r.brand} {r.model} · {r.plate_number}
                </span>
                <strong className="text-primary-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  +{fmt(r.share_fcfa)} F
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
