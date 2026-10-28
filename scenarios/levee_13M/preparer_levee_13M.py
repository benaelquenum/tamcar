"""Scénario « levée de 13 M » : fabrique, dans un atelier à part, les versions à 13 000 000 F du plan d'affaires,
du classeur « Résultat complet » et du dossier d'évaluation IP, sans toucher aux livrables à 15 M.

Usage (depuis n'importe où, Python 3, Excel et Chrome installés) :
    python preparer_levee_13M.py atelier    copie plan-affaires/ dans l'atelier et y remplace 15 M par 13 M (constantes et textes)
    (puis, dans l'atelier : classeur/projections_v2.py, build.py, build_dossier_ip.py, build_dossier_ip_pptx.py, verifier.py)
    python preparer_levee_13M.py livrer     range les fichiers produits ici, avec le suffixe _13M

Ce qui change avec 13 M : la levée (B54 du classeur, SIM.LEVEE, modèle de trésorerie), la valeur de l'apport en nature
(13 M ÷ 40 % × 60 % = 19,5 M au lieu de 22,5 M ; total des apports 32,5 M au lieu de 37,5 M) et tous les textes qui en découlent.
Rien d'autre : flotte, planchers, charges, calendrier et hypothèses sont ceux du plan v6 à 15 M.
"""
import pathlib
import re
import shutil
import sys

ICI = pathlib.Path(__file__).resolve().parent
REPO = ICI.parent.parent
ATELIER = pathlib.Path(r"C:\Users\PC\AppData\Local\Temp\claude\D--TERENCE-TamCar-App\628e8a6d-ed1f-4fb5-9bed-1a036ddc7713\scratchpad\ws13")
PLAN = ATELIER / "plan-affaires"
REEL = str(REPO).replace("\\", "\\\\")


def lire(f):
    return pathlib.Path(f).read_text(encoding="utf-8")


def ecrire(f, t):
    pathlib.Path(f).write_text(t, encoding="utf-8")


def sub(fichier, ancien, nouveau, minimum=1):
    """Remplace toutes les occurrences de `ancien` ; échoue s'il y en a moins que `minimum` (un texte a bougé : à revoir)."""
    t = lire(fichier)
    n = t.count(ancien)
    assert n >= minimum, (str(fichier), ancien[:80], n)
    ecrire(fichier, t.replace(ancien, nouveau))


def sub_re(fichier, motif, nouveau, minimum=1):
    t = lire(fichier)
    t2, n = re.subn(motif, nouveau, t)
    assert n >= minimum, (str(fichier), motif, n)
    ecrire(fichier, t2)


