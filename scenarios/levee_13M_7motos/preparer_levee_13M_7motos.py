"""Scénario « levée de 13 M, 7 motos et aucun tricycle au départ » (29 octobre 2026).

Fabrique, dans un atelier à part, les versions à 13 000 000 F du plan d'affaires et du classeur « Résultat complet », avec une
flotte propre de TamCar de SEPT MOTOS électriques (au lieu d'un tricycle thermique et de cinq motos).
Les versions à 15 M (racine du dépôt, plan-affaires/) et celles du scénario 13 M précédent (scenarios/levee_13M/) restent intactes ;
le script refuse d'écraser un livrable existant.

Usage (Python 3, Excel et Chrome installés) :
    python preparer_levee_13M_7motos.py atelier    prépare l'atelier : reprend le scénario 13 M, change la flotte du classeur (B5 = 0, B6 = 7)
    (dans l'atelier : classeur/projections_v2.py  -> recalcul Excel, classeur et valeurs du plan)
    python preparer_levee_13M_7motos.py textes     réécrit les textes du plan qui décrivaient la flotte (rejouable : repart d'une copie intacte)
    (dans l'atelier : build.py, verifier.py)
    python preparer_levee_13M_7motos.py livrer     range les fichiers produits ici, avec le suffixe _13M_7motos

Ce qui change par rapport au scénario 13 M précédent : B5 (tricycles achetés au mois 1) 1 -> 0 et B6 (motos) 5 -> 7 dans le classeur,
et tous les textes du plan qui décrivaient la flotte de départ (un tricycle thermique et cinq motos, six véhicules, quinze véhicules).
Le dossier d'évaluation IP ne parle pas de la flotte : celui du scénario 13 M précédent reste valable.
Le script échoue si un texte du plan a bougé (il ne remplace jamais « à l'aveugle »).
"""
import importlib.util
import json
import pathlib
import shutil
import sys

ICI = pathlib.Path(__file__).resolve().parent
REPO = ICI.parent.parent
ATELIER = pathlib.Path(r"D:\tmp\ws13_7m")
PLAN = ATELIER / "plan-affaires"
PRISTINE = ATELIER / "_pristine"
SUFFIXE = "_13M_7motos"
FICHIERS_TEXTE = ("build.py", "modele_v6.py", "gen_partie6.py", "gen_partie7.py", "gen_partie8.py", "gen_partie9.py", "gen_partie10.py", "gen_partie11.py",
                  "partie3.html", "partie5.html", "source.html")

# le scénario 13 M précédent fait l'essentiel (levée, apport, textes) : on le charge tel quel, avec un autre atelier
_spec = importlib.util.spec_from_file_location("preparer_13M", REPO / "scenarios" / "levee_13M" / "preparer_levee_13M.py")
OLD = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(OLD)
OLD.ATELIER = ATELIER
OLD.PLAN = PLAN

lire, ecrire, sub, sub_re = OLD.lire, OLD.ecrire, OLD.sub, OLD.sub_re


def atelier():
    OLD.atelier()
    classeur()
    PRISTINE.mkdir(exist_ok=True)
    for f in FICHIERS_TEXTE:
        shutil.copyfile(PLAN / f, PRISTINE / f)
    print("atelier 7 motos prêt :", ATELIER)


def textes():
    for f in FICHIERS_TEXTE:
        shutil.copyfile(PRISTINE / f, PLAN / f)
    plan_textes()
    print("textes du plan réécrits")


