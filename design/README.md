# TamCar — Design system

Documentation vivante des tokens et de l'identité visuelle TamCar.

## Structure

- `palette.md` — couleurs (primaire **bleu roi**, neutres slate, accents doré/violet/cyan, feedback)
- `typography.md` — police **Sora**, échelle typographique
- `tokens.md` — spacing, radius, shadows, motion
- `logo.svg` — ancien wordmark de secours (⚠️ **obsolète**, voir section Logo)

> 📎 Vue d'ensemble illustrée : `TamCar_charte_graphique.html` (à la racine du repo) rend tout le système en un seul document visuel.

## Utilisation dans le code

Les tokens sont la **source de vérité unique**. Ne jamais recopier une valeur à la main.

- **Apps Next.js (client, driver-portal, web, admin)** : `packages/shared/design-tokens.ts`
  - Objets `colors`, `spacing`, `radius`, `shadow`, `typography`, `motion`
  - Exposés à Tailwind via la config → classes `bg-primary-500`, `text-neutral-900`, `shadow-glow`, `rounded-lg`, etc.
- **Sora** est chargée via `next/font/google` dans chaque `app/layout.tsx` (variable `--font-sora`, zéro layout shift).

> `packages/shared/design_tokens.dart` est un **vestige de la première maquette Flutter** (avant le pivot PWA/Next.js du 2026-07-14). Non utilisé par les apps actuelles — ne pas s'y référer.

**Règle stricte** : ne jamais hard-coder une valeur (`#2563EB`, `16px`, `'Sora'`) dans le code applicatif. Toujours passer par un token / une classe Tailwind. Cela permet le futur dark mode et un rebrand sans refactor global.

## Identité rapide

- **Primary 500** — `#2563EB` — **bleu roi vif** TamCar : moderne, tech, énergique. Distinctif vs Yango (orange), Gozem (violet-vert), Bolt (vert), Uber (noir).
- **Neutral 0** — `#FFFFFF` — blanc pur (fond général de l'app).
- **Neutral 900** — `#0F172A` — noir bleuté (texte principal).
- **Accents** — `gold #EAB308` (badges positifs, « Recharger »), `violet #8B5CF6` (wallet, promos), `cyan #06B6D4` (live, chauffeur en approche). À utiliser avec parcimonie.
- **Effet signature** — dégradés bleus (`from-primary-500 to-primary-700`) + glow (`shadow-glow`) sous les CTA et cards phares → rendu « brillant, engageant ».

> ⚠️ La primaire n'existe qu'en nuances **50, 100, 300, 500, 700, 900**. Pas de 200/400/600/800 — ces classes ne produiraient aucune couleur.

## Logo

Logos officiels (racine du repo, PNG 512×512 à fond blanc) :

- **`icon-client-512.png`** — logo principal : monogramme bleu (lettres stylisées + sillage de vitesse) + wordmark « TamCar ». Client, marketing, documents.
- **`icon-driver-512.png`** — déclinaison chauffeur : même monogramme avec un **volant** intégré + « TamCar · Espace chauffeurs ». Utilisée dans l'app driver-portal (`public/logo.png`).

Zone de protection = la hauteur du monogramme. Poser sur fond blanc / très clair, ou dans une pastille blanche sur fond bleu. Ne pas déformer, recolorer, ni descendre sous ~14 mm de hauteur.

> Le `logo.svg` de ce dossier est l'ancien wordmark provisoire (orange « Tam » + anthracite « Car »), **remplacé** par les logos bleus ci-dessus. Conservé pour historique uniquement.

## Dark mode

Pas de dark mode pour le MVP. La structure des tokens est conçue pour accueillir un scheme `dark/*` en v2 sans refactor.
