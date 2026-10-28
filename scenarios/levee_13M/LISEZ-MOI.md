# Scénario « levée de 13 M » (28 octobre 2026)

Versions à **13 000 000 F** du plan d'affaires v6, du classeur « Résultat complet » v2 et du dossier d'évaluation IP V2.0.
Les versions à 15 M (racine du dépôt et `plan-affaires/`) sont **intactes** ; rien n'a été remplacé.

| Fichier | Version à 15 M correspondante |
|---|---|
| `TamCar_plan_affaires_v6_13M.html` / `.pdf` (93 p.) | `plan-affaires/TamCar_plan_affaires_v6.*` |
| `TamCar_resultat_complet_v2_13M.xlsx` | `TamCar_resultat_complet_v2.xlsx` |
| `TamCar_dossier_evaluation_IP_13M.html` / `.pptx` | `TamCar_dossier_evaluation_IP.html` / `.pptx` |

Non produits : le résumé du plan, la plaquette actionnaires et la version « révision » du plan (à faire si le scénario est retenu).

## Ce qui change

Une seule hypothèse : la levée (cellule B54 du classeur) passe de 15 M à 13 M. Flotte, planchers, charges, calendrier : ceux du plan v6.

| | 15 M | 13 M |
|---|---|---|
| Valeur totale des apports (levée ÷ 40 %) | 37,5 M | 32,5 M |
| Plateforme apportée par BENAEL (60 %) | 22,5 M | **19,5 M** |
| Position face aux méthodes du dossier IP | entre B (20 M) et C (25,5 M) ; 45 % du coût historique | **sous B** (− 2,5 %) et sous C (− 23,5 %) ; 39 % du coût historique |
| Trésorerie après démarrage (mois 0) | 10,45 M | 8,45 M |
| Point bas, avec voitures de tiers, planchers atteints | 5,85 M (mois 1) | 3,85 M (mois 1) |
| Trésorerie au mois 36, planchers atteints | 20,7 M | 18,7 M |
| Point bas à 80 % / à 70 % des planchers (avec tiers) | 5,65 / 3,17 M | 3,65 / 1,17 M |
| Sans voiture de tiers, à 80 % des planchers | 1,64 M (positif) | **− 0,36 M** (4 mois négatifs) |
| Seuil de caisse positive : flotte de départ / flotte recrutée | 76 % / 64 % | 81 % / 68 % |
| Seuils d'excédent d'exploitation (103 % / 78 %) et de résultat net (106 % / 79 %) | inchangés | inchangés |

Seuils de pilotage ramenés à la nouvelle trésorerie de départ (propositions, non validées) : critère d'extension à Parakou « trésorerie d'au moins 10 M » → **8 M** ; alerte « sous 8 M après le mois 12 » → **6 M**. Le tableau 7.9 compare désormais 13 M, 10 M (3 M de moins) et 5 M.

## Reproduire

`preparer_levee_13M.py atelier` copie `plan-affaires/` dans un atelier temporaire et y remplace les constantes et les textes ; on lance ensuite, dans l'atelier, `classeur/projections_v2.py` (recalcul Excel), `build_dossier_ip.py`, `build_dossier_ip_pptx.py`, `build.py`, `verifier.py` ; `preparer_levee_13M.py livrer` range les fichiers ici avec le suffixe `_13M`. Le script échoue si un texte du plan a bougé (il ne remplace jamais « à l'aveugle »).
