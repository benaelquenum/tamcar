# TamCar — Backend Supabase

Base de données PostgreSQL 15 avec Auth, Realtime, Storage et Edge Functions gérés par [Supabase](https://supabase.com).

## Structure

```
backend/supabase/
├── config.toml                              Configuration projet (ports, auth, storage)
├── migrations/                              Migrations SQL versionnées
│   ├── 20260713120000_initial_schema.sql    Extensions, enums, tables, indexes, triggers
│   ├── 20260713120100_rls_policies.sql      Row Level Security
│   └── 20260713120200_functions.sql         Fonctions métier (dispatch, revenue-share)
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
| `vehicles` | Flotte des concessionnaires |
| `rides` | Courses (immédiates + réservations à l'avance) |
| `wallets` | TamCar Crédit (client) + TamCar Revenus (chauffeur/concessionnaire) |
| `wallet_transactions` | Historique mouvements portefeuille |
| `ratings` | Notation mutuelle chauffeur ↔ client |

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
- `compute_revenue_share(price_total_fcfa)` — split Option A : **57% chauffeur / 25% concessionnaire / 18% plateforme**
- `create_wallets_for_profile()` — trigger qui crée les wallets à l'inscription d'un profil

## Déploiement production

À faire dans une session ultérieure (avant lancement Porto-Novo) :
1. Créer le projet Supabase cloud sur [app.supabase.com](https://app.supabase.com)
2. Configurer les secrets (Mapbox token, MTN Money API keys, Moov Money API keys, LiveKit / Agora keys)
3. Appliquer les migrations : `supabase db push --linked`
4. Configurer les redirect URLs Auth pour `tamcar.bj`, `tamcar.app`
