"""Chiffres du plan d'affaires v6 : tous lus dans le classeur TamCar_resultat_complet_v2 (valeurs exportées par classeur/projections_v2.py).

Aucun montant n'est saisi à la main dans les pages générées : on change une hypothèse dans le classeur, on relance
`python classeur/projections_v2.py` puis `python build.py`.
"""
import json
import pathlib
import sys

ICI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ICI / "classeur"))
import simulation_v2 as SIM  # noqa: E402  (moteur contrôlé contre Excel, sans appel à Excel ici)

V = json.loads((ICI / "classeur" / "classeur_v2_valeurs.json").read_text(encoding="utf-8"))
T = json.loads((ICI / "classeur" / "projections_v2.json").read_text(encoding="utf-8"))
BASE = SIM.Base.from_dict(json.loads((ICI / "classeur" / "base0_v2.json").read_text(encoding="utf-8")))
HYP = V["hyp"]
DATE_CLASSEUR = V["date"]


def h(cell):
    return HYP[cell]


def ligne(r):
    """Valeurs mensuelles (indice = mois 0 à 36) de la ligne r de la feuille Mensuel."""
    return [x or 0 for x in V["mensuel"][str(r)]["values"]]


def annuel(r):
    """[mois 0, année 1, année 2, année 3, total] de la ligne r."""
    return [x or 0 for x in V["mensuel"][str(r)]["annuel"]]


def somme(rs, i):
    return sum(annuel(r)[i] for r in rs)


# ------------------------------------------------------------------ mise en forme
def n(v):
    return f"{round(v):,}".replace(",", " ").replace("-", "−")


def sg(v):
    return ("+ " if v >= 0 else "− ") + f"{abs(round(v)):,}".replace(",", " ")


def mm(v, d=1, signe=True):
    s = f"{abs(v) / 1e6:.{d}f}".replace(".", ",")
    if not signe:
        return f"{s} M"
    return ("+" if v >= 0 else "−") + f"{s} M"


def pct(v, d=0):
    return f"{v:.{d}f}".replace(".", ",") + " %"


def taux(p, d=0):
    return pct(100 * p, d)


# ------------------------------------------------------------------ hypothèses nommées
LEVEE = h("B54")
PRIX_TRICYCLE = h("B9")
ACOMPTE_PCT = h("B10")
MENS_TRICYCLE = h("B11")
PRIX_MOTO = h("B12")
N_TRI = h("B5")
N_MOTO = h("B6")
N_ESS, N_CONF = h("B57"), h("B58")
N_ESS_T, N_CONF_T = h("B95"), h("B96")
PLANCHER_ESS, PLANCHER_CONF = h("B60"), h("B61")
VOL_TRI, VOL_MOTO = h("B45"), h("B46")
COTIS = h("B103")                          # cotisation TamAssur : 1 000 F par jour, comprise dans l'objectif du conducteur et financée par la part de TamCar
# Objectif du jour « tout compris » = 60 % du plancher, arrondi à la centaine (décision du 2026-10-20) ; le versement est l'objectif moins la cotisation TamAssur
OBJ_ESS, OBJ_CONF = round(0.6 * PLANCHER_ESS, -2), round(0.6 * PLANCHER_CONF, -2)    # 8 200, 10 000
OBJ_TRI, OBJ_MOTO = round(0.6 * VOL_TRI, -2), h("B75")                               # 6 000, 3 500
VERS_TRI, VERS_MOTO = OBJ_TRI - COTIS, OBJ_MOTO - COTIS                              # 5 000, 2 500
VERS_ESS, VERS_CONF = OBJ_ESS - COTIS, OBJ_CONF - COTIS                              # 7 200, 9 000
JOURS = h("B47")
PART_VOITURE = h("B62")                    # 25 %
PART_TRICYCLE = h("B71")                   # 55 %
# Part de TamCar par mois, nette de la cotisation TamAssur (la moto : le versement, déjà net)
PART_NETTE_MENS = {"moto": VERS_MOTO * JOURS,
                   "tri": (VOL_TRI * PART_TRICYCLE - COTIS) * JOURS,
                   "ess": (PLANCHER_ESS * PART_VOITURE - COTIS) * JOURS,
                   "conf": (PLANCHER_CONF * PART_VOITURE - COTIS) * JOURS}
