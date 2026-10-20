"""Fabrique le classeur v2 complet : modèle (modele_v2), contrôle du moteur de simulation contre Excel, feuilles « Seuils » et « Décisions v2 »,
puis export JSON des projections (utilisé par le plan d'affaires v6).

Usage :  python projections_v2.py            (reconstruit TamCar_resultat_complet_v2.xlsx et projections_v2.json)
"""
import datetime
import json
import pathlib
import tempfile

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill

import modele_v2 as MV
import simulation_v2 as SIM

ICI = pathlib.Path(__file__).resolve().parent
DATE = "2026-10-20"
NAVY, SEC, TOT = "FF071B3A", "FFDDE5F4", "FFC9D6F2"
NF = '#,##0;\\(#,##0\\);\\-'
f_norm = Font(name="Arial", size=10)
f_bold = Font(name="Arial", size=10, bold=True)
f_title = Font(name="Arial", size=14, bold=True, color=NAVY)
f_head = Font(name="Arial", size=10, bold=True, color="FFFFFFFF")
f_note = Font(name="Arial", size=9, italic=True, color="FF555555")
f_warn = Font(name="Arial", size=10, bold=True, color="FFB45309")
fill_head = PatternFill("solid", fgColor=NAVY)
fill_sec = PatternFill("solid", fgColor=SEC)
fill_tot = PatternFill("solid", fgColor=TOT)
fill_rouge = PatternFill("solid", fgColor="FFFBE3DC")
fill_vert = PatternFill("solid", fgColor="FFDDF3E4")

TAUX = (1.0, 0.9, 0.8, 0.7, 0.6, 0.5)
GENRES = (("moto", "Moto"), ("tri", "Tricycle"), ("ess", "Essentiel"), ("conf", "Confort"))


def put(ws, addr, value, font=f_norm, fmt=None, fill=None, wrap=False, align=None):
    c = ws[addr]
    c.value = value
    c.font = font
    if fmt:
        c.number_format = fmt
    if fill:
        c.fill = fill
    if wrap or align:
        c.alignment = Alignment(wrap_text=wrap, vertical="top", horizontal=align)
    return c


def entete(ws, row, labels):
    for i, t in enumerate(labels):
        c = ws.cell(row, 1 + i, t)
        c.font, c.fill = f_head, fill_head
        c.alignment = Alignment(horizontal="center" if i else "left", vertical="center", wrap_text=True)
    ws.row_dimensions[row].height = 32


def section(ws, row, texte, n):
    for i in range(n):
        ws.cell(row, 1 + i).fill = fill_sec
        ws.cell(row, 1 + i).font = f_bold
    ws.cell(row, 1, texte)


# ------------------------------------------------------------------ 1. contrôle du moteur contre le classeur (Excel)
def controler(base):
    scen = [(1, 0, 0, 0, 0), (1, 3, 3, 0, 0), (0.7, 0, 0, 0, 0), (0.7, 3, 3, 0, 0), (0.8, 6, 0, 0, 0),
            (0.6, 0, 5, 0, 0), (0.7, 0, 0, 9, 0), (0.7, 0, 0, 0, 18), (0.9, 2, 2, 3, 4), (0.5, 3, 3, 0, 0)]
    dossier = pathlib.Path(tempfile.mkdtemp(prefix="tamcar_ctrl_"))
    for i, (p, e, c, t, mo) in enumerate(scen):
        MV.construire(dossier / f"s{i}.xlsx", surcharges={"B94": p, "B95": e, "B96": c, "B97": t, "B98": mo})
    SIM.recalculer(dossier)
    ecart_max = 0.0
    lignes = []
    for i, (p, e, c, t, mo) in enumerate(scen):
        wb = openpyxl.load_workbook(dossier / f"s{i}.xlsx", data_only=True)
        R = wb["Résultat"]
        xl = dict(ebe=[R.cell(9, k).value for k in (2, 3, 4)], net=[R.cell(14, k).value for k in (2, 3, 4)],
                  net_apres=[R.cell(19, k).value for k in (2, 3, 4)], caisse_fin=[R.cell(33, k).value for k in (2, 3, 4)],
                  point_bas=R["B34"].value, mois_negatifs=R["B35"].value)
        ctrl = [R.cell(32, k).value for k in (2, 3, 4)]
        py = SIM.resultats(base, SIM.simuler(base, p, ess=e, conf=c, tri=t, moto=mo))
        ec = max(abs(a - b) for key in ("ebe", "net", "net_apres", "caisse_fin") for a, b in zip(xl[key], py[key]))
        ec = max(ec, abs(xl["point_bas"] - py["point_bas"]), abs(xl["mois_negatifs"] - py["mois_negatifs"]))
        ecart_max = max(ecart_max, ec)
        lignes.append(((p, e, c, t, mo), ec, ctrl))
        wb.close()
    return ecart_max, lignes