# ---------------------------------------------------------------------------------------------------- classeur
def classeur():
    cl = PLAN / "classeur"
    m = cl / "modele_v2.py"
    # valeurs par défaut du classeur : 0 tricycle, 7 motos (les scénarios de projections_v2.py les surchargent au besoin)
    sub(m, '{"B54": 13_000_000, **(surcharges or {})}', '{"B54": 13_000_000, "B5": 0, "B6": 7, **(surcharges or {})}')
    sub(m, "    # ------------------------------------------------------------------ Mensuel\n    cols = range(7, 44)",
        '    H["C5"] = "Scénario du 2026-10-29 : aucun tricycle au départ (achat comptant à décider vers le mois 13, quand les planchers sont vérifiés)"\n'
        '    H["C6"] = "Scénario du 2026-10-29 : 7 motos au départ au lieu d\'un tricycle et de cinq motos (2 motos de plus à la place du tricycle comptant)"\n'
        "    # ------------------------------------------------------------------ Mensuel\n    cols = range(7, 44)")
    sub(m, '"Motos (5)": "Motos (5 de TamCar + tiers)"', '"Motos (5)": "Motos (7 de TamCar + tiers)"')
    sub(m, '"Tricycle (1)": "Tricycle (1 de TamCar + tiers)"', '"Tricycle (1)": "Tricycle (de tiers seulement)"')
    sub(m, "15 véhicules au mois 1 puis les véhicules de tiers", "16 véhicules au mois 1 puis les véhicules de tiers")
    sub(m, "Flotte : 1 tricycle + 5 motos de TamCar + 9 voitures", "Flotte : 7 motos de TamCar (aucun tricycle au départ) + 9 voitures")
    sub(m, "55 % sur le tricycle de TamCar, ", "")
    sub(m, "compté à l'arrivée de chaque véhicule (15 au mois 1, puis", "compté à l'arrivée de chaque véhicule (16 au mois 1, puis")
    sub(m, '    wb.save(dest)\n    return dest',
        '    wb["Synthèse"]["A2"] = ("Flotte TamCar : 7 motos électriques (comptant), aucun tricycle au départ, plus 9 voitures mises à disposition (6 Essentiel + 3 Confort, VIP non compté). "\n'
        '                            "Recettes = planchers de Mayeul. Pour changer quoi que ce soit : feuille Hypothèses (cellules bleues).")\n'
        '    wb.save(dest)\n    return dest')
    p = cl / "projections_v2.py"
    sub(p, "A. Flotte actuelle seule (1 tricycle + 5 motos + 9 voitures d'Afrik Group)", "A. Flotte actuelle seule (7 motos + 9 voitures d'Afrik Group)")
    sub(p, "Sans voiture (ni Afrik Group ni tiers) : 1 tricycle et 5 motos seuls", "Sans voiture (ni Afrik Group ni tiers) : 7 motos seules")
    sub(p, "(450 000 F au mois 1 pour 15 véhicules)", "(480 000 F au mois 1 pour 16 véhicules)")


