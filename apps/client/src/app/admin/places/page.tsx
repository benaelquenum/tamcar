import { createServerSupabase } from '@/lib/supabase-server';
import { CheckIcon } from '@/components/Icon';
import { approvePlace, rejectPlace } from './actions';

type PlaceRow = {
  id: string;
  name: string;
  category: string | null;
  category_group: string | null;
  city: string;
  district: string | null;
  source: 'osm' | 'popular_seed' | 'user_submitted' | 'admin';
  verified: boolean;
  created_at: string;
  submitted_by: string | null;
  submitter_name?: string | null;
  lat: number | null;
  lng: number | null;
};

const SOURCE_LABEL: Record<PlaceRow['source'], string> = {
  osm: 'OpenStreetMap',
  popular_seed: 'Seed initial',
  user_submitted: 'Proposé par user',
  admin: 'Ajouté admin',
};

const SOURCE_COLOR: Record<PlaceRow['source'], string> = {
  osm: 'bg-neutral-200 text-neutral-900',
  popular_seed: 'bg-primary-100 text-primary-700',
  user_submitted: 'bg-gold text-neutral-900',
  admin: 'bg-violet-500 text-white',
};

export default async function AdminPlacesPage() {
  const supabase = createServerSupabase();

  const { data: pending } = await supabase
    .from('places_admin_view')
    .select('id, name, category, category_group, city, district, source, verified, created_at, submitted_by, lat, lng')
    .eq('verified', false)
    .eq('source', 'user_submitted')
    .order('created_at', { ascending: false })
    .limit(50);

  const { count: totalCount } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true });

  const { count: pendingCount } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .eq('verified', false)
    .eq('source', 'user_submitted');

  const { count: userSubmittedCount } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'user_submitted');

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Modération des lieux</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {totalCount ?? 0}
          </strong> lieux au total ·{' '}
          <strong className="text-primary-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {pendingCount ?? 0}
          </strong> en attente
        </p>
      </div>

      <div className="grid gap-md md:grid-cols-3">
        <Stat label="Total base places" value={totalCount ?? 0} />
        <Stat label="Proposés par users" value={userSubmittedCount ?? 0} />
        <Stat label="En attente modération" value={pendingCount ?? 0} highlight />
      </div>

      <section className="mt-2xl">
        <h2 className="mb-md text-lg font-bold text-neutral-900">À modérer</h2>

        {!pending || pending.length === 0 ? (
          <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
            <CheckIcon className="mx-auto h-6 w-6 text-primary-500" strokeWidth={3} />
            <p className="mt-sm">Rien en attente.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full">
              <thead className="border-b border-neutral-200 bg-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-600">
                <tr>
                  <th className="px-md py-sm">Nom</th>
                  <th className="px-md py-sm">Catégorie</th>
                  <th className="px-md py-sm">Ville</th>
                  <th className="px-md py-sm">Source</th>
                  <th className="px-md py-sm">Reçu</th>
                  <th className="px-md py-sm text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p: PlaceRow) => (
                  <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-md py-md">
                      <p className="font-semibold text-neutral-900">{p.name}</p>
                      {p.district && (
                        <p className="text-xs text-neutral-600">{p.district}</p>
                      )}
                    </td>
                    <td className="px-md py-md text-sm text-neutral-600">
                      {p.category_group || p.category || '—'}
                    </td>
                    <td className="px-md py-md text-sm text-neutral-600">{p.city}</td>
                    <td className="px-md py-md">
                      <span className={`inline-flex rounded-full px-sm py-0.5 text-[10px] font-bold ${SOURCE_COLOR[p.source]}`}>
                        {SOURCE_LABEL[p.source]}
                      </span>
                    </td>
                    <td className="px-md py-md text-xs text-neutral-500">
                      {new Date(p.created_at).toLocaleString('fr-FR', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-md py-md text-right">
                      <div className="flex justify-end gap-xs">
                        {p.lat != null && p.lng != null && (
                          <a
                            href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md bg-neutral-100 px-md py-xs text-xs font-bold text-neutral-700 hover:bg-neutral-200"
                            title="Localiser sur Google Maps"
                          >
                            📍 Voir
                          </a>
                        )}
                        <form action={approvePlace} className="inline">
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            type="submit"
                            className="rounded-md bg-primary-500 px-md py-xs text-xs font-bold text-white hover:brightness-110"
                          >
                            Valider
                          </button>
                        </form>
                        <form action={rejectPlace} className="inline">
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            type="submit"
                            className="rounded-md bg-error px-md py-xs text-xs font-bold text-white hover:brightness-110"
                          >
                            Rejeter
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-xl text-center text-xs text-neutral-400">
        Les user_submitted validés apparaissent dans l&apos;autocomplete client avec le badge « TamCar vérifié ».
      </p>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-lg shadow-sm ${highlight ? 'bg-primary-50 ring-1 ring-primary-500/20' : 'bg-white'}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
        {label}
      </p>
      <p
        className="mt-xs text-3xl font-extrabold text-neutral-900"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value.toLocaleString('fr-FR').replace(/,/g, ' ')}
      </p>
    </div>
  );
}
