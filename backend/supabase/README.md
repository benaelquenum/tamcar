# TamCar — Backend Supabase

Base de données PostgreSQL 15 avec Auth, Realtime, Storage et Edge Functions gérés par [Supabase](https://supabase.com).

## Structure

```
backend/supabase/
├── config.toml                              Configuration projet (ports, auth, storage)
├── migrations/                              Migrations SQL versionnées
│   ├── 20260713120000_initial_schema.sql    Extensions, enums, tables, indexes, triggers
│   ├── 20260713120100_rls_policies.sql      Row Level Security
│   ├── 20260713120200_functions.sql         Fonctions métier (dispatch, revenue-share)
│   ├── 20260715120000_extend_enums.sql      Enum vehicle_category + wallet_kind rachat
│   └── 20260715120100_pricing_and_ops.sql   pricing_tiers, checkpoints, corridor_prices, compute_price
└── seed.sql                                 Données de démo (dev only)
```

## Prérequis

- Node.js ≥ 18
- Docker Desktop (pour lancer Supabase local)
- Supabase CLI : `npm i -g supabase`

## Démarrage local

```bash
cd backend/supabase
supabase start          # démarre Postgres + Auth + Realtime + Studio
supabase db reset       # applique migrations + seed
```

- Studio (Interface DB) : http://localhost:54323
- API : http://localhost:54321
- DB : postgres://postgres:postgres@localhost:54322/postgres

## Modèle de données

| Table | Rôle |
|---|---|
| `profiles` | Extend `auth.users` avec `role` (client, driver, dealer, admin) |
| `dealer_partners` | Concessionnaires — associés ou simple partenaires |
| `drivers` | Chauffeurs + position géo temps réel |
| `vehicles` | Flotte des concessionnaires. Colonne `category` (essentiel / confort / premium) |
| `rides` | Courses (immédiates + réservations à l'avance). Ventilation `driver_share` + `driver_rachat` + `dealer_share` + `platform_share` |
| `wallets` | TamCar Crédit (client) + TamCar Revenus (chauffeur/concessionnaire) + **TamCar Rachat** (chauffeur, séquestre cession) |
| `wallet_transactions` | Historique mouvements portefeuille |
| `ratings` | Notation mutuelle chauffeur ↔ client |
| `pricing_tiers` | Grille tarifaire par catégorie (base, km ville, km corridor, min, clim, plafond km/j) |
| `checkpoints` | Points de rabattement corridor (Tokpa, Ass. PN...) avec rayon d'inclusion |
| `corridor_prices` | Prix fixe entre 2 checkpoints × catégorie × jour/nuit (± package A-R) |

## Sécurité (RLS)

Row Level Security activé sur **toutes** les tables. Chaque table a des policies restreignant l'accès aux propriétaires légitimes.

Règle générale :
- Un client ne voit que ses propres courses et son propre wallet
- Un chauffeur ne voit que les courses qui lui sont assignées
- Un concessionnaire voit les courses de ses voitures
- Un admin voit tout

Voir `migrations/20260713120100_rls_policies.sql`.

## Fonctions Postgres

- `find_nearby_drivers(lat, lng, radius_km, limit_count)` — recherche géospatiale des chauffeurs disponibles dans un rayon
- `compute_price(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, distance_km, duration_min, category, is_night, with_ac)` — calcule prix total + ventilation revenue-share. Gère automatiquement le tarif corridor (rabattement A→C1 + prix fixe C1→C2 + rabattement C2→B) OU le tarif standard (base + max(km, min)) selon la géolocalisation des checkpoints. Voir memory `tamcar-pricing-and-ops` pour la logique métier détaillée.
- `compute_revenue_share(price_total_fcfa)` — split "avec cession" : **52% chauffeur cash + 5% chauffeur rachat + 28% concessionnaire + 15% plateforme**
- `create_wallets_for_profile()` — trigger qui crée les wallets à l'inscription : `tamcar_credit` pour tous, `tamcar_revenus` pour driver/dealer, `tamcar_rachat` pour driver uniquement (séquestre cession échelonnée)

## Déploiement production

À faire dans une session ultérieure (avant lancement Porto-Novo) :
1. Créer le projet Supabase cloud sur [app.supabase.com](https://app.supabase.com)
2. Configurer les secrets (Mapbox token, MTN Money API keys, Moov Money API keys, LiveKit / Agora keys)
3. Appliquer les migrations : `supabase db push --linked`
4. Configurer les redirect URLs Auth pour `tamcar.bj`, `tamcar.app`
