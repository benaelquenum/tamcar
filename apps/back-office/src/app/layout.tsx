import type { Metadata, Viewport } from 'next';
import { Sora } from 'next/font/google';
import './globals.css';
import { TopProgressBar } from '@/components/TopProgressBar';

const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TamCar Office — Back-office administratif',
  description:
    'Secrétariat, trésorerie, comptabilité et RH de TamCar : courrier, documents, échéances, écritures.',
  applicationName: 'TamCar Office',
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#2563EB',
  width: 'device-width',
  initialScale: 1,
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
        {children}
      </body>
    </html>
  );
}
