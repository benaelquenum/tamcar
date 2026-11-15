# Vidéo de présentation TamCar

Vidéo de 100 s (1920 × 1080, 30 images/s, texte à l'écran, sans voix ni musique) : les services, les fonctionnalités et les avantages de TamCar,
avec les **vrais écrans de l'application** (client et TamCar Pro) dans un smartphone animé.

## Principe

1. **Écrans réels, données fictives.** `demo/` lance les vraies applications (client sur le port 3011, chauffeur sur 3012) branchées sur un
   faux serveur Supabase (`demo/mock-supabase.mjs`, port 54321) qui répond avec des données inventées (`demo/fixtures.mjs` : personnes, courses,
   solde, prix de la grille TamCar). **Rien ne touche la base réelle** et aucune clé réelle n'est utilisée. L'heure de la démonstration est fixée à 10 h 40.
2. **Captures.** `demo/capture-client.mjs` et `demo/capture-driver.mjs` photographient les écrans (390 × 844, ×3) dans `demo/shots/` (ignoré par git).
3. **Montage.** `compo/compo.html` + `compo/compo.js` : une composition HTML où tout est fonction du temps (`render(t)`), avec le smartphone, les textes,
   les pastilles et l'écran final. Les textes et le calendrier sont en tête de `compo.js` (`SCENES`, `LAYERS`).
4. **Rendu.** `compo/render.mjs` produit les images avec Chrome et les assemble avec ffmpeg (H.264).

## Refaire la vidéo

```bash
# 1. lancer la démonstration (aperçu « tamcar-video-demo » de .claude/launch.json : serveur factice + app client + app chauffeur)
node video/demo/run-demo.mjs
# 2. photographier les écrans (MSYS_NO_PATHCONV=1 sous Git Bash)
cd video/demo && node capture-client.mjs && node capture-driver.mjs enligne tableau portefeuille historique bienetre
# 3. rendre
cd ../compo && node render.mjs --frame 20            # une image, pour contrôler la mise en page
node render.mjs --video                              # la vidéo complète -> video/out/TamCar_presentation.mp4
```

Les textes ne reprennent que des éléments déjà publics (visuel client, textes de l'application). Aucun logo d'opérateur Mobile Money, aucun chiffre de la
politique partenaire. Les noms, plaques et montants des écrans sont fictifs.
