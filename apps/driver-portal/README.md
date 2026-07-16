# TamCar Driver Portal

App Next.js dédiée aux chauffeurs TamCar — séparée de l'app client pour :
- URL / domaine dédié (driver.tamcar.bj)
- UI pure espace pro (pas de partage avec le monde client)
- Auth restreinte au rôle `driver` (middleware bloque tout autre profil)

## Lancer en dev

```bash
cd apps/driver-portal
cp .env.example .env.local  # remplir les valeurs (mêmes que apps/client)
npm install
npm run dev  # http://localhost:3002
```

## Auth

Backend Supabase identique à apps/client. Un utilisateur avec `profile.role != 'driver'` qui tente de se connecter reçoit un message et est déconnecté.

## Routes

- `/login` — connexion phone OTP ou email magic link
- `/` — home chauffeur : go online + courses en attente
- `/dashboard` — gains + jauge courses/jour + véhicule
- `/wallet` — cash + fonds rachat + retrait Mobile Money
- `/history` — historique des courses
- `/ride/[id]` — course en cours / terminée
- `/compte` — profil (lecture seule, modif via TamCar) + déconnexion
