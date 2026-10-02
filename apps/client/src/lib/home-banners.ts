import type { BannerItem } from '@/components/BannerCarousel';

/**
 * Bannières par défaut de l'accueil client (fichiers du site). Elles ne s'affichent que
 * s'il n'y a AUCUNE bannière client active avec une image dans l'admin (/admin/banners).
 */
export const DEFAULT_HOME_BANNERS: BannerItem[] = [
  {
    id: 'brand-claire',
    title: 'Ta course est claire, ta course éclair.',
    subtitle: null,
    image_url: '/banners/accueil-1.webp',
    link_url: '/commande',
    cta_text: null,
    gradient: null,
  },
  {
    id: 'brand-tampass',
    title: 'TamPass : plus de trajets, plus d’avantages.',
    subtitle: null,
    image_url: '/banners/accueil-2.webp',
    link_url: '/tampass',
    cta_text: null,
    gradient: null,
  },
];

export type HomeBannerRow = BannerItem & {
  is_active: boolean;
  active_from: string | null;
  active_until: string | null;
};

/** Une bannière est « en ligne » si elle est active, a une image et que sa fenêtre de dates est ouverte. */
export function isBannerLive(b: HomeBannerRow, now = Date.now()): boolean {
  return (
    b.is_active &&
    Boolean(b.image_url) &&
    (!b.active_from || new Date(b.active_from).getTime() <= now) &&
    (!b.active_until || new Date(b.active_until).getTime() >= now)
  );
}

/** Ce que l'accueil affiche : les bannières en ligne, sinon les deux bannières par défaut. */
export function resolveHomeBanners(rows: HomeBannerRow[]): { banners: BannerItem[]; usingDefaults: boolean } {
  const live = rows.filter((b) => isBannerLive(b));
  return live.length > 0
    ? { banners: live, usingDefaults: false }
    : { banners: DEFAULT_HOME_BANNERS, usingDefaults: true };
}
