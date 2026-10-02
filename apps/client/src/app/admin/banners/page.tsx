import { createServerSupabase } from '@/lib/supabase-server';
import {
  createBanner,
  deleteBanner,
  importDefaultClientBanners,
  moveBanner,
  replaceBannerImage,
  toggleBannerActive,
  updateBanner,
} from './actions';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { BannerCarousel } from '@/components/BannerCarousel';
import { BannerImageInput } from './BannerImageInput';
import { isBannerLive, resolveHomeBanners, type HomeBannerRow } from '@/lib/home-banners';

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
  audience: 'client' | 'driver' | 'dealer';
};

const AUDIENCES: Array<{ value: 'client' | 'driver' | 'dealer'; label: string }> = [
  { value: 'client', label: 'Client' },
  { value: 'driver', label: 'Chauffeur' },
  { value: 'dealer', label: 'Partenaire véhicule' },
];

const GRADIENTS: Array<{ value: string; label: string }> = [
  { value: 'from-primary-500 to-primary-700', label: 'Bleu TamCar' },
  { value: 'from-violet-500 to-primary-700', label: 'Violet → Bleu' },
  { value: 'from-gold to-warning', label: 'Doré' },
  { value: 'from-success to-cyan-500', label: 'Vert → Cyan' },
  { value: 'from-error to-warning', label: 'Rouge → Orange' },
  { value: 'from-neutral-900 to-neutral-600', label: 'Sombre' },
];

const LINK_SUGGESTIONS = ['/commande', '/tampass', '/location', '/reservations', '/parrainer', '/wallet'];

const fieldCls = 'mt-xs w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200';
const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-neutral-500';

