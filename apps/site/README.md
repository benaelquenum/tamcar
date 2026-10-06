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

## Confidentialité : aucun chiffre de politique sur le site public
Parts (propriétaire, fonds de rachat, TamCar), planchers de recettes, avance de démarrage et simulations n'apparaissent
**nulle part** dans les pages publiques ni dans le code envoyé au navigateur. Ils sont communiqués à un prospect par une
proposition personnalisée (bouton « Recevoir la proposition » : e-mail prérempli, `PROPOSAL_MAILTO` dans `src/lib/config.ts`),
puis disponibles aux partenaires connectés. Seuls restent publics les chiffres **chauffeurs** (40 % / 80 %, durées de
contrat), qui doivent être connus de tout recruté.

- `src/lib/simulator.server.ts` : toutes les règles (30 %, 7 % puis 8 %, planchers, durées, senteurs). Marqué
  `server-only` : le build échoue si un composant client l'importe. À tenir aligné avec `plan-affaires/build_proposition_flotte.py`.
- `src/app/espace/simulateur/actions.ts` : action serveur qui refait le contrôle d'accès (partenaire ou admin) et ne
  renvoie que des résultats. `src/lib/simulator-ui.ts` : types et mise en forme, sans aucune règle.
- Page `/espace/simulateur` : accessible aux partenaires et aux administrateurs (lien « Simulateur partenaires » dans l'admin
  du client) pour préparer des propositions.
- Après toute modification, vérifier qu'aucune constante ne fuit : chercher les montants dans `.next/static` après `next build`.

## À savoir
- Les pièces à apporter (`src/lib/content.ts`) reprennent celles de l'application (`apps/client/src/lib/appointment.ts`).
- Les pages légales (CGU, confidentialité) restent hébergées par `tamcar-client` : le site y renvoie.
- Les partenaires ne passent pas par l'écran d'acceptation des CGU de l'application : à ajouter si besoin.
