import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TamCar — VTC pour le Bénin',
  description:
    'Réservez vos courses à Porto-Novo, Cotonou et sur le corridor Cotonou ↔ Porto-Novo. Prix fixe garanti, chauffeurs vérifiés.',
  metadataBase: new URL('https://tamcar.bj'),
  openGraph: {
    title: 'TamCar — VTC pour le Bénin',
    description:
      'Le VTC nouvelle génération pour Porto-Novo, Cotonou et le corridor.',
    type: 'website',
    locale: 'fr_FR',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
