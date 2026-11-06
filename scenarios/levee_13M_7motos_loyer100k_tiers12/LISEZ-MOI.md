# Scénario « levée de 13 M, 7 motos, loyer 100 000 F, 12 voitures de tiers » (6 novembre 2026)

Reprend `scenarios/levee_13M_7motos_loyer100k/` (levée 13 M, sept motos, aucun tricycle au départ, loyer du bureau de Cotonou à 100 000 F) et applique la décision de recrutement du 6 novembre 2026 : **12 voitures de tiers (6 Essentiel + 6 Confort), arrivées régulières du mois 4 au mois 12**, au lieu de 6 (3 + 3).
Rien n'a été remplacé : les dossiers `scenarios/levee_13M/`, `levee_13M_7motos/`, `levee_13M_7motos_loyer100k/` et les versions à 15 M sont **intacts**.

| Fichier | Version précédente |
|---|---|
| `TamCar_plan_affaires_v6_13M_7motos_loyer100k_tiers12.html` / `.pdf` (92 p. de contenu) | `scenarios/levee_13M_7motos_loyer100k/TamCar_plan_affaires_v6_13M_7motos_loyer100k.*` |
| `TamCar_resultat_complet_v2_13M_7motos_loyer100k_tiers12.xlsx` | `scenarios/levee_13M_7motos_loyer100k/TamCar_resultat_complet_v2_13M_7motos_loyer100k.xlsx` |

## Ce qui change

Deux hypothèses du classeur : voitures Essentiel de tiers (B95) 3 → **6** et voitures Confort de tiers (B96) 3 → **6**. Tout le reste est inchangé : électricité et eau (100 000 F par mois), secrétaire-comptable, **développeur à plein temps dès le mois 13**, TamAssur financé par la part de TamCar (1 000 F par jour et par véhicule), planchers, levée de 13 M, 7 motos. Textes du plan : « au minimum douze voitures de tiers », « six Essentiel et six Confort », nouvelle ligne « 6 Essentiel + 6 Confort » dans le tableau des flottes types (10.8), jalon « Douze voitures de tiers en service ». Dans le classeur, la feuille Seuils, la note de l'hypothèse B95 et la ligne de la feuille « Décisions v2 » sont mises à jour.

| À 13 M, 7 motos, loyer 100 000 F, planchers atteints (avec les voitures de tiers) | 6 voitures de tiers | **12 voitures de tiers** |
|---|---|---|
| Point bas de trésorerie (mois 1) | 3,12 M | **3,12 M** |
| Trésorerie au mois 12 / au mois 36 | 8,62 / 16,87 M | **10,38 / 28,76 M** |
| Excédent d'exploitation, années 1 / 2 / 3 | 3,50 / 4,38 / 3,86 M | **5,25 / 9,59 / 8,79 M** |
| À 80 % des planchers : point bas ; excédent années 1 / 2 / 3 | 3,00 M ; − 0,3 / + 0,4 / − 0,1 M | **3,00 M ; + 0,9 / + 4,2 / + 3,4 M** |
| À 70 % des planchers : point bas ; excédent années 1 / 2 / 3 | − 0,60 M (8 mois négatifs) ; − 2,1 / − 1,6 / − 2,1 M | **+ 2,41 M ; − 1,3 / + 1,5 / + 0,7 M** |
| Seuil d'excédent d'exploitation positif / de caisse positive | 80,7 % / 71,1 % | **67,6 % / 62,1 %** |
| Sans les voitures d'Afrik Group (tiers seuls) : point bas | − 2,38 M (12 mois négatifs) | **+ 2,26 M (aucun mois négatif)** |

Lecture : le point bas du démarrage ne bouge pas (les voitures de tiers arrivent à partir du mois 4 et n'immobilisent aucun capital), mais le plan retrouve sa marge de sécurité : il tient à 70 % des planchers et ne dépend plus des voitures d'Afrik Group. Chaque voiture de tiers rapporte, à 70 %, 28 000 F par mois (Essentiel) ou 40 000 F (Confort) pour 30 000 F de frais d'entrée.

## À ne pas oublier

* **Supervision au-delà de 20 véhicules : non modélisée.** La flotte passe à 28 véhicules (16 + 12). Le responsable des opérations est plafonné à 150 000 F par mois ; au-delà, un second responsable sera nécessaire (ordre de grandeur : 1 à 1,5 M F par an à planchers atteints, moins à 70 %). Le plan reste largement positif, mais ce poste n'est pas dans les chiffres.
* **Rythme de recrutement** : 12 voitures en 9 mois, soit environ 1,3 par mois ; le plancher du plan reste 6.
* Les classeurs modifiés à la main le 6 novembre (15 M, 13 M, 13 M 7 motos : commit `9af1f62`) ont une feuille **Seuils non recalculée** (valeurs figées de l'ancien loyer) ; les classeurs de ce dossier et de `levee_13M_7motos_loyer100k/` sont recalculés.

## Reproduire

`preparer_levee_13M_7motos_loyer100k_tiers12.py` charge le script du scénario précédent, change l'atelier (`D:\tmp\ws13_7m_t12`) et le recrutement : `atelier`, `classeur/projections_v2.py` dans l'atelier (recalcul Excel), `textes`, `build.py`, `verifier.py`, `livrer` (refuse d'écraser un livrable existant).
Contrôle de mise en page : aucune page nouvelle ne déborde ; restent − 1, − 3 et − 2 px sur les pages 5, 17 et 46, déjà présentes dans les versions précédentes.
