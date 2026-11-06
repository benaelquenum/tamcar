"""Scénario « levée de 13 M, 7 motos, loyer à 100 000 F, 12 voitures de tiers » (6 novembre 2026).

Reprend `scenarios/levee_13M_7motos_loyer100k/` (levée 13 M, sept motos, loyer du bureau 100 000 F) et applique la décision de recrutement
du 2026-11-06 : l'objectif de voitures de tiers passe de 6 (3 Essentiel + 3 Confort) à **12 (6 Essentiel + 6 Confort)**, arrivées régulières du mois 4
au mois 12. Rien d'autre ne change : électricité et eau, secrétaire-comptable, développeur (plein temps dès le mois 13) et TamAssur restent ceux du plan.
Les livrables précédents ne sont jamais touchés : celui-ci écrit dans son propre dossier et refuse d'écraser un fichier existant.

Usage (Python 3, Excel et Chrome installés) :
    python preparer_levee_13M_7motos_loyer100k_tiers12.py atelier   prépare l'atelier
    (dans l'atelier : classeur/projections_v2.py -> recalcul Excel)
    python preparer_levee_13M_7motos_loyer100k_tiers12.py textes    réécrit les textes du plan (rejouable)
    (dans l'atelier : build.py, verifier.py)
    python preparer_levee_13M_7motos_loyer100k_tiers12.py livrer    range les fichiers ici, avec le suffixe _13M_7motos_loyer100k_tiers12
"""
import importlib.util
import pathlib
import sys

ICI = pathlib.Path(__file__).resolve().parent
REPO = ICI.parent.parent
ATELIER = pathlib.Path(r"D:\tmp\ws13_7m_t12")
SUFFIXE = "_13M_7motos_loyer100k_tiers12"

_spec = importlib.util.spec_from_file_location("preparer_loyer100k", REPO / "scenarios" / "levee_13M_7motos_loyer100k" / "preparer_levee_13M_7motos_loyer100k.py")
L = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(L)
P = L.P
P.ATELIER, P.PLAN, P.PRISTINE = ATELIER, ATELIER / "plan-affaires", ATELIER / "_pristine"
P.OLD.ATELIER, P.OLD.PLAN = ATELIER, ATELIER / "plan-affaires"
P.ICI, P.SUFFIXE = ICI, SUFFIXE
sub = P.sub


def atelier():
    L.atelier()
    cl = P.PLAN / "classeur"
    m = cl / "modele_v2.py"
    # 6 Essentiel + 6 Confort de tiers par défaut (B95, B96)
    sub(m, '"B37": 100_000, **(surcharges or {})}', '"B37": 100_000, "B95": 6, "B96": 6, **(surcharges or {})}')
    sub(m, "Décision du 2026-10-18 : au minimum 3 Essentiel + 3 Confort de tiers ; mettre 0 pour les exclure",
        "Décision du 2026-11-06 : 6 Essentiel + 6 Confort de tiers, soit 12 voitures (3 + 3 au 2026-10-18) ; mettre 0 pour les exclure")
    sub(m, "au minimum 6 voitures de tiers (3 Essentiel, 3 Confort) ", "au minimum 12 voitures de tiers (6 Essentiel, 6 Confort) ")
    p = cl / "projections_v2.py"
    sub(p, '("avec_tiers", dict(ess=3, conf=3))', '("avec_tiers", dict(ess=6, conf=6))')
    sub(p, "ess=3, conf=3, delta_part=d", "ess=6, conf=6, delta_part=d", 3)
    sub(p, "SIM.simuler(b2, p, ess=3, conf=3)", "SIM.simuler(b2, p, ess=6, conf=6)")
    sub(p, "B. Avec le minimum décidé : 3 Essentiel + 3 Confort de tiers, arrivées étalées du mois 4 au mois 12",
        "B. Avec le minimum décidé : 6 Essentiel + 6 Confort de tiers, arrivées étalées du mois 4 au mois 12")
    sub(p, '        "3 Essentiel + 3 Confort": dict(ess=3, conf=3),', '        "6 Essentiel + 6 Confort": dict(ess=6, conf=6),\n        "3 Essentiel + 3 Confort": dict(ess=3, conf=3),')
    sub(p, "Recrutement d'au minimum 6 voitures de tiers (3 Essentiel + 3 Confort) entre le mois 4 et le mois 12\", \"2026-10-18\",",
        "Recrutement d'au minimum 12 voitures de tiers (6 Essentiel + 6 Confort) entre le mois 4 et le mois 12\", \"2026-10-18, porté à 12 le 2026-11-06\",")
    sub(p, "Avec les 6 véhicules de tiers, la caisse reste positive 3 ans à 70 % (la levée de 13 M absorbe l'écart), mais l'excédent d'exploitation est négatif ; sans eux, la caisse devient négative.",
        "Avec les 12 véhicules de tiers, la caisse reste positive 3 ans à 70 % (la levée de 13 M absorbe l'écart) et l'excédent d'exploitation n'est négatif que la première année ; sans eux, la caisse devient négative.")
    # le scénario « 6 tiers de plus » (levée de 5 M) garde son sens : 6 de plus que les 12 du plan
    sub(p, '"B5": 0, "B6": 0, "B95": 6, "B96": 6}', '"B5": 0, "B6": 0, "B95": 9, "B96": 9}')
    print("atelier 12 voitures de tiers prêt :", ATELIER)


