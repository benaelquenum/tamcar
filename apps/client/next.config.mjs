import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  // PWA totalement désactivée pour l'instant — le service worker workbox
  // intercepte les Server Actions Next.js et les casse (erreur `{}` sur
  // les redirects post-form). On le remettra proprement après validation
  // du flow auth, avec runtimeCaching qui exclut les Server Actions.
  disable: true,
  register: true,
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  workboxOptions: {
    disableDevLogs: true,
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // En-têtes de sécurité (revue du 2026-10-07) : pas d'intégration de nos pages dans un cadre étranger (clic piégé), pas de
  // détection de type MIME, référent limité, API sensibles réservées à notre propre origine.
  poweredByHeader: false,
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
  eslint: {
    // On skip le lint pendant le build Vercel (les règles typescript-eslint
    // ne sont pas installées, et on fait le lint en local via l'IDE).
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Depuis la revue du 2026-10-07 : 0 erreur de type dans les 4 apps (npx tsc --noEmit), le build échoue si un défaut
    // de type est introduit.
    ignoreBuildErrors: false,
  },
};

export default withPWA(nextConfig);
