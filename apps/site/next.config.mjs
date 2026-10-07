/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // En-têtes de sécurité (revue du 2026-10-07) : pas d'intégration de nos pages dans un cadre étranger (clic piégé), pas de
  // détection de type MIME, référent limité, API sensibles réservées à notre propre origine.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), microphone=(self), camera=(self), payment=(), usb=(), accelerometer=(self)' },
        ],
      },
    ];
  },
  poweredByHeader: false,
};

export default nextConfig;
