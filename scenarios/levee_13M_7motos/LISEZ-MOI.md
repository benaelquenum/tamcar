# Scénario « levée de 13 M, 7 motos, aucun tricycle au départ » (29 octobre 2026)

Version à **13 000 000 F** du plan d'affaires v6 et du classeur « Résultat complet » v2 avec une flotte propre de **sept motos électriques** (au lieu d'un tricycle thermique et de cinq motos).
Rien n'a été remplacé : les versions à 15 M (racine du dépôt et `plan-affaires/`) et celles du scénario 13 M précédent (`scenarios/levee_13M/`) sont **intactes**.

| Fichier | Version précédente correspondante |
|---|---|
| `TamCar_plan_affaires_v6_13M_7motos.html` / `.pdf` (92 p. de contenu) | `scenarios/levee_13M/TamCar_plan_affaires_v6_13M.*` (93 p.) |
| `TamCar_resultat_complet_v2_13M_7motos.xlsx` | `scenarios/levee_13M/TamCar_resultat_complet_v2_13M.xlsx` |

Non refaits : le dossier d'évaluation IP (il ne décrit pas la flotte : `scenarios/levee_13M/TamCar_dossier_evaluation_IP_13M.*` reste valable), le résumé du plan, la plaquette actionnaires et la version « révision ».

## Ce qui change (par rapport au plan v6, 13 M)

Deux hypothèses du classeur : tricycles achetés au mois 1 (B5) 1 → **0** ; motos achetées au mois 1 (B6) 5 → **7**. Levée 13 M, planchers, charges, voitures d'Afrik Group et de tiers : inchangés. Flotte de départ : **16 véhicules** (7 motos + 9 voitures) au lieu de 15. Mise de départ de la flotte propre : **4 858 000 F** (694 000 F par moto : 475 000 + assurance 50 000 + tracker 139 000 + entrée 30 000).

| À 13 M, planchers atteints (avec 6 voitures de tiers sauf mention) | 1 tricycle (30 % + 12 mois, non accordé) + 5 motos | 1 tricycle comptant + 5 motos | **7 motos** |
|---|---|---|---|
| Point bas de trésorerie (mois 1) | 3,85 M | 2,76 M | **3,17 M** |
| Point bas à 80 % / 70 % des planchers | 3,65 / 1,17 M | 2,64 / 1,17 M | **3,05 / 1,40 M** |
| Démarrage lent (3 mois à 0 % puis 100 %) | 1,05 M | 0,15 M | **0,49 M** |
| Trésorerie au mois 36 | 18,7 M | 18,75 M | **18,87 M** |
| Sans voiture de tiers, à 80 % | − 0,36 M (4 mois négatifs) | − 0,36 M (4 mois) | **− 0,18 M** (1 mois) |
| Seuil de caisse positive : flotte de départ / recrutée | 81 % / 68 % | n. c. | **80,5 % / 67,4 %** |
| Seuils d'excédent d'exploitation : flotte de départ / recrutée | 103 % / 78 % | n. c. | **101,6 % / 77,2 %** |

Le tricycle disparaît de la flotte propre : le plan indique qu'un tricycle thermique (1 550 000 F, **au comptant**) pourra être acheté vers le mois 13, quand les planchers sont vérifiés (décision à prendre ; aucun achat n'est budgété).
Les colonnes « tricycle » viennent des simulations du 29 octobre ; « 7 motos » vient du classeur lui-même (moteur de simulation contrôlé contre Excel : écart nul sur 10 scénarios).

## Textes du plan réécrits

Chapitres 3 (une phrase), 5 (flotte de départ, tableau de financement, responsable des opérations), 6.4 (achat des véhicules : tableau à une catégorie, bloc « Aucun tricycle au départ »), 7 (hypothèses, 7.4 investissement et mise de départ, tableau 7.9, étiquettes), 8 (8.1 à 8.6 : le tableau des mensualités et la dette envers le fournisseur disparaissent, plus aucun paiement échelonné), 9 (risques, actif de TamCar), 10 (feuille de route, jalons, calendrier).

## Deux corrections au passage (présentes dans ce plan seulement)

* Le responsable des opérations : le plan écrivait « 114 010 FCFA au mois 1, plafond atteint au mois 8 », chiffres restés de l'ancienne version. Le classeur donne **135 135 F au mois 1, plafond au mois 5** : le texte est maintenant lu dans le classeur.
* `gen_partie11.py` (architecture technique) refusait de se générer : la table `ride_end_reviews` (migration du 28 octobre) n'était rattachée à aucun domaine. Elle est rattachée à « Courses » dans l'atelier ; **le fichier du dépôt n'est pas modifié** (la même correction sera nécessaire pour régénérer les versions à 15 M).
  Les chiffres du chapitre 11 (tables, fonctions, lignes de code) reflètent le dépôt d'aujourd'hui.

## Reproduire

`preparer_levee_13M_7motos.py atelier` reprend le scénario 13 M (`scenarios/levee_13M/preparer_levee_13M.py`) dans un atelier temporaire (`D:\tmp\ws13_7m`) et change la flotte du classeur ; on lance `classeur/projections_v2.py` dans l'atelier (recalcul Excel) ; `preparer_levee_13M_7motos.py textes` réécrit les textes du plan (rejouable : repart d'une copie intacte) ; puis `build.py` et `verifier.py` ; enfin `preparer_levee_13M_7motos.py livrer` range les fichiers ici (il refuse d'écraser un livrable existant). Le script échoue si un texte du plan a bougé : il ne remplace jamais « à l'aveugle ».
Contrôle de mise en page (`verifier.py`) : aucune page nouvelle ne déborde ; restent − 1, − 3 et − 2 px sur trois pages (5, 17 et 46), déjà présentes dans la version précédente (− 5, − 6 et − 6 px).
