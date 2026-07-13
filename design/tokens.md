# TamCar — Tokens design

Toutes les valeurs de spacing, radius, shadows et motion utilisées dans l'app.

## Spacing (multiples de 4)

| Token | Value | Usage typique |
|---|---|---|
| `space/xs`   | 4  | Séparation icônes / texte |
| `space/sm`   | 8  | Padding boutons compacts |
| `space/md`   | 12 | Espacements internes cards |
| `space/lg`   | 16 | Padding standard écrans |
| `space/xl`   | 24 | Espacement entre sections |
| `space/2xl`  | 32 | Espacement grands blocs |
| `space/3xl`  | 48 | Marges hero |
| `space/4xl`  | 64 | Marges très généreuses |

## Radius

| Token | Value | Usage |
|---|---|---|
| `radius/xs`   | 4   | Petits chips, badges |
| `radius/sm`   | 8   | Inputs, boutons compacts |
| `radius/md`   | 12  | Boutons standards |
| `radius/lg`   | 16  | Cards |
| `radius/xl`   | 24  | Bottom sheets |
| `radius/full` | 999 | Cercle parfait (avatars, FAB) |

## Shadows

| Token | Value | Usage |
|---|---|---|
| `shadow/sm` | `0 1px 2px rgba(26,24,21,0.06)` | Cards inactives |
| `shadow/md` | `0 4px 12px rgba(26,24,21,0.08)` | Cards actives, boutons flottants |
| `shadow/lg` | `0 12px 32px rgba(26,24,21,0.12)` | Modals, bottom sheets |
| `shadow/xl` | `0 24px 64px rgba(26,24,21,0.16)` | Overlays plein écran |

## Motion

| Token | Duration | Easing |
|---|---|---|
| `motion/fast`   | 120ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `motion/normal` | 220ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `motion/slow`   | 380ms | `cubic-bezier(0.4, 0, 0.2, 1)` |

Toujours `cubic-bezier(0.4, 0, 0.2, 1)` (material standard) sauf transitions spécifiques (spring pour bottom sheets).
