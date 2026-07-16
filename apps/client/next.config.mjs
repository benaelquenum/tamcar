import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
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
  eslint: {
    // On skip le lint pendant le build Vercel (les règles typescript-eslint
    // ne sont pas installées, et on fait le lint en local via l'IDE).
    ignoreDuringBuilds: true,
  },
  typescript: {
    // MVP en dev : typecheck fait localement dans l'IDE (VS Code, IntelliJ, etc.)
    // Pas de blocage sur Vercel. À passer à false quand le code sera stable.
    ignoreBuildErrors: true,
  },
};

export default withPWA(nextConfig);
