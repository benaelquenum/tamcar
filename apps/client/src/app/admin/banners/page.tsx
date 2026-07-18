import { createServerSupabase } from '@/lib/supabase-server';
import { createBanner, deleteBanner, toggleBannerActive } from './actions';

type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  cta_text: string | null;
  gradient: string;
  display_order: number;
  is_active: boolean;
  active_from: string | null;
  active_until: string | null;
};

const GRADIENTS: Array<{ value: string; label: string }> = [
  { value: 'from-primary-500 to-primary-700', label: 'Bleu TamCar' },
  { value: 'from-violet-500 to-primary-700', label: 'Violet → Bleu' },
  { value: 'from-gold to-warning', label: 'Doré' },
  { value: 'from-success to-cyan-500', label: 'Vert → Cyan' },
  { value: 'from-error to-warning', label: 'Rouge → Orange' },
  { value: 'from-neutral-900 to-neutral-600', label: 'Sombre' },
];

export default async function AdminBannersPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('home_banners')
    .select('*')
    .order('display_order', { ascending: true });
  const banners = (data ?? []) as Banner[];

  return (
    <div>
      <h1 className="mb-xl text-2xl font-extrabold text-neutral-900">
        Bannières de communication
      </h1>

      <section id="nouvelle" className="mb-2xl scroll-mt-lg rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
        <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
          Nouvelle bannière
        </h2>
        <form action={createBanner} className="grid grid-cols-1 gap-md md:grid-cols-2">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Titre
            </span>
            <input
              name="title"
              required
              placeholder="Fin d'année : parrainage doublé"
              className="mt-xs w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Sous-titre
            </span>
            <input
              name="subtitle"
              placeholder="Invite un ami, gagnez 2 000 F chacun"
              className="mt-xs w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              URL image (optionnel)
            </span>
            <input
              name="image_url"
              placeholder="https://…"
              className="mt-xs w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              URL lien clic (optionnel)
            </span>
            <input
              name="link_url"
              placeholder="/commande ou https://…"
              className="mt-xs w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Texte du CTA (optionnel)
            </span>
            <input
              name="cta_text"
              placeholder="En savoir plus"
              className="mt-xs w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Couleur (gradient)
            </span>
            <select
              name="gradient"
              defaultValue="from-primary-500 to-primary-700"
              className="mt-xs w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200"
            >
              {GRADIENTS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Ordre d&apos;affichage
            </span>
            <input
              name="display_order"
              type="number"
              defaultValue="0"
              className="mt-xs w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200"
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow"
            >
              Créer la bannière
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
          Bannières existantes ({banners.length})
        </h2>
        {banners.length === 0 ? (
          <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
            Aucune bannière. Crée-en une avec le formulaire ci-dessus.
          </div>
        ) : (
          <div className="space-y-md">
            {banners.map((b) => (
              <BannerAdminCard key={b.id} banner={b} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BannerAdminCard({ banner }: { banner: Banner }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
      <div className="grid grid-cols-1 gap-md md:grid-cols-[220px_1fr_auto]">
        {/* Preview */}
        <div
          className={`relative flex h-24 items-end overflow-hidden rounded-lg bg-gradient-to-br ${banner.gradient} p-sm text-white`}
        >
          {banner.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={banner.image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-30"
            />
          )}
          <div className="relative">
            <p className="text-xs font-extrabold leading-tight">{banner.title}</p>
            {banner.subtitle && <p className="mt-xs text-[10px] opacity-90">{banner.subtitle}</p>}
          </div>
        </div>

        {/* Meta */}
        <div className="text-xs text-neutral-700">
          <p>
            <strong>Ordre :</strong> {banner.display_order}
          </p>
          {banner.link_url && (
            <p className="mt-xs truncate">
              <strong>Lien :</strong> {banner.link_url}
            </p>
          )}
          {banner.cta_text && (
            <p className="mt-xs">
              <strong>CTA :</strong> {banner.cta_text}
            </p>
          )}
          <p className="mt-xs">
            <strong>Statut :</strong>{' '}
            <span
              className={`inline-flex rounded-full px-sm py-0.5 text-[10px] font-bold ${
                banner.is_active ? 'bg-success/20 text-success' : 'bg-neutral-200 text-neutral-600'
              }`}
            >
              {banner.is_active ? 'Active' : 'Désactivée'}
            </span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-sm">
          <form action={toggleBannerActive}>
            <input type="hidden" name="id" value={banner.id} />
            <input type="hidden" name="next" value={String(!banner.is_active)} />
            <button
              type="submit"
              className="w-full rounded-md bg-neutral-800 py-xs text-xs font-bold text-white hover:brightness-110"
            >
              {banner.is_active ? 'Désactiver' : 'Activer'}
            </button>
          </form>
          <form action={deleteBanner}>
            <input type="hidden" name="id" value={banner.id} />
            <button
              type="submit"
              className="w-full rounded-md bg-error py-xs text-xs font-bold text-white hover:brightness-110"
            >
              Supprimer
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
