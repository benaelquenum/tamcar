"""Scénario « levée de 13 M, 7 motos, loyer du bureau à 100 000 F » (6 novembre 2026).

Reprend tel quel le scénario `scenarios/levee_13M_7motos/` (levée 13 M, sept motos, aucun tricycle au départ) et y ajoute la décision du
2026-11-06 : local partagé avec BENAEL, loyer du bureau de Cotonou porté de 50 000 F à 100 000 F par mois (hypothèse B37 du classeur ;
la patente, qui suit le loyer, augmente d'environ 102 000 F par an à partir du mois 13).
Les livrables précédents ne sont jamais touchés : celui-ci écrit dans son propre dossier et refuse d'écraser un fichier existant.

Usage (Python 3, Excel et Chrome installés) :
    python preparer_levee_13M_7motos_loyer100k.py atelier   prépare l'atelier (scénario 7 motos + loyer à 100 000 F dans le classeur)
    (dans l'atelier : classeur/projections_v2.py -> recalcul Excel)
    python preparer_levee_13M_7motos_loyer100k.py textes    réécrit les textes du plan (rejouable)
    (dans l'atelier : build.py, verifier.py)
    python preparer_levee_13M_7motos_loyer100k.py livrer    range les fichiers ici, avec le suffixe _13M_7motos_loyer100k
"""
import importlib.util
import pathlib
import sys

ICI = pathlib.Path(__file__).resolve().parent
REPO = ICI.parent.parent
ATELIER = pathlib.Path(r"D:\tmp\ws13_7m_l100")
SUFFIXE = "_13M_7motos_loyer100k"

_spec = importlib.util.spec_from_file_location("preparer_7motos", REPO / "scenarios" / "levee_13M_7motos" / "preparer_levee_13M_7motos.py")
P = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(P)
P.ATELIER, P.PLAN, P.PRISTINE = ATELIER, ATELIER / "plan-affaires", ATELIER / "_pristine"
P.OLD.ATELIER, P.OLD.PLAN = ATELIER, ATELIER / "plan-affaires"
P.ICI, P.SUFFIXE = ICI, SUFFIXE
sub = P.sub


def atelier():
    P.atelier()
    m = P.PLAN / "classeur" / "modele_v2.py"
    # loyer du bureau (hypothèse B37) : 100 000 F au lieu de 50 000 F, avec la note de la décision
    sub(m, '"B5": 0, "B6": 7, **(surcharges or {})}', '"B5": 0, "B6": 7, "B37": 100_000, **(surcharges or {})}')
    sub(m, '    H["C5"] = "Scénario du 2026-10-29',
        '    H["C37"] = "Décision du 2026-11-06 : local partagé BENAEL, loyer porté à 100 000 F"\n    H["C5"] = "Scénario du 2026-10-29')
    print("atelier loyer 100 000 F prêt :", ATELIER)


def textes():
    P.textes()
    sub(P.PLAN / "partie5.html", "avec un loyer budgété de <strong>50 000 FCFA par mois</strong>.",
        "dans un local partagé avec BENAEL, avec un loyer budgété de <strong>100 000 FCFA par mois</strong>.")
    sub(P.PLAN / "gen_partie8.py", "'50 000 de loyer, 100 000 d’électricité et d’eau', 'Fixe', 'Bureau de Cotonou dès le mois 1'",
        "'100 000 de loyer, 100 000 d’électricité et d’eau', 'Fixe', 'Bureau de Cotonou dès le mois 1, local partagé avec BENAEL'")
    print("textes du loyer réécrits")


if __name__ == "__main__":
    {"atelier": atelier, "textes": textes, "livrer": P.livrer}[sys.argv[1]]()
