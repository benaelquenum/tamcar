# TamCar — Typographie

## Choix

**Sora** partout — [Google Fonts](https://fonts.google.com/specimen/Sora). Chargée via `next/font/google` (perf optimale, zero layout shift). Gratuite, licence commerciale OK. Géométrique arrondie, chaleureuse, très lisible sur mobile.

Weights utilisés : `400`, `500`, `600`, `700`, `800`.

## Échelle

| Token | Size / Line-height | Weight | Usage |
|---|---|---|---|
| `display/xl` | 32 / 40 | 800 | Titres écrans onboarding |
| `display/lg` | 28 / 36 | 700 | En-têtes principaux |
| `heading/lg` | 22 / 30 | 700 | Titres sections |
| `heading/md` | 18 / 26 | 600 | Sous-titres |
| `body/lg`    | 16 / 24 | 500 | Corps principal, boutons |
| `body/md`    | 14 / 20 | 400 | Corps secondaire |
| `caption`    | 12 / 16 | 500 | Labels, méta |
| `mono/price` | 18 / 24 | 700 (tabular figures) | Montants FCFA |

## Règles

- Un seul poids par bloc pour éviter les mix incohérents
- Chiffres FCFA toujours en `fontVariantNumeric: 'tabular-nums'` pour éviter les décalages d'alignement dans les listes
- Boutons : `body/lg` en `weight 600`
- Titres hero : `text-4xl` ou `text-5xl` en `font-extrabold` (800) pour l'impact