# ------------------------------------------------------------------ 2. tables de projections
def tableaux(base):
    out = {}
    for nom, kw in (("flotte_actuelle", {}), ("avec_tiers", dict(ess=3, conf=3))):
        rows = []
        for p in TAUX:
            s = SIM.simuler(base, p, **kw)
            r = SIM.resultats(base, s)
            r["taux"] = p
            r["chaque_mois"] = SIM.chaque_mois(base, s)
            rows.append(r)
        seuils = dict(
            ebe=SIM.seuil(base, lambda r: min(r["ebe"][1], r["ebe"][2]), **kw),
            net=SIM.seuil(base, lambda r: min(r["net"][1], r["net"][2]), **kw),
            net_apres=SIM.seuil(base, lambda r: min(r["net_apres"][1], r["net_apres"][2]), **kw),
            caisse=SIM.seuil(base, lambda r: r["caisse_fin"][2], **kw),
            point_bas=SIM.seuil(base, lambda r: r["point_bas"], **kw),
        )
        out[nom] = dict(rows=rows, seuils=seuils)
    # valeur mensuelle d'un véhicule de tiers (régime établi : mois 20), hors manque ponctuel au rachat NSIA (compté à part)
    b3 = SIM.Base.from_dict(base.to_dict())
    b3.ch = [c - n_ for c, n_ in zip(b3.ch, b3.nsia)]
    b3.nsia = [0] * 37
    b3.h = dict(b3.h, B104=0, B105=0)
    val = {}
    for p in (0.7, 1.0):
        zero = SIM.simuler(b3, p)
        for g, _ in GENRES:
            un = SIM.simuler(b3, p, **{g: 1})
            val[f"{g}@{int(p * 100)}"] = un["flux"][20] - zero["flux"][20]
    out["valeur_vehicule"] = val
    # nombre de véhicules de tiers d'un seul type pour un excédent ET un flux positifs chaque mois dès le mois 13
    out["minimal"] = {f"{g}@{int(p * 100)}": SIM.minimal(base, p, g) for p in (0.7, 0.8, 0.9, 1.0) for g, _ in GENRES}
    # flottes types à 70 %
    types = {
        "3 Essentiel + 3 Confort": dict(ess=3, conf=3),
        "6 Essentiel": dict(ess=6),
        "5 Essentiel + 5 Confort": dict(ess=5, conf=5),
        "10 motos + 3 tricycles + 2 Essentiel": dict(moto=10, tri=3, ess=2),
    }
    combos = {}
    for nom, kw in types.items():
        for p in (1.0, 0.7):
            s = SIM.simuler(base, p, **kw)
            r = SIM.resultats(base, s)
            r["chaque_mois"] = SIM.chaque_mois(base, s)
            combos[f"{nom}@{int(p * 100)}"] = r
    out["combos"] = combos
    # levier : points de part de TamCar en plus sur les voitures (flotte avec les 6 véhicules de tiers minimum)
    levier = {}
    for p in (0.7, 0.8, 0.9, 1.0):
        def f_ebe(d, p=p):
            return min(SIM.resultats(base, SIM.simuler(base, p, ess=3, conf=3, delta_part=d))["ebe"])
        def f_net(d, p=p):
            r = SIM.resultats(base, SIM.simuler(base, p, ess=3, conf=3, delta_part=d))
            return min(r["net"][1], r["net"][2])
        def f_mois(d, p=p):
            return 1 if SIM.chaque_mois(base, SIM.simuler(base, p, ess=3, conf=3, delta_part=d)) else -1
        res = {}
        for nom, f in (("ebe", f_ebe), ("net", f_net), ("chaque_mois", f_mois)):
            d = 0.0
            while d <= 0.15 and f(d) < 0:
                d += 0.0025
            res[nom] = round(d, 4) if d <= 0.15 else None
        levier[f"{int(p * 100)}"] = res
    out["levier_part"] = levier
    # le conducteur paie la cotisation TamAssur EN PLUS de son versement (méthode du plan v6) : la cotisation n'est plus à la charge de TamCar
    b2 = SIM.Base.from_dict(base.to_dict())
    b2.rec = [r - o for r, o in zip(b2.rec, [0] * 37)]
    b2.occ = [0] * 37
    b2.h = dict(b2.h, B103=0)
    sans = {}
    for p in (0.7, 1.0):
        s_ = SIM.simuler(b2, p, ess=3, conf=3)
        r_ = SIM.resultats(b2, s_)
        r_["chaque_mois"] = SIM.chaque_mois(b2, s_)
        sans[f"{int(p * 100)}"] = r_
    out["tamassur_par_conducteur"] = sans
    out["date"] = DATE
    return out