def atelier():
    if ATELIER.exists():
        shutil.rmtree(ATELIER)
    ATELIER.mkdir(parents=True)
    ignore = shutil.ignore_patterns("*.pdf", "__pycache__", "TamCar_*", "plan-affaires*.html", "resume-plan-affaires.html")
    shutil.copytree(REPO / "plan-affaires", PLAN, ignore=ignore)
    # le dossier d'évaluation V2 part de l'en-tête de la V1 archivée
    shutil.copytree(REPO / "archives" / "2026-10-23_dossier_IP_v1", ATELIER / "archives" / "2026-10-23_dossier_IP_v1")

    # --------------------------------------------------------------- classeur et moteur
    cl = PLAN / "classeur"
    sub(cl / "simulation_v2.py", "LEVEE = 15_000_000", "LEVEE = 13_000_000")
    sub(PLAN / "modele_tresorerie.py", "LEVEE = 15_000_000", "LEVEE = 13_000_000")
    sub(cl / "modele_v2.py", "RACINE = ICI.parent.parent", f'RACINE = pathlib.Path(r"{REPO}")')
    sub(cl / "modele_v2.py", 'V2 = RACINE / "TamCar_resultat_complet_v2.xlsx"', 'V2 = ICI.parent.parent / "TamCar_resultat_complet_v2_13M.xlsx"')
    sub(cl / "modele_v2.py", "    for cell, val in (surcharges or {}).items():\n        H[cell] = val\n",
        "    for cell, val in {\"B54\": 13_000_000, **(surcharges or {})}.items():\n        H[cell] = val\n"
        "    H.cell(54, 3).value = (\"Scénario du 2026-10-28 : levée ramenée de 15 M à 13 M (13 M pour 40 % : apports 32,5 M, plateforme 19,5 M pour 60 %). \"\n"
        "                           \"Seule cette ligne change par rapport au classeur à 15 M ; flotte, planchers et charges sont ceux du plan v6.\")\n"
        "    for feuille in wb.worksheets:\n"
        "        for ligne_ in feuille.iter_rows():\n"
        "            for c_ in ligne_:\n"
        "                if isinstance(c_.value, str) and not c_.value.startswith(\"=\") and \"evée de 15 M\" in c_.value:\n"
        "                    c_.value = c_.value.replace(\"evée de 15 M\", \"evée de 13 M\")\n")
    sub(cl / "modele_v2.py", "Levée de 15 M. Lancement", "Levée de 13 M. Lancement")
    sub(cl / "projections_v2.py", "la levée de 15 M absorbe l'écart", "la levée de 13 M absorbe l'écart")
    sub(cl / "projections_v2.py", "amortissement de l'apport en nature (22,5 M)", "amortissement de l'apport en nature (19,5 M)")

    # --------------------------------------------------------------- plan : chiffres et textes
    for f in ("gen_partie7.py", "gen_partie8.py", "gen_partie9.py", "gen_partie10.py", "source.html"):
        sub(PLAN / f, "15 000 000", "13 000 000", 0)
        sub_re(PLAN / f, r"\b15 M\b", "13 M", 0)
    sub(PLAN / "source.html", "(version 6).", "(version 6) · scénario de levée à 13 M, établi le 28 octobre 2026.")
    sub(PLAN / "build.py", 'VERSION = "v6"', 'VERSION = "v6_13M"')
    for f in ("gen_partie2b.py", "gen_partie11.py"):
        sub(PLAN / f, "DEPOT = ICI.parent", f'DEPOT = pathlib.Path(r"{REPO}")')
    p = PLAN / "gen_partie2b.py"
    sub(p, "INVEST = 15_000_000", "INVEST = 13_000_000")
    sub(p, "<small>15 M ÷ 40 % × 60 %</small>", "<small>13 M ÷ 40 % × 60 %</small>")
    sub(p, "<small>15 000 000 F ÷ 40 %</small>", "<small>13 000 000 F ÷ 40 %</small>")
    sub(p, "nécessaire pour 60 % : 37 500 000 F × 60 %", "nécessaire pour 60 % : 32 500 000 F × 60 %")
    sub(p, "(valeur + 15 000 000 F)", "(valeur + 13 000 000 F)")
    sub(p, "Elle dépasse le coût de reproduction ({n(B)} F) et reste sous la valeur d’usage ({n(CVAL)} F).",
        "Elle est inférieure au coût de reproduction ({n(B)} F) et à la valeur d’usage ({n(CVAL)} F).")

    # --------------------------------------------------------------- dossier d'évaluation IP : 19,5 M
    remplacements = [
        ("22 500 000", "19 500 000"),
        ("22,5 M", "19,5 M"),
        ("37 500 000 F d'apports", "32 500 000 F d'apports"),
        ("15 000 000 F en numéraire", "13 000 000 F en numéraire"),
        ("+ 12,5 % sur B · − 11,8 % sur C · 45 % de A", "− 2,5 % sur B · − 23,5 % sur C · 39 % de A"),
        ("Entre le coût de reproduction (20 M) et la valeur d'usage (25,5 M) · 45 % du coût historique (50 M)",
         "Sous le coût de reproduction (20 M) et la valeur d'usage (25,5 M) · 39 % du coût historique (50 M)"),
        ("Valeur la plus directement observable : c'est le plancher défendable de la valeur proposée.",
         "Valeur la plus directement observable : la valeur proposée (19,5 M) lui est inférieure de 2,5 %."),
        ("lui est inférieure de 11,8 %", "lui est inférieure de 23,5 %"),
        ("Elle reste dans la fourchette des méthodes B et C.", "Elle reste en dessous des méthodes B et C."),
        ("supérieure au coût de reproduction</strong> (+ 12,5 %)", "inférieure au coût de reproduction</strong> (− 2,5 %)"),
        ("(− 11,8 %) et égale à <strong>45 % du coût historique", "(− 23,5 %) et égale à <strong>39 % du coût historique"),
        ("se situe <strong>entre B (20 M) et C (25,5 M)</strong>", "se situe <strong>sous B (20 M) et C (25,5 M)</strong>"),
        ("<strong>45 %</strong> du coût historique (50 M)", "<strong>39 %</strong> du coût historique (50 M)"),
        ("Octobre 2026 · V2.0 — Confidentielle", "Octobre 2026 · V2.0 · levée 13 M — Confidentielle"),
        # PowerPoint
        ("Dossier d'évaluation IP (V2.0)\"", "Dossier d'évaluation IP (V2.0 · levée 13 M)\""),
        ("Entre le coût de reproduction (20 M) et la valeur d\\'usage (25,5 M) · 45 % du coût historique (50 M)",
         "Sous le coût de reproduction (20 M) et la valeur d\\'usage (25,5 M) · 39 % du coût historique (50 M)"),
        ("('supérieure au coût de reproduction', True), (' (+ 12,5 %), ', False)", "('inférieure au coût de reproduction', True), (' (− 2,5 %), ', False)"),
        ('(" (− 11,8 %) et égale à ", False), (\'45 % du coût historique\', True)', '(" (− 23,5 %) et égale à ", False), (\'39 % du coût historique\', True)'),
        ("• 19 500 000 FCFA, entre B (20 M) et C (25,5 M)\\n• 45 % du coût historique (50 M)", "• 19 500 000 FCFA, sous B (20 M) et C (25,5 M)\\n• 39 % du coût historique (50 M)"),
    ]
    for f in ("build_dossier_ip.py", "build_dossier_ip_pptx.py"):
        t = lire(PLAN / f)
        for a, b in remplacements:
            t = t.replace(a, b)
        ecrire(PLAN / f, t)
    sub(PLAN / "build_dossier_ip.py", "DEPOT = ICI.parent", f'DEPOT = pathlib.Path(r"{ATELIER}")')
    sub(PLAN / "build_dossier_ip.py", "(V2.0)</title>", "(V2.0 · levée 13 M)</title>", 0)
    retouches()
    print("atelier prêt :", ATELIER)