TRI_MENSUALITE = PRIX_TRICYCLE * (1 - ACOMPTE_PCT) / MENS_TRICYCLE
# taux d'atteinte du plancher à partir duquel la part nette du tricycle (cotisation TamAssur déduite) couvre sa mensualité d'achat
SEUIL_MENS_TRI = (TRI_MENSUALITE + COTIS * JOURS) / (VOL_TRI * JOURS * PART_TRICYCLE)
NSIA_12, NSIA_24 = h("B104"), h("B105")    # manque estimé au rachat NSIA à l'ouverture du premier palier (moto à 12 mois, autres à 24 mois)
FRAIS_ENTREE = h("B101")
N_VEHICULES_TAMCAR = N_TRI + N_MOTO
N_VEHICULES_MOIS1 = N_TRI + N_MOTO + N_ESS + N_CONF
CAPEX = sum(h(c) for c in ("B22", "B23", "B24", "B25", "B26", "B27", "B28"))   # démarrage (mois 0)
DEMARRAGE = annuel(20)[0]
ACOMPTE_TRICYCLE = annuel(42)[1]
MOTOS_COMPTANT = annuel(44)[1]


# ------------------------------------------------------------------ agrégats annuels (années 1, 2, 3) et 36 mois
def an3(r):
    a = annuel(r)
    return [a[1], a[2], a[3]]


RECETTES = [x for x in an3(62)]
REC_CAT = {"tri": an3(58), "moto": an3(59), "ess": an3(60), "conf": an3(61)}
FONCTIONNEMENT = an3(39)
MISE_EN_CIRCULATION = an3(52)
CHARGES_EXPL = [a + b for a, b in zip(FONCTIONNEMENT, MISE_EN_CIRCULATION)]
EBE = [r - c for r, c in zip(RECETTES, CHARGES_EXPL)]
AMORT = [-x for x in (V["resultat"]["10"]["values"][0], V["resultat"]["10"]["values"][1], V["resultat"]["10"]["values"][2])]
RES = {k: V["resultat"][k]["values"] for k in V["resultat"]}
EBE_CLASSEUR = RES["9"][:3]
NET_MODELE = RES["14"][:3]
NET_APRES = RES["19"][:3]
CAISSE_FIN = RES["33"][:3]
CAISSE = ligne(66)                          # mois 0 à 36
POINT_BAS = min(CAISSE)
MOIS_POINT_BAS = CAISSE.index(POINT_BAS)
MOIS_NEG = sum(1 for v in CAISSE if v < 0)

CATS = {
    "equipe": ("Équipe", "responsable des opérations à 3 %, secrétaire-comptable, développeur dès le mois 13, infrastructure, outil de développement", (23, 24, 25, 26, 33)),
    "locaux": ("Locaux", "bureau, électricité et eau", (27, 28)),
    "assur": ("Assurances", "multirisque professionnelle ; assurance, droit taxi et visite technique des véhicules de TamCar", (29, 48, 49)),
    "presta": ("Prestataires et promotions de lancement", "comptable externe, juriste, promotions", (30, 31, 32)),
    "entree": ("Frais d’entrée des véhicules", "30 000 F par véhicule déployé : inspection, habillage, kit chauffeur", (37,)),
    "nsia": ("Épargne NSIA (TamAssur)", "postes vacants (cotisation avancée à NSIA) et manque au rachat à l’ouverture du premier palier de retrait", (38,)),
    "tracker": ("Trackers GPS certifiés ANATT", "véhicules de TamCar : à la livraison puis à chaque anniversaire", (50, 51)),
    "anatt": ("Autorisation de transporteur ANATT", "renouvellement annuel, 280 000 F (mois 13 et 25)", (34,)),
    "impots": ("Impôts et taxes", "impôt minimum sur les sociétés, patente", (35, 36)),
}


def cat_total(cle, i=4):
    return sum(annuel(r)[i] for r in CATS[cle][2])


CHARGES_36 = sum(CHARGES_EXPL)
RECETTES_36 = sum(RECETTES)


def phase(m1, m2):
    """Moyennes mensuelles sur les mois m1 à m2."""
    k = m2 - m1 + 1

    def moy(rs):
        return sum(sum(ligne(r)[m1:m2 + 1]) for r in rs) / k
    rec = moy((62,))
    ch = moy(tuple(sorted({r for c in CATS.values() for r in c[2]})))
    achats = moy((45,))
    return dict(rec=rec, ch=ch, achats=achats, flux=rec - ch - achats,
                equipe=moy(CATS["equipe"][2]), locaux_presta=moy(CATS["locaux"][2] + CATS["presta"][2]),
                autres=ch - moy(CATS["equipe"][2]) - moy(CATS["locaux"][2] + CATS["presta"][2]))


PHASES = [(1, 6, "Mois 1 à 6", "lancement, arrivée progressive des véhicules"),
          (7, 12, "Mois 7 à 12", "dernières voitures de tiers, tricycle en remboursement"),
          (13, 24, "Mois 13 à 24", "développeur rémunéré, motos cédées"),
          (25, 36, "Mois 25 à 36", "régime établi")]


