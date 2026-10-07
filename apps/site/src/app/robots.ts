import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://tamcar-site.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/espace', '/connexion', '/conditions'] },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
