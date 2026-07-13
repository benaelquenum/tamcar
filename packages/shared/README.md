# tamcar_shared

Package Dart/Flutter partagé + fichier TypeScript pour :

- **Design tokens** — couleurs, typographie, spacing, radius, shadows, motion

## Consommateurs

| App | Import |
|---|---|
| Flutter (client, driver) | Ajouter `tamcar_shared: {path: ../../packages/shared}` dans le `pubspec.yaml` puis `import 'package:tamcar_shared/tamcar_shared.dart';` |
| Next.js (admin, web) | Import direct de `design-tokens.ts` (chemin relatif depuis l'app) |

## Source de vérité

`design/palette.md`, `design/typography.md`, `design/tokens.md`.

Toute modification du design system doit répliquer sur :
1. La doc (`design/*.md`)
2. `lib/src/design_tokens.dart` (Dart)
3. `../design-tokens.ts` (TypeScript)