def phase_gen(m1, m2, tiers=True):
    """Moyennes mensuelles sur les mois m1 à m2, pour la flotte de départ (tiers=False) ou la flotte recrutée (tiers=True), planchers atteints."""
    s = serie(1.0, tiers)
    k = m2 - m1 + 1

    def moy(vals):
        return sum(vals[m1:m2 + 1]) / k
    rec = moy(s["rec"])
    ch_total = moy(s["ch"])
    achats = moy(ligne(45))
    ch = ch_total - achats
    ops = moy(ligne(33)) if tiers else moy(BASE.ops)
    equipe = sum(moy(ligne(r)) for r in (23, 24, 25, 26)) + ops
    locaux_presta = sum(moy(ligne(r)) for r in (27, 28, 30, 31, 32))
    return dict(rec=rec, ch=ch, achats=achats, flux=rec - ch_total, equipe=equipe, locaux_presta=locaux_presta,
                autres=ch - equipe - locaux_presta, ops=ops)


def ops_mensuel(mois=24, tiers=True):
    return ligne(33)[mois] if tiers else BASE.ops[mois]


def cumul(rs, jusqu_a):
    return sum(sum(ligne(r)[0:jusqu_a + 1]) for r in rs)


def plan_financement(m):
    """Emplois et ressources cumulés au mois m."""
    demarrage = cumul((20,), m)
    achats = cumul((45,), m)
    exploitation = cumul((39, 52), m)
    emplois = demarrage + achats + exploitation
    recettes = cumul((62,), m)
    return dict(demarrage=demarrage, achats=achats, exploitation=exploitation, emplois=emplois, levee=LEVEE, recettes=recettes,
                ressources=LEVEE + recettes, solde=LEVEE + recettes - emplois, caisse=CAISSE[m])


# ------------------------------------------------------------------ scénarios (taux d'atteinte des planchers)
TAUX = [r["taux"] for r in T["avec_tiers"]["rows"]]


def scen(cle, p):
    for r in T[cle]["rows"]:
        if abs(r["taux"] - p) < 1e-9:
            return r
    raise KeyError(p)


def seuils(cle):
    return T[cle]["seuils"]


HD = T["hors_defaut"]
MIN = T["minimal"]
VALEUR = T["valeur_vehicule"]
COMBOS = T["combos"]


BASE_SANS_NSIA = SIM.Base.from_dict(dict(BASE.to_dict(), ch=[c - x for c, x in zip(BASE.ch, BASE.nsia)], nsia=[0] * 37, h=dict(BASE.h, B104=0, B105=0)))   # valeur par vehicule en regime etabli : le manque au rachat NSIA est ponctuel et compte a part


def serie(p, tiers=True):
    kw = dict(ess=N_ESS_T, conf=N_CONF_T) if tiers else {}
    return SIM.simuler(BASE, p, **kw)


def rec_moyenne(p, an, tiers=True):
    """Recettes mensuelles moyennes de TamCar l'année an (1 à 3)."""
    s = serie(p, tiers)["rec"]
    return sum(s[12 * (an - 1) + 1:12 * an + 1]) / 12


def rec_36(p, tiers=True):
    return sum(serie(p, tiers)["rec"][1:])


def res(p, tiers=True):
    """Résultats (excédent, net, caisse...) à un taux d'atteinte donné."""
    return SIM.resultats(BASE, serie(p, tiers))


def mois_flux_negatifs(p, tiers=True):
    s = serie(p, tiers)["flux"]
    return [m for m in range(1, 37) if s[m] < 0]


def serie_caisse(p, tiers=True):
    kw = dict(ess=N_ESS_T, conf=N_CONF_T) if tiers else {}
    return SIM.simuler(BASE, p, **kw)["caisse"]


# ------------------------------------------------------------------ valeur d'usage (2.10) : revenus de TamCar sur 36 mois, actualisés à 20 %, flotte actuelle sans véhicule de tiers
def valeur_usage():
    s = SIM.simuler(BASE, 1.0)
    return sum(s["rec"][m] / (1.2 ** (m / 12)) for m in range(1, 37))