# ---------------------------------------------------------------------------------------------------- plan (textes)
def plan_textes():
    v = json.loads((PLAN / "classeur" / "classeur_v2_valeurs.json").read_text(encoding="utf-8"))
    ro = [round(x or 0) for x in v["mensuel"]["33"]["values"]]
    ro1 = f"{ro[1]:,}".replace(",", " ")
    mois_plafond = next(m for m in range(1, 37) if ro[m] >= 150000)

    sub(PLAN / "build.py", 'VERSION = "v6_13M"', f'VERSION = "v6{SUFFIXE}"')

    # ---------------------------------------------------------------- chapitre 3 (statique)
    p = PLAN / "partie3.html"
    sub(p, "Les cinq motos de la flotte de départ", "Les sept motos de la flotte de départ")

    # ---------------------------------------------------------------- chapitre 5 (statique)
    p = PLAN / "partie5.html"
    sub(p, "quinze véhicules à Cotonou dès le premier mois : un tricycle thermique et cinq\n        motos électriques achetés par TamCar, et neuf voitures",
        "seize véhicules à Cotonou dès le premier mois : sept motos électriques achetées par TamCar,\n        et neuf voitures")
    sub(p, "(15 véhicules) et la <strong>flotte recrutée</strong>", "(16 véhicules) et la <strong>flotte recrutée</strong>")
    sub(p, "Exploitation du tricycle, des cinq motos et des neuf voitures", "Exploitation des sept motos et des neuf voitures")
    sub(p, "      <tr><td>Tricycle thermique</td><td>1</td><td>TamCar, puis le conducteur</td><td>Acompte de 30 % (465 000 F) à la commande, solde sur 12 mois sans intérêt.</td></tr>\n", "")
    sub(p, "<tr><td>Motos électriques</td><td>5</td>", "<tr><td>Motos électriques</td><td>7</td>")
    sub(p, "Le détail du financement du tricycle et des motos est au 6.4", "Le détail du financement des motos est au 6.4")
    sub(p, "Avec la flotte de départ (15 véhicules) aux planchers d’activité, la charge mensuelle est d’environ\n        114 010 FCFA au mois 1.",
        f"Avec la flotte de départ (16 véhicules) aux planchers d’activité, la charge mensuelle est d’environ\n        {ro1} FCFA au mois 1.")
    sub(p, "cinq millions de FCFA (mois 8 avec les voitures de tiers)", f"cinq millions de FCFA (mois {mois_plafond} avec les voitures de tiers)")
    sub(p, "114 010 FCFA au mois 1 ; plafond de 150 000 FCFA atteint dès le mois 8 avec les voitures de tiers",
        f"{ro1} FCFA au mois 1 ; plafond de 150 000 FCFA atteint dès le mois {mois_plafond} avec les voitures de tiers")

    # ---------------------------------------------------------------- chapitre 6
    p = PLAN / "gen_partie6.py"
    sub(p, "PRIX_FLOTTE = M.PRIX_TRICYCLE + M.N_MOTO * M.PRIX_MOTO", "PRIX_FLOTTE = M.N_TRI * M.PRIX_TRICYCLE + M.N_MOTO * M.PRIX_MOTO")
    sub(p, "sur les véhicules que TamCar possède (1 tricycle et 5 motos).", "sur les véhicules que TamCar possède (7 motos).")
    sub(p, "<strong>six véhicules à elle</strong> : un tricycle thermique et cinq motos électriques, pour un investissement\n        de {n(PRIX_FLOTTE)} FCFA.",
        "<strong>sept motos électriques à elle</strong>, pour un investissement\n        de {n(PRIX_FLOTTE)} FCFA ; aucun tricycle n’est acheté au départ.")
    sub(p, "Les voitures n’engagent aucun capital de TamCar.</span>",
        "Les voitures n’engagent aucun capital de TamCar. L’achat d’un tricycle thermique, au comptant, pourra être décidé vers le mois 13, quand les planchers sont vérifiés.</span>")
    sub(p, '    <colgroup><col style="width:46%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup>\n'
           '    <thead><tr><th>Montants en FCFA</th><th>Un tricycle</th><th>Cinq motos</th><th class="tam">Les six</th></tr></thead>\n'
           "    <tbody>\n"
           "      <tr><td>Prix d’achat</td><td>{n(M.PRIX_TRICYCLE)}</td><td>{n(M.N_MOTO * M.PRIX_MOTO)}</td><td class=\"tam\">{n(PRIX_FLOTTE)}</td></tr>\n"
           "      <tr><td>À la commande</td><td>{n(M.ACOMPTE_TRICYCLE)} (30 %)</td><td>{n(M.N_MOTO * M.PRIX_MOTO)} (comptant)</td><td class=\"tam\">{n(M.ACOMPTE_TRICYCLE + M.MOTOS_COMPTANT)}</td></tr>\n"
           "      <tr><td>Solde du tricycle, payé sur {M.MENS_TRICYCLE} mois</td><td>{n(M.PRIX_TRICYCLE - M.ACOMPTE_TRICYCLE)}</td><td>—</td><td class=\"tam\">{n(M.PRIX_TRICYCLE - M.ACOMPTE_TRICYCLE)}</td></tr>\n"
           "      <tr><td>Mensualité pendant {M.MENS_TRICYCLE} mois</td><td>{n(TRI_MENS)}</td><td>—</td><td class=\"tam\">{n(TRI_MENS)}</td></tr>\n"
           "    </tbody>",
        '    <colgroup><col style="width:52%"><col style="width:24%"><col style="width:24%"></colgroup>\n'
        '    <thead><tr><th>Montants en FCFA</th><th>Une moto</th><th class="tam">Les {M.N_MOTO} motos</th></tr></thead>\n'
        "    <tbody>\n"
        "      <tr><td>Prix d’achat, payé comptant à la commande</td><td>{n(M.PRIX_MOTO)}</td><td class=\"tam\">{n(PRIX_FLOTTE)}</td></tr>\n"
        "      <tr><td>Assurance, droit taxi et visite technique, première année</td><td>{n(M.h('B16'))}</td><td class=\"tam\">{n(M.N_MOTO * M.h('B16'))}</td></tr>\n"
        "      <tr><td>Tracker GPS certifié ANATT, première année</td><td>{n(M.h('B19'))}</td><td class=\"tam\">{n(M.N_MOTO * M.h('B19'))}</td></tr>\n"
        "      <tr><td>Frais d’entrée</td><td>{n(M.FRAIS_ENTREE)}</td><td class=\"tam\">{n(M.N_MOTO * M.FRAIS_ENTREE)}</td></tr>\n"
        "      <tr><td><strong>Mise de départ</strong></td><td><strong>{n(M.PRIX_MOTO + M.h('B16') + M.h('B19') + M.FRAIS_ENTREE)}</strong></td><td class=\"tam\"><strong>{n(M.N_MOTO * (M.PRIX_MOTO + M.h('B16') + M.h('B19') + M.FRAIS_ENTREE))}</strong></td></tr>\n"
        "    </tbody>")
    sub(p, "Tricycle : paiement à confirmer avec le fournisseur, sans intérêt. Motos : prix comptant de", "Motos : prix comptant de")
    sub_re(p, r'  <div class="h-serif ajout" style="margin-top:14px">Un tricycle qui atteint son plancher</div>\n'
              r'  <div class="row c-3 ajout" style="margin-top:8px">\n(?:    <div class="kpi">.*\n){3}  </div>\n',
           '  <div class="callout ajout" style="margin-top:14px">\n'
           '    <strong>Aucun tricycle au départ.</strong> Deux motos de plus ({n(2 * (M.PRIX_MOTO + M.h(\'B16\') + M.h(\'B19\') + M.FRAIS_ENTREE))} F) remplacent un tricycle payé comptant (environ 1,8 M F de mise) :\n'
           '    la trésorerie est plus haute au démarrage et la mise est rendue plus vite (cession à 12 mois). Un tricycle thermique ({n(M.PRIX_TRICYCLE)} F, au comptant) pourra être acheté vers le mois 13.\n'
           '  </div>\n')

    # ---------------------------------------------------------------- chapitre 7
    p = PLAN / "gen_partie7.py"
    sub(p, "flotte de départ de 15 véhicules\n(1 tricycle et 5 motos de TamCar, 9 voitures", "flotte de départ de 16 véhicules\n(7 motos de TamCar, 9 voitures")
    sub(p, "<strong>{M.N_TRI} tricycle thermique et {M.N_MOTO} motos électriques</strong> achetés par TamCar", "<strong>{M.N_MOTO} motos électriques</strong> achetées par TamCar")
    sub(p, "<strong>{pct(100 * M.PART_TRICYCLE)}</strong> sur le tricycle de TamCar (part de propriétaire comprise), objectif de", "objectif de")
    sub(p, "Tricycle : {n(M.PRIX_TRICYCLE)} F, avance de 30 % ({n(M.ACOMPTE_TRICYCLE)} F) puis {M.MENS_TRICYCLE} mensualités de {n(TRI_MENS)} F sans intérêt (conditions à confirmer par le fournisseur). Motos : {n(M.PRIX_MOTO)} F l’unité, payées comptant.",
        "{M.N_MOTO} motos : {n(M.PRIX_MOTO)} F l’unité, payées comptant ; aucun tricycle au départ (achat comptant à décider vers le mois 13).")
    sub(p, """{row_s('Objectif du jour atteint<small>moto · tricycle · TamAssur compris</small>', lambda p: f"{vers(p, M.OBJ_MOTO)} · {vers(p, M.OBJ_TRI)}")}""",
        """{row_s('Objectif du jour atteint<small>moto · TamAssur compris</small>', lambda p: vers(p, M.OBJ_MOTO))}""")
    sub(p, "        TamCar achète six véhicules : <strong>un tricycle thermique</strong> ({n(M.PRIX_TRICYCLE)} F) et <strong>cinq motos électriques</strong>\n"
           "        ({n(M.PRIX_MOTO)} F l’unité, soit {n(M.MOTOS_COMPTANT)} F). Le tricycle est payé 30 % à la commande ({n(M.ACOMPTE_TRICYCLE)} F) puis en\n"
           "        {M.MENS_TRICYCLE} mensualités de {n(TRI_MENS)} F, sans intérêt, conditions à confirmer par le fournisseur ; les motos sont payées comptant.\n",
        "        TamCar achète <strong>sept motos électriques</strong> ({n(M.PRIX_MOTO)} F l’unité, soit {n(M.MOTOS_COMPTANT)} F), payées comptant.\n"
        "        Aucun tricycle n’est acheté au départ : un tricycle thermique ({n(M.PRIX_TRICYCLE)} F, au comptant) pourra l’être vers le mois 13, quand les planchers sont vérifiés.\n")
    sub(p, "au mois 1, avant les mensualités du tricycle, soit", "au mois 1, soit")
    sub(p, "La part du\n        tricycle ({n(PART_JOUR['tri'])} F par mois, nette de la cotisation TamAssur) couvre sa mensualité ({n(TRI_MENS)} F) dès que le conducteur atteint\n        {pct(100 * SEUIL_TRI, 0)} de son plancher.",
        "La part\n        d’une moto ({n(PART_JOUR['moto'])} F par mois, nette de la cotisation TamAssur) rembourse son prix de {n(M.PRIX_MOTO)} F en {D1(M.PRIX_MOTO / PART_JOUR['moto'])} mois, avant sa cession au conducteur.")
    sub(p, "      {ligne_veh('Tricycle', 'de TamCar · cédé au bout de 24 mois', M.VOL_TRI, M.OBJ_TRI, PART_JOUR['tri'], f'{n(M.PRIX_TRICYCLE)} F (30 % + {M.MENS_TRICYCLE} mois)')}\n", "")
    sub(p, " ; celle du tricycle ({n(PART_JOUR['tri'])} F) le sien en\n      {M.PRIX_TRICYCLE / PART_JOUR['tri']:.0f} mois. Une voiture rapporte", ". Une voiture rapporte")
    sub(p, "      {tr('Tricycle : avance de 30 %', n(M.ACOMPTE_TRICYCLE))}\n", "")
    sub(p, "{tr('Cinq motos : achat comptant', n(M.MOTOS_COMPTANT))}", "{tr('Sept motos : achat comptant', n(M.MOTOS_COMPTANT))}")
    sub(p, "tricycle et motos, première année", "motos, première année")
    sub(p, "{tr('Trackers GPS certifiés ANATT : tricycle et motos',", "{tr('Trackers GPS certifiés ANATT : motos',")
    sub(p, "Frais d’entrée des six véhicules de TamCar", "Frais d’entrée des sept motos de TamCar")
    sub(p, "<th>Flotte de départ<br>15 véhicules</th>", "<th>Flotte de départ<br>16 véhicules</th>")
    sub(p, "impôt minimum, trackers du tricycle, manque au rachat NSIA", "impôt minimum, manque au rachat NSIA")
    sub(p, "« Flotte de départ » : 15 véhicules ;", "« Flotte de départ » : 16 véhicules ;")
    sub(p, "le tricycle après 24 mois, au mois 25 ; les voitures après 36 mois", "les voitures après 36 mois")
    sub(p, "Les 5 motos cédées continuent de lui rapporter", "Les {M.N_MOTO} motos cédées continuent de lui rapporter")
    sub(p, "'1 tricycle et 5 motos', '1 tricycle et 5 motos', 'Aucun véhicule', '1 tricycle et 5 motos'", "'7 motos', '7 motos', 'Aucun véhicule', '7 motos'")
    sub(p, "Le tricycle et les cinq motos seuls ne couvrent pas les charges", "Les sept motos seules ne couvrent pas les charges")

    # ---------------------------------------------------------------- chapitre 8
    p = PLAN / "gen_partie8.py"
    sub(p, "n(M.PRIX_TRICYCLE + M.N_MOTO * M.PRIX_MOTO)", "n(M.N_TRI * M.PRIX_TRICYCLE + M.N_MOTO * M.PRIX_MOTO)", 3)
    sub(p, "des coûts liés à ses six véhicules, le prix de ces véhicules et", "des coûts liés à ses sept motos, le prix de ces motos et")
    sub(p, "Le tricycle est payé jusqu’au mois 13, les motos au comptant ; ensuite, plus aucune mensualité.", "Les motos sont payées comptant : aucune mensualité d’achat.")
    sub(p, "l’achat des six véhicules et les premiers mois", "l’achat des sept motos et les premiers mois")
    sub(p, "1 tricycle, 5 motos (TamCar) et 9 voitures d’Afrik Group", "7 motos (TamCar) et 9 voitures d’Afrik Group")
    sub(p, "le tracker GPS de ses six véhicules, tant qu’elle", "le tracker GPS de ses sept motos, tant qu’elle")
    sub(p, "le prix de ces véhicules : avance et mensualités du tricycle, motos au comptant (8.6)", "le prix de ces motos, payées comptant (8.6)")
    sub(p, "de mise de départ des six véhicules</span><small>avance, motos, assurances, trackers, frais d’entrée</small>", "de mise de départ des sept motos</span><small>motos, assurances, trackers, frais d’entrée</small>")
    sub(p, "f'75 000 par an par tricycle ; 50 000 par an par moto'", "'50 000 par an par moto'")
    sub(p, "'139 000 en année 1, puis 89 000 par an (tricycle)', 'Fixe', 'À la mise en service puis chaque anniversaire (8.4) ; motos cédées à 12 mois : pas de renouvellement'",
        "'139 000 par moto', 'Fixe', 'À la mise en service (8.4) ; motos cédées à 12 mois : pas de renouvellement'")
    sub(p, """      {tr('Tricycle', n(M.h('B17')), n(M.h('B18')), f'{n(M.h("B17") + M.h("B18"))}<small>24 mois</small>')}\n""", "")
    sub(p, "Véhicules de TamCar (1 tricycle, 5 motos)", "Véhicules de TamCar (7 motos)")
    sub(p, "TamCar, pour les six véhicules qu’elle possède", "TamCar, pour les sept motos qu’elle possède")
    sub(p, "Flotte de départ · 15 véhicules", "Flotte de départ · 16 véhicules")
    sub(p, "TamCar achète six véhicules ; les voitures n’engagent aucun capital. Le fournisseur de tricycles accorde 30 % à la commande et le solde sur 12 mois, sans intérêt (conditions à confirmer) ; les motos sont payées comptant.",
        "TamCar achète sept motos, payées comptant ; les voitures n’engagent aucun capital. Aucun tricycle n’est acheté au départ.")
    sub(p, "      {tr('Tricycle thermique · Cotonou', n(M.PRIX_TRICYCLE), n(M.ACOMPTE_TRICYCLE) + ' (30 %)', n(TRI_MENS), 'Mois 2 à 13', 'Mois 13')}\n", "")
    sub(p, "{tr('Cinq motos électriques · Cotonou',", "{tr('Sept motos électriques · Cotonou',")
    sub_re(p, r"      \{tr\('<strong>Total</strong>', '<strong>' \+ n\(M\.N_TRI.*\n", "")
    # plus de mensualités : le tableau 8.6 se réduit à trois colonnes
    sub(p, '<colgroup><col style="width:30%"><col style="width:14%"><col style="width:18%"><col style="width:16%"><col style="width:12%"><col style="width:10%"></colgroup>\n'
           "    <thead><tr><th>Véhicule</th><th>Valeur</th><th>À la commande (mois 1)</th><th>Mensualité</th><th>Mensualités</th><th>Dernier paiement</th></tr></thead>",
        '<colgroup><col style="width:44%"><col style="width:28%"><col style="width:28%"></colgroup>\n'
        "    <thead><tr><th>Véhicule</th><th>Valeur</th><th>À la commande (mois 1)</th></tr></thead>")
    sub(p, ", '—', '—', '—')}", ")}", 3)
    sub_re(p, r'  <div class="h-serif" style="margin-top:16px">Ce que TamCar doit encore au fournisseur</div>\n'
              r'  <table class="tbl" style="margin-top:8px">\n(?s:.*?)  </table>\n'
              r'  <p class="intro" style="margin-top:6px">Le solde dû est à son maximum.*</p>\n', "")
    sub(p, "Aux planchers, la part de TamCar sur le tricycle est de {n(M.PART_NETTE_MENS['tri'])} F par mois\n"
           "      (nette de la cotisation TamAssur) pour une mensualité de {n(TRI_MENS)} F : elle est couverte dès {pct(100 * M.SEUIL_MENS_TRI, 0)} du plancher. Les motos, payées\n"
           "      comptant, rapportent",
        "Aux planchers, les motos, payées\n      comptant, rapportent")
    sub(p, "        <li>tricycle payé 30 % à la commande puis sur 12 mois sans intérêt, à confirmer avec le fournisseur ; motos payées comptant ;</li>\n"
           "        <li>prix de {n(M.PRIX_TRICYCLE)} F par tricycle et de {n(M.PRIX_MOTO)} F par moto maintenus ;</li>\n",
        "        <li>sept motos payées comptant, aucun tricycle acheté au départ ;</li>\n"
        "        <li>prix de {n(M.PRIX_MOTO)} F par moto maintenu ;</li>\n")

    # ---------------------------------------------------------------- chapitre 9
    p = PLAN / "gen_partie9.py"
    sub(p, "VEH_TAMCAR = M.PRIX_TRICYCLE + M.N_MOTO * M.PRIX_MOTO", "VEH_TAMCAR = M.N_TRI * M.PRIX_TRICYCLE + M.N_MOTO * M.PRIX_MOTO")
    sub(p, "prix et paiement échelonné du tricycle à confirmer avec le fournisseur (8.6)", "prix des motos à confirmer avec le fournisseur (8.6)")
    sub(p, "'tricycle et cinq motos seuls'", "'sept motos seules'")
    sub(p, "(un tricycle et cinq motos) : c’est l’actif", "(sept motos) : c’est l’actif")

    # ---------------------------------------------------------------- chapitre 10
    p = PLAN / "gen_partie10.py"
    sub(p, "# dernière mensualité du tricycle (mois 2 à 13)", "# cession des motos (mois 13) : le deuxième cycle se prépare ensuite")
    sub(p, "un tricycle et cinq motos achetés par TamCar,\n        neuf voitures", "sept motos achetées par TamCar,\n        neuf voitures")
    sub(p, "la commande du tricycle (30 % à la commande) et des cinq motos (paiement comptant)", "la commande des sept motos (paiement comptant)")
    sub(p, "le tricycle, les cinq motos et les neuf voitures dès le mois 1", "les sept motos et les neuf voitures dès le mois 1")
    sub(p, "<span class=\"modif\"> Le solde du tricycle se paie en {M.MENS_TRICYCLE} mensualités : fin au mois {M_FIN_MENS} ({date(M_FIN_MENS)}).</span>",
        "<span class=\"modif\"> Les motos sont payées comptant : aucune mensualité d’achat n’est à honorer.</span>")
    sub(p, "douze mois pour les motos, trente-six mois pour le tricycle et les voitures Essentiel,", "douze mois pour les motos, trente-six mois pour les voitures Essentiel,")
    sub(p, "tricycle en {date(M_CESS_TRI)}, Essentiel en", "Essentiel en")
    sub(p, "commande du tricycle et des motos', f'{n(M.DEMARRAGE)} F')", "commande des sept motos', f'{n(M.DEMARRAGE)} F')")
    sub(p, "'Livraison du tricycle et des motos, trackers posés, lancement avec 15 véhicules (neuf voitures comprises)'", "'Livraison des motos, trackers posés, lancement avec 16 véhicules (neuf voitures comprises)'")
    sub(p, "'Cession des cinq motos ; dernière mensualité du tricycle ; développeur ;", "'Cession des sept motos ; développeur ;")
    sub(p, "('Mois 25', 'Second renouvellement ANATT et patente ; cession du tricycle (24 mois)', f'{n(M.h(\"B48\"))} F + patente ; TamCar ne garde que 20 % du volume du tricycle'),",
        "('Mois 25', 'Second renouvellement ANATT et patente', f'{n(M.h(\"B48\"))} F + patente'),")
    sub(p, "'Trésorerie positive, tricycle remboursé, données fiables sur trois mois de suite'", "'Trésorerie positive, données fiables sur trois mois de suite'")
    sub(p, " ; le paiement du tricycle (30 % puis 12 mois) est à confirmer.</li>", ".</li>")
    sub(p, "Commander le tricycle et les motos, au plus tard début décembre 2026.", "Commander les sept motos, au plus tard début décembre 2026.")
    sub(p, "cession des motos et dernière mensualité du tricycle en {date(M_CESS_MOTO)},\n    cession du tricycle en {date(M_CESS_TRI)}, des voitures Essentiel",
        "cession des motos en {date(M_CESS_MOTO)},\n    des voitures Essentiel")
    sub(p, "un tricycle acheté qui ne roule pas engage {n(M.PRIX_TRICYCLE)} F.", "une moto achetée qui ne roule pas engage {n(M.PRIX_MOTO)} F.")


    # ---------------------------------------------------------------- étiquettes liées aux achats comptant (plus de mensualités)
    sub(PLAN / "modele_v6.py", "dernières voitures de tiers, tricycle en remboursement", "dernières voitures de tiers")
    sub(PLAN / "gen_partie7.py", "Achat des véhicules de TamCar (avance, mensualités, motos)", "Achat des véhicules de TamCar (motos, comptant)")
    sub(PLAN / "gen_partie8.py", "<th>Mensualités d’achat</th>", "<th>Achats de véhicules</th>")
    sub(PLAN / "gen_partie8.py", "les mensualités d’achat et les revenus", "les achats de véhicules et les revenus")
    sub(PLAN / "gen_partie9.py", "jusqu’à la cession pour ses six véhicules", "jusqu’à la cession pour ses sept motos")

    # ---------------------------------------------------------------- chapitre 11 : la table ride_end_reviews (migration du 2026-10-28) rejoint le domaine « Courses »
    sub(PLAN / "gen_partie11.py", "'ride_driver_exclusions', 'ride_live_state'}),", "'ride_driver_exclusions', 'ride_live_state', 'ride_end_reviews'}),")


def livrer():
    sorties = {
        PLAN / f"TamCar_plan_affaires_v6{SUFFIXE}.html": f"TamCar_plan_affaires_v6{SUFFIXE}.html",
        PLAN / f"TamCar_plan_affaires_v6{SUFFIXE}.pdf": f"TamCar_plan_affaires_v6{SUFFIXE}.pdf",
        ATELIER / "TamCar_resultat_complet_v2_13M.xlsx": f"TamCar_resultat_complet_v2{SUFFIXE}.xlsx",
    }
    for src, nom in sorties.items():
        assert src.exists(), src
        dest = ICI / nom
        assert not dest.exists(), f"{nom} existe déjà : on n'écrase jamais un livrable"
        shutil.copyfile(src, dest)
        print("livré :", nom)


if __name__ == "__main__":
    {"atelier": atelier, "textes": textes, "livrer": livrer}[sys.argv[1]]()
