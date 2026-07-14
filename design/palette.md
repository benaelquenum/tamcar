# TamCar — Palette de couleurs

Identité **bleu roi vif sur fond blanc pur** + accents multiples (doré, violet, cyan) pour un rendu **jovial, moderne, brillant, engageant**. Distinctif vs Yango (orange), Gozem (violet-vert), Bolt (vert), Uber (noir).

## Primary — Bleu roi TamCar

Moderne, tech-startup, énergique. Utilisé pour boutons principaux, liens actifs, marqueurs carte, éléments d'action.

| Token | HEX | Usage |
|---|---|---|
| `primary/50`  | `#EFF6FF` | Fond très clair, hovers subtils |
| `primary/100` | `#DBEAFE` | Fond de badges info, cards secondaires |
| `primary/300` | `#93C5FD` | Bordures interactives, états désactivés |
| `primary/500` | `#2563EB` | **Couleur principale** — boutons, CTA, marqueurs |
| `primary/700` | `#1D4ED8` | Hover boutons primaires, gradient end |
| `primary/900` | `#1E3A8A` | Textes emphasés sur fond clair |

## Neutrals — Blanc pur + slates

Fond blanc pur (#FFFFFF), échelle de slates froids qui contraste avec le bleu.

| Token | HEX | Usage |
|---|---|---|
| `neutral/0`   | `#FFFFFF` | **Fond général de l'app** (blanc pur) |
| `neutral/100` | `#F8FAFC` | Fond secondaire, cards inactives |
| `neutral/200` | `#E2E8F0` | Bordures fines |
| `neutral/400` | `#94A3B8` | Texte tertiaire, placeholders |
| `neutral/600` | `#475569` | Texte secondaire |
| `neutral/900` | `#0F172A` | Texte principal (noir bleuté) |

## Accents — Jovialité + engagement

Utilisés avec parcimonie mais délibérément pour éviter l'effet "app corporate froid".

| Token | HEX | Usage |
|---|---|---|
| `gold/500`   | `#EAB308` | Doré chaleureux — badges positifs, "Recharger", trajets phares |
| `violet/500` | `#8B5CF6` | Violet — icônes wallet, promos, gradients variés |
| `cyan/500`   | `#06B6D4` | Cyan — info, live status, chauffeur en approche |

## Feedback

| Token | HEX | Usage |
|---|---|---|
| `success/500` | `#10B981` | Confirmations, course terminée, chauffeur disponible |
| `warning/500` | `#F59E0B` | Attention, timeout imminent |
| `error/500`   | `#EF4444` | Erreurs, annulations |
| `info/500`    | `#3B82F6` | Infos neutres |

## Glow shadows (nouveauté)

Pour l'effet "brillant, engagement" — utilisés sur les CTAs principaux, cards phares.

| Token | Value | Usage |
|---|---|---|
| `shadow/glow`       | `0 10px 30px -10px rgba(37, 99, 235, 0.5)`   | Bleu primary qui rayonne |
| `shadow/glow-gold`  | `0 10px 30px -10px rgba(234, 179, 8, 0.5)`   | Doré qui rayonne |
| `shadow/glow-violet`| `0 10px 30px -10px rgba(139, 92, 246, 0.5)`  | Violet qui rayonne |

## Gradients recommandés

- **CTA principal** : `bg-gradient-to-r from-primary-500 to-primary-700` + `shadow-glow`
- **Trajet phare** : `bg-gradient-to-br from-primary-500 via-primary-700 to-violet-500`
- **Icon wallet** : `bg-gradient-to-br from-violet-500 to-primary-500`
- **Text hero** : `bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent`

## Dark mode

Pas de dark mode pour le MVP. Structure de tokens conçue pour supporter un scheme `dark/*` en v2 sans refactor.
