# TamCar : site web

Le **seul site web** de TamCar : vitrine publique (clients, chauffeurs, partenaires) et **espace partenaire**
(connexion, tableau de bord en direct, véhicules, historique, compte). `tamcar-client` et `tamcar-driver-portal`
restent des applications.

- Next.js 14 (app router), Tailwind avec les jetons de `packages/shared/design-tokens.ts`, police Sora.
- Authentification et données : le **même projet Supabase** que les applications. L'espace partenaire appelle
  les fonctions `dealer_my_*` (le partenaire ne voit que sa part).
- Port : `npm run dev` (3005).

## Variables d'environnement (voir `.env.example`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` ; facultatives : `NEXT_PUBLIC_CLIENT_APP_URL`,
`NEXT_PUBLIC_DRIVER_APP_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_SITE_URL`.

## Animations (univers automobile uniquement)
`src/components/anim/` : `Wheel` (roue qui tourne avec le défilement), `Road` (chaussée en perspective),
`TrafficLight` (feu tricolore), `Gauge` (compteur de bord), `TireTracks` (traces de pneus dessinées au
défilement), `Exhaust` (échappement), `Reveal` (apparition). Tout est désactivé par `prefers-reduced-motion`.

## Simulateur de gains
`src/lib/simulator.ts` : mêmes règles que la proposition faite aux partenaires (part course 30 %, rachat 7 % puis
8 %, planchers de recettes, durées de contrat, 36 000 F par an de senteurs sur les voitures). À tenir aligné
avec `plan-affaires/build_proposition_flotte.py`.

## À savoir
- Les pièces à apporter (`src/lib/content.ts`) reprennent celles de l'application (`apps/client/src/lib/appointment.ts`).
- Les pages légales (CGU, confidentialité) restent hébergées par `tamcar-client` : le site y renvoie.
- Les partenaires ne passent pas par l'écran d'acceptation des CGU de l'application : à ajouter si besoin.
