# TamCar — Palette de couleurs

Choix de couleurs pensé pour se distinguer de **Yango** (bleu/jaune, taxi-générique) et **Gozem** (violet/vert froid) : **vert émeraude profond** + **orange ambre chaleureux** + **neutrals chauds tirant vers le beige**.

## Primary — Vert TamCar

Sérieux, confiance, nature. Distinctif visuellement dans l'écosystème VTC ouest-africain.

| Token | HEX | Usage |
|---|---|---|
| `primary/50`  | `#E8F5EE` | Fond très clair, hovers subtils |
| `primary/100` | `#C7E7D5` | Fond de badges succès |
| `primary/300` | `#6BBF95` | Bordures interactives |
| `primary/500` | `#0B7A55` | **Couleur principale** — boutons, liens actifs, accents |
| `primary/700` | `#085F42` | Hover boutons primaires |
| `primary/900` | `#043A28` | Textes sur fond clair, éléments héro |

## Secondary — Orange TamCar

Chaleur, dynamisme, ancrage africain. Utilisé pour highlights, CTA secondaires, marqueurs cartographiques.

| Token | HEX | Usage |
|---|---|---|
| `secondary/100` | `#FDE4D2` | Fond léger badges promo |
| `secondary/500` | `#F26A2E` | **Accent principal** — marqueurs carte, promos, réservation à l'avance |
| `secondary/700` | `#C24B15` | Hover accents secondaires |

## Neutrals

Anthracite chaud + gris tirant vers le beige (évite le look "clinique" bleuté générique).

| Token | HEX | Usage |
|---|---|---|
| `neutral/0`   | `#FBFAF7` | Fond général de l'app |
| `neutral/100` | `#F0EDE7` | Fond secondaire, cards inactives |
| `neutral/200` | `#DDD8CE` | Bordures fines |
| `neutral/400` | `#9A968D` | Texte tertiaire, placeholders |
| `neutral/600` | `#5D5A54` | Texte secondaire |
| `neutral/900` | `#1A1815` | Texte principal |

## Feedback

| Token | HEX | Usage |
|---|---|---|
| `success/500` | `#2E9E5C` | Confirmations, course terminée |
| `warning/500` | `#F1B24A` | Attention, timeout imminent |
| `error/500`   | `#DC2E44` | Erreurs, annulations |
| `info/500`    | `#2E7CDC` | Infos neutres |

## Dark mode

Pas de dark mode pour le MVP. Structure de tokens conçue pour supporter un scheme `dark/*` en v2 sans refactor.
