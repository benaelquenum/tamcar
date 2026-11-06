# Scénario « levée de 13 M, 7 motos, loyer du bureau à 100 000 F » (6 novembre 2026)

Reprend le scénario `scenarios/levee_13M_7motos/` (levée 13 M, sept motos, aucun tricycle au départ) avec la décision du 6 novembre 2026 : **local partagé avec BENAEL, loyer du bureau de Cotonou porté de 50 000 F à 100 000 F par mois**.
Rien n'a été remplacé : `scenarios/levee_13M_7motos/` (loyer 50 000 F), `scenarios/levee_13M/` et les versions à 15 M sont **intacts** (le plan 7 motos d'origine affiche toujours un loyer de 50 000 F).

| Fichier | Version précédente |
|---|---|
| `TamCar_plan_affaires_v6_13M_7motos_loyer100k.html` / `.pdf` (92 p. de contenu) | `scenarios/levee_13M_7motos/TamCar_plan_affaires_v6_13M_7motos.*` |
| `TamCar_resultat_complet_v2_13M_7motos_loyer100k.xlsx` | `scenarios/levee_13M_7motos/TamCar_resultat_complet_v2_13M_7motos.xlsx` (mis à jour le même jour avec le même loyer) |

## Ce qui change

Une hypothèse : B37 (loyer du bureau) 50 000 → **100 000 F**, avec la note de la décision. La patente suit le loyer (droit fixe + part de la valeur locative) : environ + 102 000 F par an à partir du mois 13. Textes du plan : 5.2 (« dans un local partagé avec BENAEL, avec un loyer budgété de 100 000 FCFA par mois ») et 8.3 (ligne « Bureau, électricité et eau »). Tous les chiffres du plan se relisent dans le classeur.

| À 13 M, 7 motos, planchers atteints (avec 6 voitures de tiers sauf mention) | Loyer 50 000 F (29/10) | **Loyer 100 000 F** |
|---|---|---|
| Point bas de trésorerie (mois 1) | 3,17 M | **3,12 M** |
| Trésorerie au mois 12 / au mois 36 | 9,22 / 18,87 M | **8,62 / 16,87 M** |
| Excédent d'exploitation, années 1 / 2 / 3 | 4,10 / 5,08 / 4,57 M | **3,50 / 4,38 / 3,86 M** |
| Point bas à 80 % des planchers | 3,05 M | **3,00 M** |
| Point bas à 70 % des planchers | + 1,40 M (aucun mois négatif) | **− 0,60 M (8 mois négatifs)** |
| Sans voiture de tiers, à 80 % | − 0,18 M (1 mois négatif) | **− 2,18 M (12 mois négatifs)** |
| Sans voiture (ni Afrik Group ni tiers) | − 10,2 M | **− 12,2 M** |
| Seuil de caisse positive : flotte de départ / recrutée | 80,5 % / 67,4 % | **85,7 % / 71,1 %** |
| Seuil d'excédent d'exploitation : flotte de départ / recrutée | 101,6 % / 77,2 % | **107,8 % / 80,7 %** |

Lecture : le loyer coûte 2,0 M sur 36 mois (36 × 50 000 F et la patente) ; toute la courbe de trésorerie baisse d'autant. Le plan ne tient donc plus à 70 % des planchers (il tenait de justesse), et sans les voitures de tiers il ne tient plus à 80 %.

## Reproduire

`preparer_levee_13M_7motos_loyer100k.py` charge le script du scénario 7 motos, change l'atelier (`D:\tmp\ws13_7m_l100`) et le loyer, puis : `atelier`, `classeur/projections_v2.py` dans l'atelier (recalcul Excel), `textes`, `build.py`, `verifier.py`, `livrer` (refuse d'écraser un livrable existant).
Contrôle de mise en page : aucune page nouvelle ne déborde ; restent − 1, − 3 et − 2 px sur les pages 5, 17 et 46, déjà présentes dans les versions précédentes.
Les classeurs modifiés à la main le 6 novembre (15 M, 13 M, 13 M 7 motos) ont été commités séparément (`9af1f62`) ; dans celui des 7 motos, la ligne « Loyer du bureau » (Mensuel, ligne 28) a retrouvé sa formule liée à B37.