def retouches():
    """Textes et seuils qui se mesuraient contre 15 M (à ne passer qu'une fois sur un atelier neuf)."""
    sub(PLAN / "gen_partie7.py", "aux 5 M de moins disponibles", "aux 3 M de moins disponibles")
    # seuils de trésorerie du plan d'action : proportionnels à la trésorerie de départ après démarrage (10,45 M à 15 M ; 8,45 M à 13 M)
    sub(PLAN / "gen_partie9.py", "Au moins 10 M FCFA, soit la trésorerie de départ après le démarrage", "Au moins 8 M FCFA, soit la trésorerie de départ après le démarrage")
    sub(PLAN / "gen_partie9.py", "Sous 8 M FCFA après le mois 12", "Sous 6 M FCFA après le mois 12")
    sub(PLAN / "gen_partie10.py", "trésorerie d’au moins 10 M FCFA", "trésorerie d’au moins 8 M FCFA")


def livrer():
    sorties = {
        PLAN / "TamCar_plan_affaires_v6_13M.html": "TamCar_plan_affaires_v6_13M.html",
        PLAN / "TamCar_plan_affaires_v6_13M.pdf": "TamCar_plan_affaires_v6_13M.pdf",
        ATELIER / "TamCar_resultat_complet_v2_13M.xlsx": "TamCar_resultat_complet_v2_13M.xlsx",
        ATELIER / "TamCar_dossier_evaluation_IP.html": "TamCar_dossier_evaluation_IP_13M.html",
        ATELIER / "TamCar_dossier_evaluation_IP.pptx": "TamCar_dossier_evaluation_IP_13M.pptx",
    }
    for src, nom in sorties.items():
        assert src.exists(), src
        shutil.copyfile(src, ICI / nom)
        print("livré :", nom)


if __name__ == "__main__":
    {"atelier": atelier, "retouches": retouches, "livrer": livrer}[sys.argv[1]]()