export default async function AdminBannersPage({
  searchParams,
}: {
  searchParams?: { err?: string };
}) {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('home_banners')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  const banners = (data ?? []) as Banner[];
  const clientBanners = banners.filter((b) => b.audience === 'client');
  const { banners: previewBanners, usingDefaults } = resolveHomeBanners(clientBanners as HomeBannerRow[]);

  return (
    <div>
      <h1 className="mb-xl text-2xl font-extrabold text-neutral-900">Bannières de communication</h1>

      {/* ------------------------------------------------------------------ */}
      {/* Contrôle de l'accueil client                                        */}
      {/* ------------------------------------------------------------------ */}
      <section id="accueil" className="mb-2xl scroll-mt-lg rounded-2xl border border-primary-200 bg-white p-lg shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-sm">
          <h2 className="text-lg font-extrabold text-neutral-900">Accueil client</h2>
          <a href="/" target="_blank" rel="noopener" className="text-xs font-bold text-primary-700 underline">
            Ouvrir l&apos;accueil →
          </a>
        </div>
        <p className="mt-xs text-sm text-neutral-600">
          Les bannières du carrousel en haut de l&apos;accueil des clients. Chaque changement est visible tout de suite,
          sans déploiement.
        </p>

        {searchParams?.err && (
          <p role="alert" className="mt-md rounded-lg bg-error/10 px-md py-sm text-sm font-semibold text-error">
            {searchParams.err}
          </p>
        )}

        <div className="mt-lg grid grid-cols-1 gap-lg lg:grid-cols-[390px_1fr]">
          {/* Aperçu fidèle */}
          <div>
            <p className={labelCls}>Aperçu (tel que sur un téléphone)</p>
            <div className="mt-xs rounded-[28px] bg-neutral-100 p-md ring-1 ring-neutral-200">
              <BannerCarousel banners={previewBanners} aspectClass="aspect-[5/2]" />
            </div>
            <p className="mt-sm text-xs text-neutral-600">
              {usingDefaults ? (
                <>
                  <strong className="text-warning">Aucune bannière client active avec image.</strong> L&apos;accueil
                  affiche les 2 bannières par défaut du site.
                </>
              ) : (
                <>
                  <strong className="text-success">{previewBanners.length}</strong> bannière
                  {previewBanners.length > 1 ? 's' : ''} en ligne, qui défile{previewBanners.length > 1 ? 'nt' : ''}{' '}
                  toutes les 3 secondes.
                </>
              )}
            </p>
            <p className="mt-xs text-[11px] text-neutral-500">
              Image conseillée : 1400 × 560 px (format 2,5:1). Elle est réduite automatiquement à l&apos;envoi
              (WebP, ~100 Ko) et recadrée au centre si le format diffère.
            </p>
          </div>

          {/* Liste */}
          <div>
            {clientBanners.length === 0 ? (
              <div className="rounded-xl bg-neutral-100 p-lg text-sm text-neutral-700">
                <p className="font-semibold text-neutral-900">Les bannières de l&apos;accueil ne sont pas encore gérées ici.</p>
                <p className="mt-xs">
                  L&apos;accueil affiche aujourd&apos;hui les 2 fichiers du site. Reprends-les ici pour les remplacer,
                  les réordonner ou les désactiver depuis cette page.
                </p>
                <form action={importDefaultClientBanners} className="mt-md">
                  <button
                    type="submit"
                    className="rounded-lg bg-primary-500 px-lg py-sm text-sm font-bold text-white shadow-sm hover:brightness-110"
                  >
                    Reprendre les 2 bannières actuelles
                  </button>
                </form>
              </div>
            ) : (
              <ol className="space-y-md">
                {clientBanners.map((b, i) => (
                  <HomeBannerRowCard
                    key={b.id}
                    banner={b}
                    rank={i + 1}
                    isFirst={i === 0}
                    isLast={i === clientBanners.length - 1}
                  />
                ))}
              </ol>
            )}
            <p className="mt-md text-xs text-neutral-500">
              Pour ajouter une bannière : <a href="#nouvelle" className="font-bold text-primary-700 underline">formulaire « Nouvelle bannière »</a>{' '}
              ci-dessous (audience « Client »).
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section id="nouvelle" className="mb-2xl scroll-mt-lg rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
        <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">Nouvelle bannière</h2>
        <form action={createBanner} className="grid grid-cols-1 gap-md md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className={labelCls}>Audience (où s&apos;affiche la bannière)</span>
            <select name="audience" defaultValue="client" className={`${fieldCls} font-semibold`}>
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>
                  Bannière {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Titre</span>
            <input name="title" required placeholder="Fin d'année : parrainage doublé" className={fieldCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Sous-titre</span>
            <input name="subtitle" placeholder="Invite un ami, gagnez 2 000 F chacun" className={fieldCls} />
          </label>
          <div className="block">
            <span className={labelCls}>Image de la bannière (téléverser)</span>
            <BannerImageInput className="mt-xs" />
            <span className="mt-xs block text-[10px] text-neutral-400">
              PNG, JPG, WEBP ou GIF. L&apos;image que tu as conçue s&apos;affichera telle quelle (réduite si trop lourde).
            </span>
          </div>
          <label className="block">
            <span className={labelCls}>URL lien clic (optionnel)</span>
            <input name="link_url" list="liens-app" placeholder="/commande ou https://…" className={fieldCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Texte du CTA (optionnel)</span>
            <input name="cta_text" placeholder="En savoir plus" className={fieldCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Couleur (gradient)</span>
            <select name="gradient" defaultValue="from-primary-500 to-primary-700" className={fieldCls}>
              {GRADIENTS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Ordre d&apos;affichage</span>
            <input name="display_order" type="number" defaultValue="100" className={fieldCls} />
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

      <datalist id="liens-app">
        {LINK_SUGGESTIONS.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      {AUDIENCES.filter((a) => a.value !== 'client').map((a) => {
        const list = banners.filter((b) => b.audience === a.value);
        return (
          <section key={a.value} className="mb-2xl">
            <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-primary-700">
              Bannière {a.label} ({list.length})
            </h2>
            {list.length === 0 ? (
              <div className="rounded-xl bg-white p-lg text-center text-sm text-neutral-500 shadow-sm">
                Aucune bannière {a.label.toLowerCase()}. Crée-en une ci-dessus en choisissant l&apos;audience «&nbsp;{a.label}&nbsp;».
              </div>
            ) : (
              <div className="space-y-md">
                {list.map((b) => (
                  <BannerAdminCard key={b.id} banner={b} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Une bannière de l'accueil client : image, titre, lien, ordre, activation, remplacement d'image. */
function HomeBannerRowCard({
  banner,
  rank,
  isFirst,
  isLast,
}: {
  banner: Banner;
  rank: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const live = isBannerLive(banner as HomeBannerRow);
  const fromSite = Boolean(banner.image_url && banner.image_url.startsWith('/'));
  return (
    <li className={`rounded-xl border bg-white p-md shadow-sm ${live ? 'border-neutral-200' : 'border-neutral-200 opacity-80'}`}>
      <div className="grid grid-cols-1 gap-md md:grid-cols-[200px_1fr]">
        <div>
          <div className="relative overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-neutral-200">
            {banner.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner.image_url} alt="" className="block aspect-[5/2] w-full object-cover" />
            ) : (
              <div className="grid aspect-[5/2] w-full place-items-center px-sm text-center text-[10px] font-semibold text-neutral-500">
                Sans image : n&apos;apparaît pas
              </div>
            )}
            <span className="absolute left-xs top-xs rounded-full bg-neutral-900/80 px-sm py-0.5 text-[10px] font-bold text-white">
              {rank}
            </span>
          </div>
          <div className="mt-xs flex flex-wrap items-center gap-xs text-[10px] font-bold">
            <span className={`rounded-full px-sm py-0.5 ${live ? 'bg-success/20 text-success' : 'bg-neutral-200 text-neutral-600'}`}>
              {live ? 'En ligne' : banner.is_active ? 'Hors période' : 'Désactivée'}
            </span>
            <span className="text-neutral-400">{fromSite ? 'Fichier du site' : 'Image téléversée'}</span>
          </div>

          <div className="mt-sm flex gap-xs">
            <form action={moveBanner} className="flex-1">
              <input type="hidden" name="id" value={banner.id} />
              <input type="hidden" name="dir" value="up" />
              <button
                type="submit"
                disabled={isFirst}
                aria-label="Monter"
                className="w-full rounded-md bg-neutral-100 py-xs text-xs font-bold text-neutral-800 ring-1 ring-neutral-200 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↑ Monter
              </button>
            </form>
            <form action={moveBanner} className="flex-1">
              <input type="hidden" name="id" value={banner.id} />
              <input type="hidden" name="dir" value="down" />
              <button
                type="submit"
                disabled={isLast}
                aria-label="Descendre"
                className="w-full rounded-md bg-neutral-100 py-xs text-xs font-bold text-neutral-800 ring-1 ring-neutral-200 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↓ Descendre
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-md">
          <form action={updateBanner} className="grid grid-cols-1 gap-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="id" value={banner.id} />
            <label className="block">
              <span className={labelCls}>Titre (accessibilité)</span>
              <input name="title" defaultValue={banner.title} required className={fieldCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Lien au clic</span>
              <input name="link_url" list="liens-app" defaultValue={banner.link_url ?? ''} placeholder="/commande" className={fieldCls} />
            </label>
            <button type="submit" className="rounded-md bg-neutral-800 px-md py-sm text-xs font-bold text-white hover:brightness-110">
              Enregistrer
            </button>
          </form>

          <form action={replaceBannerImage} className="grid grid-cols-1 gap-sm sm:grid-cols-[1fr_auto] sm:items-start">
            <input type="hidden" name="id" value={banner.id} />
            <div>
              <span className={labelCls}>Remplacer l&apos;image</span>
              <BannerImageInput required className="mt-xs" />
            </div>
            <button type="submit" className="rounded-md bg-primary-500 px-md py-sm text-xs font-bold text-white hover:brightness-110 sm:mt-[18px]">
              Remplacer
            </button>
          </form>

          <div className="flex flex-wrap gap-sm border-t border-neutral-100 pt-sm">
            <form action={toggleBannerActive}>
              <input type="hidden" name="id" value={banner.id} />
              <input type="hidden" name="next" value={String(!banner.is_active)} />
              <button
                type="submit"
                className="rounded-md bg-neutral-100 px-md py-xs text-xs font-bold text-neutral-800 ring-1 ring-neutral-200 hover:bg-neutral-200"
              >
                {banner.is_active ? 'Désactiver' : 'Activer'}
              </button>
            </form>
            <form action={deleteBanner}>
              <input type="hidden" name="id" value={banner.id} />
              <ConfirmSubmit
                message="Supprimer définitivement cette bannière ?"
                className="rounded-md bg-error px-md py-xs text-xs font-bold text-white hover:brightness-110"
              >
                Supprimer
              </ConfirmSubmit>
            </form>
          </div>
        </div>
      </div>
    </li>
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
            <img src={banner.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
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
            <button type="submit" className="w-full rounded-md bg-neutral-800 py-xs text-xs font-bold text-white hover:brightness-110">
              {banner.is_active ? 'Désactiver' : 'Activer'}
            </button>
          </form>
          <form action={deleteBanner}>
            <input type="hidden" name="id" value={banner.id} />
            <ConfirmSubmit
              message="Supprimer définitivement cette bannière ?"
              className="w-full rounded-md bg-error py-xs text-xs font-bold text-white hover:brightness-110"
            >
              Supprimer
            </ConfirmSubmit>
          </form>
        </div>
      </div>
    </div>
  );
}
