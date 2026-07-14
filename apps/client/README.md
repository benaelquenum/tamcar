# TamCar — PWA client

Progressive Web App pour les clients TamCar (VTC Bénin). Installable sur iOS / Android via "Ajouter à l'écran d'accueil".

## Setup local

```bash
cd apps/client
npm install
cp .env.example .env.local
# éditer .env.local (Supabase et Mapbox — placeholders OK pour l'instant)
npm run dev
```

Démarre sur http://localhost:3001.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + design tokens partagés (`packages/shared/design-tokens.ts`)
- Supabase (Auth, DB, Realtime, Storage)
- `@ducanh2912/next-pwa` (service worker + manifest, désactivé en dev)
- Mapbox GL JS (à venir)
- Agora / LiveKit (à venir — VoIP in-app)

## Installation sur téléphone

- **iOS** : ouvrir dans Safari → Partager → "Ajouter à l'écran d'accueil"
- **Android** : ouvrir dans Chrome → menu → "Installer l'application"

Une fois installée, la PWA fonctionne comme une app native (plein écran, notifications push, offline basique).

## À ajouter avant production

- Icônes PNG 192×192 et 512×512 dans `public/icons/` (voir `public/icons/README.md`)
- Vraies clés Supabase et Mapbox
- Certificat HTTPS (Vercel s'en occupe automatiquement en prod)

## Structure

```
public/
├── manifest.webmanifest    Manifest PWA
├── logo.svg                Logo (fallback icône)
└── icons/                  Icônes PNG (à générer)

src/
├── app/
│   ├── layout.tsx          Root layout, metadata PWA
│   ├── globals.css         Tailwind + CSS vars + Inter
│   └── page.tsx            Home (wireframe MVP)
├── components/
│   └── Logo.tsx            Logo SVG (partagé avec apps/web)
└── lib/
    └── supabase.ts         Client Supabase
```