# ------------------------------------------------------------------ 3. feuilles
def feuille_seuils(wb, T):
    ws = wb.create_sheet("Seuils", 1)
    put(ws, "A1", "TamCar — Seuils de pilotage : que devient l'entreprise si les chauffeurs ne font qu'une partie des planchers ? (FCFA)", f_title)
    put(ws, "A2", (f"Valeurs FIGÉES au {DATE}, calculées avec les hypothèses de la feuille Hypothèses (décisions du 2026-10-18 et du 2026-10-20) par le moteur simulation_v2.py, "
                   "contrôlé contre le classeur lui-même (écart nul). Si les hypothèses changent, relancer projections_v2.py. "
                   "Le taux d'atteinte est réglable en direct : feuille Hypothèses, ligne 94."), f_note)
    titres = ["Taux d'atteinte des planchers", "Excédent brut an 1", "an 2", "an 3", "Résultat net an 1", "an 2", "an 3",
              "Caisse fin an 1", "an 2", "an 3", "Point bas de la caisse", "Mois de caisse négative"]
    r = 4
    for cle, titre in (("flotte_actuelle", "A. Flotte actuelle seule (1 tricycle + 5 motos + 9 voitures d'Afrik Group), sans véhicule de tiers"),
                       ("avec_tiers", "B. Avec le minimum décidé : 3 Essentiel + 3 Confort de tiers, arrivées étalées du mois 4 au mois 12")):
        section(ws, r, titre, 12)
        entete(ws, r + 1, titres)
        for i, row in enumerate(T[cle]["rows"]):
            rr = r + 2 + i
            put(ws, f"A{rr}", row["taux"], f_bold, "0%")
            vals = row["ebe"] + row["net"] + row["caisse_fin"] + [row["point_bas"], row["mois_negatifs"]]
            for j, v in enumerate(vals):
                put(ws, f"{chr(66 + j)}{rr}", round(v), f_norm, NF)
            if row["taux"] == 0.7:
                for j in range(12):
                    ws.cell(rr, 1 + j).fill = fill_tot
        s = T[cle]["seuils"]
        rr = r + 2 + len(T[cle]["rows"])
        put(ws, f"A{rr}", "Seuils (taux d'atteinte minimal) :", f_bold)
        put(ws, f"B{rr}", f"excédent brut ≥ 0 aux années 2 et 3 : {s['ebe']:.0%} ; résultat net ≥ 0 : {s['net']:.0%} "
                          f"(après gadgets et gestes : {s['net_apres']:.0%}) ; caisse fin an 3 ≥ 0 : {s['caisse']:.0%}", f_norm)
        r = rr + 3
    section(ws, r, "C. Valeur mensuelle nette d'un véhicule de tiers en régime établi (après part du responsable des opérations et postes vacants), FCFA par mois", 12)
    entete(ws, r + 1, ["Véhicule de tiers", "à 70 % des planchers", "à 100 %", "Frais d'entrée (une fois)"])
    for i, (g, nom) in enumerate(GENRES):
        rr = r + 2 + i
        put(ws, f"A{rr}", nom)
        put(ws, f"B{rr}", round(T["valeur_vehicule"][f"{g}@70"]), fmt=NF)
        put(ws, f"C{rr}", round(T["valeur_vehicule"][f"{g}@100"]), fmt=NF)
        put(ws, f"D{rr}", 30000, fmt=NF)
    r += 8
    section(ws, r, "D. Combien de véhicules de tiers (d'un seul type) pour un excédent d'exploitation ET un flux de caisse positifs chaque mois dès le mois 13", 12)
    put(ws, f"A{r+1}", "Arrivées étalées du mois 4 au mois 12 ; ANATT, impôt minimum et patente mis en réserve chaque mois. Sans économies ni développeur à mi-temps.", f_note)
    entete(ws, r + 2, ["Taux d'atteinte des planchers", "Motos", "Tricycles", "Essentiel", "Confort"])
    for i, p in enumerate((0.7, 0.8, 0.9, 1.0)):
        rr = r + 3 + i
        put(ws, f"A{rr}", p, f_bold, "0%")
        for j, (g, _) in enumerate(GENRES):
            put(ws, f"{chr(66 + j)}{rr}", T["minimal"][f"{g}@{int(p * 100)}"], fmt="0")
    r += 9
    section(ws, r, "E. Flottes types de véhicules de tiers (en plus de la flotte actuelle)", 12)
    entete(ws, r + 1, ["Flotte de tiers", "Taux", "Excédent brut an 1", "an 2", "an 3", "Caisse fin an 3", "Point bas", "Chaque mois positif dès le mois 13 ?"])
    rr = r + 2
    for cle, row in T["combos"].items():
        nom, p = cle.rsplit("@", 1)
        put(ws, f"A{rr}", nom)
        put(ws, f"B{rr}", int(p) / 100, fmt="0%")
        for j, v in enumerate(row["ebe"] + [row["caisse_fin"][2], row["point_bas"]]):
            put(ws, f"{chr(67 + j)}{rr}", round(v), fmt=NF)
        put(ws, f"H{rr}", "oui" if row["chaque_mois"] else "non", f_bold, fill=fill_vert if row["chaque_mois"] else fill_rouge)
        rr += 1
    rr += 1
    notes = [
        "Lecture : « 70 % des planchers » ne veut pas dire « au vert ». Avec les 6 véhicules de tiers, la caisse reste positive 3 ans à 70 % (la levée de 15 M absorbe l'écart), mais l'excédent d'exploitation est négatif ; sans eux, la caisse devient négative.",
        "Les recettes sont celles des planchers corrigés le 2026-10-20 (objectif du jour tout compris ÷ 60 %) : tout volume au-dessus d'un plancher s'ajoute. Le risque principal est la vacance des véhicules et le non-recouvrement des dettes.",
        "La cotisation TamAssur (1 000 F par jour et par véhicule sous contrat) est comprise dans l'objectif du jour : elle est financée par la part de TamCar (déduite des recettes, elle ne baisse pas quand le taux d'atteinte baisse). Le manque au rachat NSIA à l'ouverture du premier palier est compté (29 000 F par moto à 12 mois, 48 000 F par autre véhicule à 24 mois : estimations à confirmer par NSIA).",
        "Hypothèse à confirmer : un tricycle ou une moto de tiers rapporte 25 % du volume plancher à TamCar (même partage 30/20/5/5 que les voitures), moins la cotisation TamAssur.",
        "Non modélisés : paliers de retrait de 36 mois et plus (supposés sans manque pour TamCar), supervision au-delà de 20 véhicules, amortissement de l'apport en nature (22,5 M), frais FeexPay.",
    ]
    for t in notes:
        put(ws, f"A{rr}", t, f_note)
        rr += 1
    ws.column_dimensions["A"].width = 44
    for col in "BCDEFGHIJKL":
        ws.column_dimensions[col].width = 15
    ws.column_dimensions["H"].width = 26
    ws.freeze_panes = "B4"


