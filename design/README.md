# TamCar — Design system

Documentation vivante des tokens et de l'identité visuelle TamCar.

## Structure

- `palette.md` — couleurs (primary vert, secondary orange, neutrals, feedback)
- `typography.md` — police Inter, échelle typographique
- `tokens.md` — spacing, radius, shadows, motion
- `logo.svg` — logo textuel provisoire (à remplacer par un logo pro en v2)

## Utilisation dans le code

Les tokens sont exposés dans le package partagé et importés par toutes les apps :

- **Flutter (client + driver)** : `packages/shared/design_tokens.dart`
  - Classes `TamCarColors`, `TamCarSpacing`, `TamCarRadius`, `TamCarTypography`
- **TypeScript (admin + web)** : `packages/shared/design-tokens.ts`
  - Objets `colors`, `spacing`, `radius`, `shadow`, `typography`, `motion`

**Règle stricte** : ne jamais hard-coder une valeur (`#0B7A55`, `16.0`, `'Inter'`) dans le code applicatif. Toujours passer par un token. Cela permet dark mode et rebrand sans refactor global.

## Identité rapide

- **Primary 500** — `#0B7A55` — vert émeraude TamCar, distinctif vs Yango (bleu) et Gozem (violet)
- **Secondary 500** — `#F26A2E` — orange chaleureux, accents et marqueurs carte
- **Neutral 900** — `#1A1815` — anthracite chaud (texte principal)
- **Neutral 0** — `#FBFAF7` — blanc cassé (fond général)

## Logo

Le SVG actuel (`logo.svg`) est un wordmark provisoire : "Tam" en primary/500, "Car" en neutral/900, un point secondary/500 comme accent. À remplacer par un logo pro en v2 (compter 200-500k FCFA chez un designer à Cotonou).
