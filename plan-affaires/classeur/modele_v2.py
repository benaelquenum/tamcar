"""Classeur TamCar « Résultat complet » — version 2 (décisions du 2026-10-11 et du 2026-10-18).

Part du classeur v1 archivé (archives/2026-10-11_classeur_resultat_complet_v1) et applique :
  - fonds de rachat ramené de 10 % à 5 % : les 5 points retirés vont à TamCar -> 25 % du volume sur les voitures (20 % + 5 %), 55 % sur un tricycle de TamCar ;
  - durées de contrat : Essentiel 36 mois, Confort 48 mois (VIP 60 mois, non compté) ;
  - plus d'avance de démarrage remboursable : 30 000 F de frais d'entrée par véhicule déployé (charge) ;
  - GPS / tracker, assurance et entretien des voitures à la charge du propriétaire ;
  - un taux d'atteinte des planchers (levier de pilotage) et le recrutement de véhicules de tiers (3 Essentiel + 3 Confort au minimum).

Les formules sont celles de v1, complétées : rien n'est figé dans les feuilles de calcul (sauf la feuille « Seuils », qui garde le résultat
des simulations avec sa date).
"""
import math
import pathlib
from copy import copy

import openpyxl
from openpyxl.utils import get_column_letter as L

ICI = pathlib.Path(__file__).resolve().parent
RACINE = ICI.parent.parent
V1 = RACINE / "archives" / "2026-10-11_classeur_resultat_complet_v1" / "TamCar_resultat_complet.xlsx"
V2 = RACINE / "TamCar_resultat_complet_v2.xlsx"

HY = "Hypothèses!"
P, N_ESS, N_CONF, N_TRI, N_MOTO = (f"{HY}$B${r}" for r in (94, 95, 96, 97, 98))
DEBUT, FIN, ENTREE, PART_TM = (f"{HY}$B${r}" for r in (99, 100, 101, 102))

# valeurs par défaut du classeur v2 (cellule -> valeur) ; les scénarios les surchargent
DEFAUT = {"B94": 1, "B95": 3, "B96": 3, "B97": 0, "B98": 0, "B99": 4, "B100": 12, "B101": 30000, "B102": 0.25}


def _remplacer(valeur, ancien, nouveau, tag):
    assert ancien in valeur, (tag, ancien[:70], valeur[:160])
    return valeur.replace(ancien, nouveau, 1)