def feuille_decisions(wb):
    ws = wb.create_sheet("Décisions v2", 2)
    put(ws, "A1", "TamCar — Ce qui change entre le classeur v1 (2026-10-11) et le classeur v2 (2026-10-18, corrigé le 2026-10-20)", f_title)
    entete(ws, 3, ["Décision", "Date", "Avant (v1)", "Après (v2)", "Où dans le classeur"])
    lignes = [
        ("Fonds de rachat ramené de 10 % à 5 % ; les 5 points retirés vont à TamCar", "2026-10-18",
         "Voitures : 23 % puis 22 % puis 20 % du volume ; tricycle 53 % puis 52 %", "Voitures : 25 % jusqu'à la cession ; tricycle de TamCar : 55 %", "Hypothèses B62, B63, B71, B72"),
        ("Durée des contrats : Essentiel 3 ans, Confort 4 ans (VIP 5 ans, non compté)", "2026-10-18",
         "Essentiel 24 mois, Confort 36 mois", "Essentiel 36 mois, Confort 48 mois", "Hypothèses B65, B66"),
        ("Plus d'avance de démarrage remboursable ; TamCar dépense 30 000 F par véhicule déployé", "2026-10-11 / 2026-10-18",
         "Avance de 100 000 F par voiture remboursée au mois 13 (900 000 F)", "Frais d'entrée de 30 000 F par véhicule (450 000 F au mois 1 pour 15 véhicules), aucune sortie au mois 13", "Hypothèses B67, B101 ; Mensuel ligne 37"),
        ("GPS / tracker, assurance et entretien des voitures à la charge du propriétaire", "2026-10-18",
         "Déjà l'hypothèse pour les voitures", "Confirmé", "Hypothèses B68"),
        ("Recrutement d'au minimum 6 voitures de tiers (3 Essentiel + 3 Confort) entre le mois 4 et le mois 12", "2026-10-18",
         "Aucune voiture de tiers", "Comptées dans les recettes, le responsable des opérations (3 % du volume), les postes vacants et les frais d'entrée", "Hypothèses B95 à B100 ; Mensuel lignes 87 à 96"),
        ("Taux d'atteinte des planchers, levier de pilotage", "2026-10-18",
         "Planchers atteints à 100 % seulement", "Réglable (100 % par défaut) ; la feuille Seuils fige les résultats de 100 % à 50 %", "Hypothèses B94 ; feuille Seuils"),
        ("Objectif quotidien « tout compris » pour les chauffeurs (moto 3 500 F : versement 2 500 F + cotisation TamAssur 1 000 F)", "2026-10-15",
         "Versement de 2 500 F pour la moto", "Objectif du jour de 3 500 F tout compris (versement 2 500 F + TamAssur 1 000 F) ; voir la correction du 2026-10-20 ci-dessous", "Hypothèses B75, B80"),
        ("Planchers de recettes corrigés : objectif du jour tout compris ÷ 60 % (le conducteur a déjà pris ses 40 %)", "2026-10-20",
         "Tricycle 8 333 F, moto 4 167 F, Essentiel 12 000 F, Confort 15 000 F (versement ÷ 60 %)", "Tricycle 10 000 F, moto 5 850 F, Essentiel 13 700 F, Confort 16 700 F (VIP aligné sur le Confort)", "Hypothèses B45, B46, B60, B61, B75"),
        ("La cotisation TamAssur (1 000 F par jour et par véhicule) est comprise dans l'objectif du jour : elle est financée par la part de TamCar, plus par le conducteur en plus de son versement", "2026-10-20",
         "Cotisation reversée à NSIA sans effet sur la caisse (le conducteur la paie en plus du versement) ; seul le coût des postes vacants est compté", "Cotisation déduite des recettes de chaque véhicule sous contrat (voitures, tricycle, moto pendant ses 12 mois) ; fixe, elle ne baisse pas avec le taux d'atteinte", "Hypothèses B103 ; Mensuel lignes 98 à 102 ; recettes lignes 58 à 61"),
        ("Épargne garantie TamAssur par paliers annuels alignés sur la durée du contrat (moto 12 mois : 250 000 F ; autres 24 mois : 500 000 F puis 250 000 F par année)", "2026-10-20",
         "Manque au rachat NSIA non modélisé", "Manque estimé à l'ouverture du premier palier : 29 000 F par moto (12 mois), 48 000 F par autre véhicule (24 mois) ; paliers suivants supposés sans manque", "Hypothèses B104, B105 ; Mensuel lignes 103 à 105"),
    ]
    for i, (a, b, c, d, e) in enumerate(lignes):
        r = 4 + i
        for col, v in zip("ABCDE", (a, b, c, d, e)):
            put(ws, f"{col}{r}", v, f_norm, wrap=True)
        ws.row_dimensions[r].height = 48
    put(ws, f"A{5 + len(lignes)}", "Le classeur v1 est conservé tel quel dans archives/2026-10-11_classeur_resultat_complet_v1 ; le classeur v2 du 2026-10-18 (avant les planchers corrigés) dans archives/2026-10-20_plan_v6_planchers_precedents.", f_note)
    for col, w in zip("ABCDE", (62, 18, 52, 62, 36)):
        ws.column_dimensions[col].width = w


