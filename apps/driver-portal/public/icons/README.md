# Icons PWA

À générer avant production. Deux méthodes :

## Méthode 1 : Real Favicon Generator (web, 2 min)

1. Aller sur https://realfavicongenerator.net/
2. Upload `../logo.svg`
3. Configurer les tailles + couleur de fond `#FFFAF5`
4. Télécharger le pack, copier dans ce dossier :
   - `icon-192.png` (192×192)
   - `icon-512.png` (512×512)
   - `icon-maskable-512.png` (512×512 avec safe zone)

## Méthode 2 : ImageMagick local

```bash
cd public/icons
convert ../logo.svg -resize 192x192 icon-192.png
convert ../logo.svg -resize 512x512 icon-512.png
```

## En attendant

Le manifest référence `../logo.svg` en fallback (fonctionne dans Chrome / Edge / Firefox — Safari iOS préfère PNG).