def construire(dest=V2, surcharges=None, source=V1):
    """Écrit le classeur v2 (formules, sans valeurs en cache) ; `surcharges` : {'B94': 0.7, ...} sur la feuille Hypothèses."""
    wb = openpyxl.load_workbook(source)
    H, M = wb["Hypothèses"], wb["Mensuel"]

    # ------------------------------------------------------------------ Hypothèses : décisions
    def note(r, texte):
        H.cell(r, 3).value = texte

    H["B62"], H["B63"] = 0.25, 0.25
    H["A62"] = "Part de TamCar sur le volume des voitures, première année"
    note(62, "20 % plateforme + 5 % : le fonds de rachat passe de 10 % à 5 % et les 5 points retirés vont à TamCar (décision du 2026-10-18) ; le propriétaire garde 30 % et reçoit le fonds de 5 % à la cession")
    H["A63"] = "Part de TamCar sur le volume des voitures, jusqu'à la cession"
    note(63, "Idem : 20 % + 5 %")
    H["B65"], H["B66"] = 36, 48
    note(65, "Terence (2026-10-18) : 3 ans pour l'Essentiel (Confort 4 ans, VIP 5 ans, non compté)")
    note(66, "Terence (2026-10-18) : 4 ans pour le Confort")
    H["A67"] = "Avance de démarrage du propriétaire, par voiture (supprimée)"
    H["B67"] = 0
    note(67, "Supprimée (décision du 2026-10-11) : TamCar avance les frais d'entrée (ligne 101), aucun remboursement au mois 13")
    H["A68"] = "Assurance, trackers GPS, entretien des voitures"
    note(68, "À la charge du propriétaire, y compris le GPS / tracker (confirmé par Terence le 2026-10-18)")
    H["B71"], H["B72"] = 0.55, 0.55
    H["A71"] = "Part de TamCar sur le volume d'un tricycle, première année"
    note(71, "30 % propriétaire (TamCar) + 20 % plateforme + 5 % fonds de rachat qui revient à TamCar ; l'autre moitié du fonds (5 %) est le fonds du conducteur")
    note(72, "Idem : 55 %")

    # ------------------------------------------------------------------ Hypothèses : leviers (lignes 93 à 102)
    H["A93"] = "Pilotage et recrutement (ajout du 2026-10-18)"
    for col in "ABC":
        H[f"{col}93"]._style = copy(H[f"{col}86"]._style)
    lignes = [
        (94, "Taux d'atteinte des planchers (100 % = planchers atteints)", 1, "0%", "Tout le volume (versements des motos compris) est multiplié par ce taux. Mettre 70 % pour le scénario de référence de sécurité ; voir la feuille Seuils"),
        (95, "Voitures Essentiel de tiers à recruter (en plus des 6 d'Afrik Group)", 3, "0", "Décision du 2026-10-18 : au minimum 3 Essentiel + 3 Confort de tiers ; mettre 0 pour les exclure"),
        (96, "Voitures Confort de tiers à recruter (en plus des 3 d'Afrik Group)", 3, "0", "Idem"),
        (97, "Tricycles de tiers à recruter", 0, "0", "Option : un tricycle de tiers rapporte 25 % du volume plancher à TamCar (hypothèse à confirmer)"),
        (98, "Motos de tiers à recruter", 0, "0", "Option : une moto de tiers rapporte 25 % du volume plancher (hypothèse à confirmer) ; peu rentable"),
        (99, "Arrivée des véhicules de tiers : à partir du mois", 4, "0", "Les arrivées sont étalées régulièrement entre ce mois et le suivant"),
        (100, "… jusqu'au mois", 12, "0", "Le dernier véhicule arrive à ce mois"),
        (101, "Frais d'entrée par véhicule déployé (inspection, habillage, kit chauffeur)", 30000, '#,##0;\\(#,##0\\);\\-', "Décision du 2026-10-11 : TamCar dépense 30 000 F par véhicule ; compté à l'arrivée de chaque véhicule (15 au mois 1, puis les véhicules de tiers)"),
        (102, "Part de TamCar sur un tricycle ou une moto de tiers", 0.25, "0%", "Même partage que les voitures : 30 % propriétaire, 20 % plateforme, 5 % fonds du conducteur, 5 % fonds qui revient à TamCar"),
    ]
    for r, label, val, fmt, nt in lignes:
        H.cell(r, 1, label)._style = copy(H["A31"]._style)
        c = H.cell(r, 2, val)
        c._style = copy(H["B31"]._style)
        c.number_format = fmt
        H.cell(r, 3, nt)._style = copy(H["C31"]._style)
    for cell, val in (surcharges or {}).items():
        H[cell] = val

    # ------------------------------------------------------------------ Mensuel
    cols = range(7, 44)  # G (mois 0) à AQ (mois 36)

    def ligne(r, label, fn, style_row=38, gras=False):
        M.cell(r, 1, label)._style = copy(M.cell(style_row, 1)._style)
        for c in cols:
            cell = M.cell(r, c, fn(c, L(c), L(c - 1)))
            cell._style = copy(M.cell(style_row, c)._style)
            cell.number_format = '#,##0;\\(#,##0\\);\\-'
        M.cell(r, 2, f"=G{r}")
        M.cell(r, 3, f"=SUM(H{r}:S{r})")
        M.cell(r, 4, f"=SUM(T{r}:AE{r})")
        M.cell(r, 5, f"=SUM(AF{r}:AQ{r})")
        M.cell(r, 6, f"=SUM(B{r}:E{r})")
        for c in range(2, 7):
            M.cell(r, c)._style = copy(M.cell(style_row, c)._style)
            M.cell(r, c).number_format = '#,##0;\\(#,##0\\);\\-'

    # section « véhicules de tiers » (style de la ligne 79)
    for c in range(1, 44):
        M.cell(86, c)._style = copy(M.cell(79, c)._style)
    M.cell(86, 1, "VÉHICULES DE TIERS À RECRUTER (leviers de volume ; déjà compris dans les recettes et les volumes ci-dessus)")

    def cumul(nom):
        return lambda c, k, j: "=0" if c == 7 else (
            f"=ROUND({nom}*MAX(0,MIN(1,({k}$4-{DEBUT}+1)/({FIN}-{DEBUT}+1))),0)")

    ligne(87, "Voitures Essentiel de tiers en service (cumul)", cumul(N_ESS))
    ligne(88, "Voitures Confort de tiers en service (cumul)", cumul(N_CONF))
    ligne(89, "Tricycles de tiers en service (cumul)", cumul(N_TRI))
    ligne(90, "Motos de tiers en service (cumul)", cumul(N_MOTO))
    ligne(91, "Véhicules de tiers arrivés ce mois", lambda c, k, j: "=0" if c == 7 else f"=({k}87-{j}87)+({k}88-{j}88)+({k}89-{j}89)+({k}90-{j}90)")

    def vol_tiers(rang, plancher):
        return lambda c, k, j: "=0" if c == 7 else (
            f"={P}*{HY}$B$47*{plancher}*({k}{rang}-0.5*({k}{rang}-{j}{rang}))")

    ligne(92, "Volume des Essentiel de tiers (courses, au taux d'atteinte retenu)", vol_tiers(87, f"{HY}$B$60"))
    ligne(93, "Volume des Confort de tiers", vol_tiers(88, f"{HY}$B$61"))
    ligne(94, "Volume des tricycles de tiers", vol_tiers(89, f"{HY}$B$45"))
    ligne(95, "Volume des motos de tiers", vol_tiers(90, f"{HY}$B$46"))
    ligne(96, "Part de TamCar sur les véhicules de tiers (déjà dans les lignes 58 à 61)",
          lambda c, k, j: f"=({k}92+{k}93)*{HY}$B$63+({k}94+{k}95)*{PART_TM}")
    for r in (87, 88, 89, 90, 91):
        for c in range(7, 44):
            M.cell(r, c).number_format = '0'

    for c in cols:
        k = L(c)
        # responsable des opérations : taux d'atteinte et véhicules de tiers
        v = M.cell(33, c).value
        if isinstance(v, str) and v.startswith("=MIN("):
            v = _remplacer(v, f"{HY}$B$43*(", f"{HY}$B$43*{P}*(", f"M33 {k}")
            fin_somme = f"IF({k}$4>={HY}$B$59,{HY}$B$57*{HY}$B$60+{HY}$B$58*{HY}$B$61,0))"
            v = _remplacer(v, fin_somme, fin_somme[:-1] + f"+{k}87*{HY}$B$60+{k}88*{HY}$B$61+{k}89*{HY}$B$45+{k}90*{HY}$B$46)", f"M33b {k}")
            M.cell(33, c).value = v
        # frais d'entrée (remplace l'avance remboursée)
        M.cell(37, c).value = (f"={ENTREE}*(N({k}7)+N({k}8)+IF({k}$4={HY}$B$59,{HY}$B$57+{HY}$B$58,0)+{k}91)"
                               if c > 7 else "=0")
        # postes vacants NSIA : + véhicules de tiers
        v = M.cell(38, c).value
        if isinstance(v, str) and v.startswith("=("):
            prem = f"IF({k}$4>={HY}$B$59,{HY}$B$57+{HY}$B$58,0))"
            v = _remplacer(v, prem, prem[:-1] + f"+{k}87+{k}88+{k}89+{k}90)", f"M38 {k}")
            M.cell(38, c).value = v
        # recettes : taux d'atteinte + véhicules de tiers
        for r, extra in ((58, f"+{k}94*{PART_TM}"), (59, f"+{k}95*{PART_TM}"),
                         (60, f"+{k}92*{HY}$B$63"), (61, f"+{k}93*{HY}$B$63")):
            v = M.cell(r, c).value
            if isinstance(v, str) and v.startswith("="):
                M.cell(r, c).value = f"=({v[1:]})*{P}{extra}"
        # volumes
        for r, extra in ((80, f"+{k}94"), (81, f"+{k}95"), (82, f"+{k}92"), (83, f"+{k}93")):
            v = M.cell(r, c).value
            if isinstance(v, str) and v.startswith("="):
                M.cell(r, c).value = f"=({v[1:]})*{P}{extra}"

    # libellés
    M["A37"] = "Frais d'entrée des véhicules déployés (inspection, habillage, kit : 30 000 F par véhicule)"
    M["A33"] = "Responsable des opérations (3 % du volume, plafonné)"
    M["A80"] = "Volume des tricycles (TamCar + tiers)"
    M["A81"] = "Volume des motos (TamCar + tiers)"
    M["A82"] = "Volume des voitures Essentiel (Afrik Group + tiers)"
    M["A83"] = "Volume des voitures Confort (Afrik Group + tiers)"
    M["A79"] = "VOLUME DE COURSES (au taux d'atteinte retenu ; sert à répartir le responsable des opérations ; mois de lancement compté pour moitié)"
    for r, t in ((58, "Tricycles : part de TamCar sur le volume (TamCar + tiers)"),
                 (59, "Motos : versement minimum, puis commission après cession (TamCar + tiers)"),
                 (60, "Voitures Essentiel : part de TamCar sur le volume (Afrik Group + tiers)"),
                 (61, "Voitures Confort : part de TamCar sur le volume (Afrik Group + tiers)")):
        M.cell(r, 1).value = t

    # ------------------------------------------------------------------ autres feuilles : libellés et notes
    ren = {"Voitures Essentiel (6)": "Voitures Essentiel (Afrik Group + tiers)",
           "Voitures Confort (3)": "Voitures Confort (Afrik Group + tiers)",
           "Motos (5)": "Motos (5 de TamCar + tiers)",
           "Tricycle (1)": "Tricycle (1 de TamCar + tiers)"}
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                if isinstance(cell.value, str) and not cell.value.startswith("="):
                    for a, b in ren.items():
                        if cell.value == a:
                            cell.value = b
    wb["Synthèse"]["A30"] = "Frais d'entrée des véhicules déployés (30 000 F par véhicule)"

    Mg = wb["Marge"]
    for bloc in (15, 30, 45):
        deb, fin = {15: ("H", "S"), 30: ("T", "AE"), 45: ("AF", "AQ")}[bloc]
        Mg[f"B{bloc}"] = f"=AVERAGE(Mensuel!{deb}10:{fin}10)+AVERAGE(Mensuel!{deb}90:{fin}90)"
        Mg[f"C{bloc}"] = f"=AVERAGE(Mensuel!{deb}9:{fin}9)+AVERAGE(Mensuel!{deb}89:{fin}89)"
        Mg[f"D{bloc}"] = f"={HY}$B$57+AVERAGE(Mensuel!{deb}87:{fin}87)"
        Mg[f"E{bloc}"] = f"={HY}$B$58+AVERAGE(Mensuel!{deb}88:{fin}88)"

    R = wb["Résultat"]
    R["A37"] = ("Lecture : plus d'avance de démarrage remboursable (décision du 2026-10-11) ; les frais d'entrée (30 000 F par véhicule déployé, "
                "15 véhicules au mois 1 puis les véhicules de tiers) sont une charge de fonctionnement de l'année d'arrivée.")
    D = wb["Démarrage"]
    D["A28"] = ("Les voitures (6 Essentiel, 3 Confort) appartiennent à Afrik Group : assurance, trackers GPS et entretien à la charge du propriétaire. "
                "TamCar avance 30 000 F de frais d'entrée par véhicule (pas d'avance remboursable).")

    S = wb["Résumé"]
    S["A2"] = ("Flotte : 1 tricycle + 5 motos de TamCar + 9 voitures d'Afrik Group (6 Essentiel, 3 Confort) + au minimum 6 voitures de tiers (3 Essentiel, 3 Confort) "
               "recrutées entre le mois 4 et le mois 12. Recettes aux planchers de Mayeul, au taux d'atteinte de la feuille Hypothèses (ligne 94). Levée de 15 M. Lancement en janvier 2027 (mois 1).")
    S["A27"] = ("Recettes aux planchers : seules les courses jusqu'au plancher de Mayeul sont comptées. Tout volume au-dessus du plancher s'ajoute aux recettes. "
                "Le premier mois de lancement (et le mois d'arrivée d'un véhicule) compte pour moitié. Part de TamCar : 25 % sur les voitures, 55 % sur le tricycle de TamCar, "
                "versement minimum de 2 500 F par jour sur les motos de TamCar (décision du 2026-10-18).")
    S["A30"] = ("Cellules en bleu sur fond jaune (feuille Hypothèses) : à modifier ; tout le reste se recalcule. Le taux d'atteinte des planchers et les véhicules de tiers "
                "se règlent aux lignes 94 à 102. La feuille Seuils garde le résultat de simulations (valeurs figées, avec leur date).")
    wb.save(dest)
    return dest


if __name__ == "__main__":
    print(construire())