def lire_resultats(chemin):
    """Résultats d'un classeur recalculé (même structure que simulation_v2.resultats)."""
    wb = openpyxl.load_workbook(chemin, data_only=True)
    R = wb["Résultat"]
    M = wb["Mensuel"]
    caisse = [M.cell(66, c).value for c in SIM.COLS]
    out = dict(ebe=[R.cell(9, k).value for k in (2, 3, 4)], net=[R.cell(14, k).value for k in (2, 3, 4)],
               net_apres=[R.cell(19, k).value for k in (2, 3, 4)], caisse_fin=[R.cell(33, k).value for k in (2, 3, 4)],
               point_bas=R["B34"].value, mois_negatifs=R["B35"].value,
               premier_mois_negatif=next((m for m, v in enumerate(caisse) if v < 0), None),
               mois_point_bas=caisse.index(min(caisse)))
    wb.close()
    return out


# scénarios qui changent la FLOTTE ou la LEVÉE (calculés dans le classeur lui-même, un fichier par scénario)
HORS_DEFAUT = {
    "levee_10M": ("Levée de 10 M, même flotte", {"B54": 10_000_000}),
    "levee_5M_sans_vehicule": ("Levée de 5 M, aucun véhicule acheté par TamCar", {"B54": 5_000_000, "B5": 0, "B6": 0}),
    "levee_5M_sans_vehicule_6_tiers_de_plus": ("Levée de 5 M, aucun véhicule acheté, 6 tiers de plus (mois 4 à 12)", {"B54": 5_000_000, "B5": 0, "B6": 0, "B95": 6, "B96": 6}),
    "sans_voitures": ("Sans voiture (ni Afrik Group ni tiers) : 1 tricycle et 5 motos seuls", {"B57": 0, "B58": 0, "B95": 0, "B96": 0}),
    "sans_voitures_afrik": ("Sans les voitures d'Afrik Group, avec les 6 de tiers", {"B57": 0, "B58": 0}),
    "afrik_seul": ("Voitures d'Afrik Group seules, sans tiers", {"B95": 0, "B96": 0}),
}


