import type { Metadata, Viewport } from 'next';
import { Sora } from 'next/font/google';
import './globals.css';
import { ScrollDriver } from '@/components/anim/ScrollDriver';

const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'TamCar — Votre véhicule roule, vous encaissez',
    template: '%s — TamCar',
  },
  description:
    'TamCar, le VTC du Bénin : Cotonou, Porto-Novo et le corridor. Confiez votre véhicule à un chauffeur vérifié et suivez vos gains en direct.',
  applicationName: 'TamCar',
  icons: { icon: '/favicon.ico' },
  openGraph: {
    title: 'TamCar — Votre véhicule roule, vous encaissez',
    description: 'Partenaires véhicule, chauffeurs et clients : le VTC du Bénin à prix fixe.',
    locale: 'fr_BJ',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#2563EB',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={sora.variable}>
      <body className="font-sans antialiased">
        <ScrollDriver />
        {children}
      </body>
    </html>
  );
}
