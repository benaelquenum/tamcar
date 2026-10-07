import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://tamcar-site.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/clients', '/chauffeurs', '/partenaires', '/contact'].map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: 'monthly',
    priority: path === '' ? 1 : 0.7,
  }));
}