def scenarios_hors_defaut():
    dossier = pathlib.Path(tempfile.mkdtemp(prefix="tamcar_hd_"))
    for cle, (_, sur) in HORS_DEFAUT.items():
        MV.construire(dossier / f"{cle}.xlsx", surcharges=sur)
    SIM.recalculer(dossier)
    out = {}
    for cle, (nom, sur) in HORS_DEFAUT.items():
        r = lire_resultats(dossier / f"{cle}.xlsx")
        r["nom"] = nom
        out[cle] = r
    return out


def exporter_valeurs(chemin, base):
    """Valeurs du classeur livré (feuilles lues telles que calculées par Excel) + base de la simulation, pour le plan d'affaires."""
    wb = openpyxl.load_workbook(chemin, data_only=True)
    H, M, R = wb["Hypothèses"], wb["Mensuel"], wb["Résultat"]
    hyp = {}
    for r in range(1, H.max_row + 1):
        if H.cell(r, 2).value is not None:
            hyp[f"B{r}"] = H.cell(r, 2).value
    mensuel = {}
    for r in range(4, M.max_row + 1):
        lab = M.cell(r, 1).value
        vals = [M.cell(r, c).value for c in SIM.COLS]
        if lab is not None or any(v is not None for v in vals):
            mensuel[str(r)] = dict(label=lab, values=vals, annuel=[M.cell(r, c).value for c in (2, 3, 4, 5, 6)])
    resultat = {}
    for r in range(4, 36):
        lab = R.cell(r, 1).value
        if lab:
            resultat[str(r)] = dict(label=lab, values=[R.cell(r, c).value for c in (2, 3, 4, 5)])
    sortie = dict(date=DATE, hyp=hyp, mensuel=mensuel, resultat=resultat)
    (ICI / "classeur_v2_valeurs.json").write_text(json.dumps(sortie, ensure_ascii=False, indent=1), encoding="utf-8")
    (ICI / "base0_v2.json").write_text(json.dumps(base.to_dict(), ensure_ascii=False, indent=1), encoding="utf-8")
    wb.close()


