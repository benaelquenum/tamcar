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

- **Primary 500** — `#EA5D18` — orange chaleureux TamCar, ancrage africain, distinctif vs Yango (bleu) et Gozem (violet)
- **Neutral 0** — `#FFFAF5` — blanc orangé (fond général)
- **Neutral 900** — `#1F1712` — anthracite chaud (texte principal)
- **Accent 500** — `#F4C430` — miel doré (highlights subtils, optionnel)

## Logo

Le SVG actuel (`logo.svg`) est un wordmark provisoire : "Tam" en primary/500 (orange), "Car" en neutral/900 (anthracite chaud), un point accent/500 (miel) en accent. À remplacer par un logo pro en v2 (compter 200-500k FCFA chez un designer à Cotonou).