# ------------------------------------------------------------------ graphique de trésorerie (SVG en ligne)
def svg_tresorerie(series, titre="Trésorerie cumulée sur 36 mois"):
    """series : liste de (nom, valeurs mois 0..36, couleur, tiret)."""
    W, H, gauche, droite, haut, bas = 720, 270, 52, 16, 26, 34
    vals = [v for _, s, _, _ in series for v in s]
    ymin = (int(min(vals) / 5e6) - 1) * 5e6 if min(vals) < 0 else 0
    ymax = (int(max(vals) / 5e6) + 1) * 5e6

    def x(m):
        return gauche + (W - gauche - droite) * m / 36

    def y(v):
        return haut + (H - haut - bas) * (ymax - v) / (ymax - ymin)
    o = [f'<svg viewBox="0 0 {W} {H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" '
         f'aria-label="{titre}" style="font-family:Segoe UI,sans-serif">']
    v = int(ymin / 1e6)
    while v <= ymax / 1e6:
        yy = y(v * 1e6)
        zero = ' stroke-dasharray="5 4"' if v == 0 else ''
        o.append(f'<line x1="{gauche}" x2="{W-droite}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="{"#071B3A" if v == 0 else "#E3E8F5"}" stroke-width="{1.4 if v == 0 else 1}"{zero}/>')
        o.append(f'<text x="{gauche-8}" y="{yy+3:.1f}" text-anchor="end" font-size="9.5" fill="#4E5B6F">{"0" if v == 0 else f"{v:+d} M"}</text>')
        v += 5
    for m in range(0, 37, 6):
        o.append(f'<text x="{x(m):.1f}" y="{H-14}" text-anchor="middle" font-size="9.5" fill="#4E5B6F">M{m}</text>')
    o.append(f'<text x="{(gauche+W-droite)/2:.0f}" y="{H-2}" text-anchor="middle" font-size="9" fill="#4E5B6F">mois d’activité</text>')
    for nom, s, col, dash in series:
        pts = " ".join(f"{x(m):.1f},{y(val):.1f}" for m, val in enumerate(s))
        d = f' stroke-dasharray="{dash}"' if dash else ""
        o.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"{d}/>')
    pas = 150 if len(series) > 3 else 190
    for i, (nom, s, col, dash) in enumerate(series):
        xx = gauche + 8 + i * pas
        d = f' stroke-dasharray="{dash}"' if dash else ""
        o.append(f'<line x1="{xx}" x2="{xx+18}" y1="12" y2="12" stroke="{col}" stroke-width="3"{d}/>')
        o.append(f'<text x="{xx+24}" y="15.5" font-size="10" font-weight="600" fill="#071B3A">{nom}</text>')
    o.append("</svg>")
    return "".join(o)


def svg_tresorerie_plan():
    s = [("Planchers atteints", serie_caisse(1.0), "#2251CB", ""),
         ("80 % des planchers", serie_caisse(0.8), "#097C72", ""),
         ("70 %", serie_caisse(0.7), "#C98A1B", "6 4"),
         ("60 %", serie_caisse(0.6), "#A34A29", "6 4")]
    return svg_tresorerie(s)


def svg_tresorerie_sans_tiers():
    s = [("Planchers atteints", serie_caisse(1.0, False), "#2251CB", ""),
         ("80 %", serie_caisse(0.8, False), "#097C72", ""),
         ("70 %", serie_caisse(0.7, False), "#C98A1B", "6 4"),
         ("60 %", serie_caisse(0.6, False), "#A34A29", "6 4")]
    return svg_tresorerie(s, "Trésorerie cumulée, sans véhicule de tiers")


if __name__ == "__main__":
    print("date classeur", DATE_CLASSEUR)
    print("recettes", [n(x) for x in RECETTES], "charges", [n(x) for x in CHARGES_EXPL], "ebe", [n(x) for x in EBE], "ebe classeur", [n(x) for x in EBE_CLASSEUR])
    print("net", [n(x) for x in NET_MODELE], "apres", [n(x) for x in NET_APRES], "caisse", [n(x) for x in CAISSE_FIN], "bas", n(POINT_BAS), MOIS_POINT_BAS, "neg", MOIS_NEG)
    print("cats 36m", {k: n(cat_total(k)) for k in CATS}, "total", n(CHARGES_36))
    for p in PHASES:
        print(p[2], {k: round(v) for k, v in phase(p[0], p[1]).items()})
    for m in (0, 12, 24, 36):
        print("M", m, {k: round(v) for k, v in plan_financement(m).items()})
    print("valeur d'usage", n(valeur_usage()))
    print("capex", CAPEX, "demarrage", DEMARRAGE, "acompte", ACOMPTE_TRICYCLE, "motos", MOTOS_COMPTANT)
    print("versements", VERS_TRI, VERS_MOTO, VERS_ESS, VERS_CONF, "objectifs", OBJ_TRI, OBJ_MOTO, OBJ_ESS, OBJ_CONF, "part nette", PART_NETTE_MENS)