def textes():
    L.textes()
    for f, n_min in (("gen_partie7.py", 11), ("gen_partie8.py", 2), ("gen_partie9.py", 5), ("gen_partie10.py", 2)):
        sub(P.PLAN / f, "six voitures de tiers", "douze voitures de tiers", n_min)
    sub(P.PLAN / "gen_partie7.py", "+ 6 voitures de tiers", "+ 12 voitures de tiers")
    sub(P.PLAN / "gen_partie8.py", "+ 6 voitures de tiers", "+ 12 voitures de tiers")
    sub(P.PLAN / "gen_partie7.py", "Recruter <strong>trois Essentiel et trois Confort de plus</strong>", "Recruter <strong>six Essentiel et six Confort de plus</strong>")
    p = P.PLAN / "gen_partie10.py"
    sub(p, "Six voitures de tiers en service", "Douze voitures de tiers en service")
    sub(p, "      {ligne_flotte('3 Essentiel + 3 Confort')}\n", "      {ligne_flotte('6 Essentiel + 6 Confort')}\n      {ligne_flotte('3 Essentiel + 3 Confort')}\n")
    sub(p, "À 70 % des planchers, trois Essentiel et trois Confort de plus portent l’excédent d’exploitation de l’année 2 de {mm(R70_S['ebe'][1])} à {mm(R70['ebe'][1])} :\n"
           "      cela ne suffit plus à le rendre positif ({'—' if MIN['ess@70'] is None else MIN['ess@70']} Essentiel ou {'—' if MIN['conf@70'] is None else MIN['conf@70']} Confort seraient nécessaires, à lui seul) ; à partir de {M.pct(100 * M.seuils('avec_tiers')['ebe'], 0)} des planchers, il l’est.",
        "À 70 % des planchers, six Essentiel et six Confort de plus portent l’excédent d’exploitation de l’année 2 de {mm(R70_S['ebe'][1])} à {mm(R70['ebe'][1])} :\n"
        "      avec les voitures de tiers, il est positif dès {M.pct(100 * M.seuils('avec_tiers')['ebe'], 0)} des planchers.")
    sub(P.PLAN / "partie5.html", "au moins six voitures de tiers en plus, trois Essentiel et trois Confort,", "au moins douze voitures de tiers en plus, six Essentiel et six Confort,")
    print("textes du recrutement (12 voitures de tiers) réécrits")


if __name__ == "__main__":
    {"atelier": atelier, "textes": textes, "livrer": P.livrer}[sys.argv[1]]()
