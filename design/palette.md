# TamCar — Palette de couleurs

Identité **orange chaleureuse** sur fond **blanc orangé** : soleil, mobilité africaine, énergie. Distinctif vs Yango (bleu-jaune, taxi-générique) et Gozem (violet-vert froid).

## Primary — Orange TamCar

Chaleur, dynamisme, ancrage africain. Utilisé pour boutons principaux, liens actifs, marqueurs carte, éléments d'action.

| Token | HEX | Usage |
|---|---|---|
| `primary/50`  | `#FEF3EC` | Fond très clair, hovers subtils |
| `primary/100` | `#FDE0CC` | Fond de badges info |
| `primary/300` | `#F8A26D` | Bordures interactives, états désactivés |
| `primary/500` | `#EA5D18` | **Couleur principale** — boutons, CTA, marqueurs |
| `primary/700` | `#B84812` | Hover boutons primaires |
| `primary/900` | `#7A2E08` | Textes emphasés sur fond clair |

## Neutrals — Blanc orangé à anthracite chaud

Fond général blanc légèrement teinté orange (pas de gris froid). Toute la scale de neutrals tire vers le chaud pour créer une identité cohérente.

| Token | HEX | Usage |
|---|---|---|
| `neutral/0`   | `#FFFAF5` | **Fond général de l'app** (blanc orangé) |
| `neutral/100` | `#FBEFE3` | Fond secondaire, cards inactives |
| `neutral/200` | `#F0DCC8` | Bordures fines |
| `neutral/400` | `#A28E7D` | Texte tertiaire, placeholders |
| `neutral/600` | `#5C4D3F` | Texte secondaire |
| `neutral/900` | `#1F1712` | Texte principal (anthracite chaud) |

## Accent — Miel

Optionnel. Utilisé avec parcimonie pour highlights positifs, badges premium, moments de célébration (course terminée avec bonus, etc.). Ne pas mélanger avec primary sur le même écran sans hiérarchie claire.

| Token | HEX | Usage |
|---|---|---|
| `accent/500` | `#F4C430` | Miel doré — highlights subtils |

## Feedback

Choisis pour rester distinguables du primary orange (pas de warning orange qui se confondrait avec la primary).

| Token | HEX | Usage |
|---|---|---|
| `success/500` | `#2E9E5C` | Confirmations, course terminée |
| `warning/500` | `#D4A017` | Attention, timeout imminent (jaune ambre, distinct du primary) |
| `error/500`   | `#C1272D` | Erreurs, annulations (rouge terracota, s'accorde à l'orange) |
| `info/500`    | `#2E7CDC` | Infos neutres |

## Dark mode

Pas de dark mode pour le MVP. Structure de tokens conçue pour supporter un scheme `dark/*` en v2 sans refactor.
