import type { Metadata, Viewport } from 'next';
import { Sora } from 'next/font/google';
import './globals.css';
import { EnableNotifications } from '@/components/EnableNotifications';
import { InstallPwaBanner } from '@/components/InstallPwaBanner';
import { TopProgressBar } from '@/components/TopProgressBar';
import { NativeBackHandler } from '@/components/NativeBackHandler';
import { NewRideWatcher } from '@/components/NewRideWatcher';
import { NativePushRegistrar } from '@/components/NativePushRegistrar';
import { RefreshButton } from '@/components/RefreshButton';

const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TamCar Pro — Espace chauffeur',
  description: "Espace chauffeur TamCar : acceptez des courses, suivez vos gains, gérez votre portefeuille.",
  manifest: '/manifest.webmanifest',
  applicationName: 'TamCar Pro',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TamCar Pro',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#2563EB',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={sora.variable}>
      <body className="font-sans antialiased">
        <TopProgressBar />
        <NativeBackHandler />
        <NewRideWatcher />
        <NativePushRegistrar />
        <EnableNotifications />
        <InstallPwaBanner />
        <RefreshButton />
        {children}
      </body>
    </html>
  );
}
