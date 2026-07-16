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
    // Idem : le typecheck se fait en local, on ne bloque pas le build prod.
    ignoreBuildErrors: false,
  },
};

export default withPWA(nextConfig);