def main():
    base = SIM.Base()
    ecart, details = controler(base)
    print(f"Contrôle du moteur contre Excel : écart maximal {ecart:.2f} F sur {len(details)} scénarios")
    assert ecart < 1, details
    T = tableaux(base)
    T["hors_defaut"] = scenarios_hors_defaut()
    chemin = MV.construire(MV.V2)
    wb = openpyxl.load_workbook(chemin)
    feuille_seuils(wb, T)
    feuille_decisions(wb)
    wb.save(chemin)
    SIM.recalculer(chemin)
    (ICI / "projections_v2.json").write_text(json.dumps(T, ensure_ascii=False, indent=1), encoding="utf-8")
    exporter_valeurs(chemin, base)
    # vérifications finales
    wb = openpyxl.load_workbook(chemin, data_only=True)
    erreurs = [(ws.title, c.coordinate, c.value) for ws in wb.worksheets for row in ws.iter_rows() for c in row
               if isinstance(c.value, str) and c.value.startswith("#")]
    R = wb["Résultat"]
    print("contrôles Résultat (doivent être 0) :", [R.cell(32, k).value for k in (2, 3, 4)], "| Marge :", [wb["Marge"].cell(56, k).value for k in (2, 3, 4)],
          "| Charges :", [wb["Charges"].cell(48, k).value for k in range(2, 7)])
    print("erreurs de formule :", erreurs)
    assert not erreurs
    return T


if __name__ == "__main__":
    main()
