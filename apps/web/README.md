# TamCar — Site vitrine (tamcar.bj)

Landing page publique + présentation du service.

## Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS avec tokens TamCar
- Fonts Inter via Google Fonts (chargées à l'exécution)

## Développement

```bash
cd apps/web
npm install
npm run dev
```

Ouverture sur http://localhost:3000

## Déploiement Vercel

Une fois `tamcar.bj` acquis (voir tâche #1) :

```bash
npm i -g vercel
vercel link
vercel --prod
```

Puis pointer le DNS de `tamcar.bj` vers Vercel.

## Structure

```
src/
├── app/
│   ├── layout.tsx      Root layout (fonts, meta)
│   ├── page.tsx        Landing page
│   └── globals.css     Tailwind + variables
└── components/         Sections landing (Hero, Corridor, Trust, Cta, Footer)
```
