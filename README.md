# TamCar

**VTC pour le Bénin — Porto-Novo, Cotonou, corridor Cotonou ↔ Porto-Novo.**

Application mobile de réservation de courses en temps réel + réservation à l'avance, opérée en partenariat avec des concessionnaires locaux.

---

## Positionnement

- **Base d'opération** : Porto-Novo (marché VTC non servi à date)
- **Killer feature** : corridor Cotonou ↔ Porto-Novo (30 km) avec prix fixe garanti
- **Différenciation** vs Yango / Gozem : transparence tarifaire, feature réservation à l'avance, partenariat concessionnaires-actionnaires

## Architecture

```
apps/
  client/     App mobile client (Flutter, iOS + Android)
  driver/     App mobile chauffeur (Flutter, iOS + Android)
  admin/      Tableau de bord admin (Next.js)
  web/        Site vitrine tamcar.bj (Next.js)

backend/
  supabase/   Schéma DB, migrations, edge functions

packages/
  shared/     Types + constantes partagés (tarifs, splits, statuts)

design/       Logo, palette, exports Figma
docs/         Business plan, valorisation, roadmap
```

## Stack technique

| Composant | Technologie |
|---|---|
| Front mobile (client + chauffeur) | Flutter |
| Backend, DB, Auth, Realtime, Storage | Supabase (PostgreSQL) |
| Cartes + routing | Mapbox |
| Notifications push | Firebase Cloud Messaging |
| Appel in-app chauffeur ↔ client | VoIP (LiveKit ou Agora) |
| Paiements | MTN Mobile Money + Moov Money + cash |
| Portefeuille intégré | TamCar Crédit (client) + TamCar Revenus (chauffeur / concessionnaire) |
| Site vitrine + admin panel | Next.js sur Vercel |

Coût mensuel cible : ~75 USD à l'échelle 10 voitures actives.

## Statut

MVP en cours de développement.

Objectif structurant : plateforme évaluable pour apport en nature à la constitution SARL OHADA (mois 3-4).

## Équipe

- **Terence** — fondateur, produit, développement
- **Claude** — co-développement

---

© TamCar. Tous droits réservés.
