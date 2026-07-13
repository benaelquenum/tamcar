# TamCar — App mobile client

App iOS + Android pour les clients TamCar (Flutter).

## Prérequis

- Flutter ≥ 3.22 (`flutter doctor` doit être vert)
- Android Studio ou Xcode selon la cible
- Un fichier `.env` (copier `.env.example`)

## Bootstrapping

```bash
cd apps/client

# Générer les dossiers natifs android/ + ios/ (une seule fois)
flutter create . --platforms=android,ios --org=bj.tamcar --project-name=tamcar_client

# Copier l'exemple et remplir
cp .env.example .env

# Récupérer les dépendances
flutter pub get

# Lancer sur un émulateur ou un device connecté
flutter run
```

## Assets à télécharger avant `flutter run`

Les fonts Inter ne sont pas dans le repo. À télécharger :

1. https://fonts.google.com/specimen/Inter → **Download family**
2. Copier ces fichiers dans `assets/fonts/` :
   - `Inter-Regular.ttf`
   - `Inter-Medium.ttf`
   - `Inter-SemiBold.ttf`
   - `Inter-Bold.ttf`
   - `Inter-ExtraBold.ttf`

## Structure

```
lib/
├── main.dart                    Entry point (init dotenv, Supabase, runApp)
├── app.dart                     MaterialApp.router + thème
├── core/
│   ├── theme/theme.dart         ThemeData depuis TamCarColors/Typography
│   ├── router/router.dart       Config go_router
│   └── env/env.dart             Chargement variables .env
└── features/
    ├── splash/                  Écran de démarrage
    ├── auth/                    (à venir) OTP téléphone
    ├── home/                    Carte + saisie course
    ├── ride/                    (à venir) Course en cours
    ├── wallet/                  (à venir) TamCar Crédit
    ├── history/                 (à venir) Historique courses
    └── profile/                 (à venir) Profil client
```

## Statut MVP

Squelette structurel prêt à compiler. Prochaines itérations : auth OTP, intégration Mapbox, wallet, notifications push, appel VoIP.
