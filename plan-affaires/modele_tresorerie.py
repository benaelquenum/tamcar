"""Modèle de trésorerie TamCar — 10 tricycles en deux lots de 5, horizon 36 mois.

Chaque hypothèse est nommée en tête de fichier ; rien n'est caché dans les formules.
Charges arbitrées avec Terence le 2026-09-30 (voir project_tamcar_businessplan_v5).

Usage :  python modele_tresorerie.py              → synthèse des trois scénarios
         python modele_tresorerie.py detail 9000  → flux mensuels du scénario à 9 000 F/jour
"""
import sys

# ------------------------------------------------------------------ flotte
PRIX_TRICYCLE = 1_500_000
ACOMPTE_PCT = 0.30
MENSUALITES = 12
LOT = 5
MOIS_LOT2 = 7                  # livraison du 2e lot (Parakou) ; l'acompte est payé le mois précédent
JOURS = 26
PART_TAMCAR_AN1 = 0.30 + 0.20 + 0.10 * 0.30    # propriétaire + plateforme + gestion du rachat (an 1)
PART_TAMCAR_APRES = 0.30 + 0.20 + 0.10 * 0.20  # idem, ensuite
RAMP_MOIS_LIVRAISON = 0.5      # mois de livraison : moitié de l'activité
LEVEE = 15_000_000
HORIZON = 36

# ------------------------------------------------------------------ investissements de démarrage (arbitrés)
CAPEX_M0 = {
    "Formalisation de la société": 1_500_000,
    "ANATT": 300_000,
    "Juriste (contrats)": 100_000,
    "Bureau de Cotonou (caution, aménagement)": 500_000,
    "Matériel informatique et mobilier (2 bureaux)": 1_000_000,
    "Marketing de lancement (photo, vidéo, sponsoring)": 1_000_000,
    "Graphisme": 150_000,
}
CAPEX_LOT2 = {"Bureau de Parakou (caution, aménagement)": 500_000}   # payé au mois précédent la livraison

# ------------------------------------------------------------------ charges mensuelles (arbitrées)
RO_BUDGET = 150_000            # par Responsable Opérations, budgété AU PLAFOND (Cotonou dès M1, Parakou dès le lot 2)
SECRETAIRE = 100_000
DEVELOPPEUR = 200_000          # rémunération
INFRA = 75_000                 # infrastructure technique (payée dès le mois 1)
DEVELOPPEUR_ET_INFRA = DEVELOPPEUR + INFRA
BUREAU = 50_000                # Cotonou dès M1, Parakou dès la livraison du lot 2
ELEC_EAU = 100_000
COMMUNITY_MANAGER, CM_DEBUT = 75_000, 6
COMPTABLE_TRIMESTRE = 75_000   # versé à la fin de chaque trimestre (M3, M6, ...)
JURISTE_TRIMESTRE = 50_000     # idem
ASSURANCE_PRO = 50_000         # assurance multirisque professionnelle, par mois
ADS_RESEAUX_AN1, ADS_RESEAUX_APRES = 100_000, 50_000
ADS_GOOGLE = 30_000
RADIO_LANCEMENT = 200_000      # M1-M6
STREET = 100_000
PROMO_LANCEMENT = 100_000      # M1-M6
PARRAINAGE = 100_000           # M1-M3 puis à partir de M10

# ------------------------------------------------------------------ charges ajoutées : hypothèses de travail (à confirmer)
ASSURANCE_TRICYCLE_AN = 75_000    # assurance + droit taxi + visite technique, par tricycle et par an (Terence : « pas plus de 75 000 »)
ENTRETIEN_MOIS = 0                # entretien à la charge du conducteur pour tous les véhicules (Terence, 2026-09-30)
VISITE_TECHNIQUE_AN = 0           # comprise dans les 75 000 ci-dessus
IMPOTS_TAXES_MOIS = 0             # non chiffré (patente à confirmer)


# Configuration RETENUE avec Terence (2026-09-30) : RO à 3 % du volume, ni publicité payante, ni marketing de rue,
# ni radio, ni parrainage, ni community manager ; développeur payé dès le mois 13 ; solde des tricycles sur 18 mois ;
# Claude Code (75 000 F/mois) à la charge de la société les 12 premiers mois, puis inclus dans la rémunération du développeur.
RETENU = dict(ro_variable=True, sans={'radio', 'street', 'ads', 'google', 'parrainage', 'cm'},
              debut={'developpeur': 13}, mensualites=18, outils=(75_000, 1, 12))


def simuler(jour, ro_variable=False, vehicules_externes=0, lot2_mois=None, levee=None,
            mensualites=None, acompte_pct=None, sans=(), debut=None, facteur_ro=1.0, outils=None):
    """Flux mensuels. vehicules_externes : véhicules de concessionnaires actifs dès le mois 1 (53,8 F/1000 au plus)."""
    debut2 = lot2_mois or MOIS_LOT2
    volume_tricycle = jour * JOURS
    nb_mens = mensualites or MENSUALITES
    pct = ACOMPTE_PCT if acompte_pct is None else acompte_pct
    dep = debut or {}
    acompte = PRIX_TRICYCLE * LOT * pct
    mensualite_lot = PRIX_TRICYCLE * LOT * (1 - pct) / nb_mens
    tresorerie = (levee or LEVEE) - sum(CAPEX_M0.values()) - acompte
    lignes = [dict(m=0, recettes=0, flotte=-acompte, exploitation=-sum(CAPEX_M0.values()),
                   flux=-acompte - sum(CAPEX_M0.values()), tresorerie=tresorerie)]
    for m in range(1, HORIZON + 1):
        recettes = 0
        vol_cotonou = vol_parakou = 0
        nb_tricycles = 0
        visites = 0
        for lot, debut in ((1, 1), (2, debut2)):
            if m < debut:
                continue
            age = m - debut
            ramp = RAMP_MOIS_LIVRAISON if age == 0 else 1.0
            part = PART_TAMCAR_AN1 if age < 12 else PART_TAMCAR_APRES
            vol = LOT * volume_tricycle * ramp
            recettes += vol * part
            nb_tricycles += LOT
            if age > 0 and age % 12 == 0:
                visites += LOT * VISITE_TECHNIQUE_AN
            if lot == 1:
                vol_cotonou = vol
            else:
                vol_parakou = vol
        # véhicules de concessionnaires : 23 % du volume (20 plateforme + 3 gestion rachat, an 1 ; 22 ensuite)
        n_ext = vehicules_externes(m) if callable(vehicules_externes) else vehicules_externes
        if n_ext:
            part_ext = 0.23 if m <= 12 else 0.22
            recettes += n_ext * volume_tricycle * part_ext
        flotte = 0
        if m == debut2 - 1:
            flotte -= acompte
        for debut_lot in (1, debut2):
            if debut_lot <= m < debut_lot + nb_mens:
                flotte -= mensualite_lot

        expl = 0
        if 'secretaire' not in sans and m >= dep.get('secretaire', 1): expl += SECRETAIRE
        if 'developpeur' not in sans and m >= dep.get('developpeur', 1): expl += DEVELOPPEUR
        expl += INFRA
        if outils and outils[1] <= m <= outils[2]: expl += outils[0]   # outil de développement (montant, mois début, mois fin)
        if 'elec' not in sans: expl += ELEC_EAU
        if 'assurance_pro' not in sans: expl += ASSURANCE_PRO
        if 'google' not in sans: expl += ADS_GOOGLE
        if 'street' not in sans: expl += STREET
        expl += BUREAU + (BUREAU if m >= debut2 else 0)
        if ro_variable:
            expl += min(0.03 * vol_cotonou, 150_000) + min(0.03 * vol_parakou, 150_000)
        else:
            expl += facteur_ro * (RO_BUDGET + (RO_BUDGET if m >= debut2 else 0))
        if 'cm' not in sans and m >= dep.get('cm', CM_DEBUT):
            expl += COMMUNITY_MANAGER
        if m % 3 == 0:
            if 'comptable' not in sans: expl += COMPTABLE_TRIMESTRE
            if 'juriste' not in sans: expl += JURISTE_TRIMESTRE
        if 'ads' not in sans: expl += ADS_RESEAUX_AN1 if m <= 12 else ADS_RESEAUX_APRES
        if m <= 6:
            if 'radio' not in sans: expl += RADIO_LANCEMENT
            if 'promo' not in sans: expl += PROMO_LANCEMENT
        if ('parrainage' not in sans) and (m <= 3 or m >= 10):
            expl += PARRAINAGE
        expl += nb_tricycles * (ASSURANCE_TRICYCLE_AN / 12 + ENTRETIEN_MOIS) + visites + IMPOTS_TAXES_MOIS
        capex = sum(CAPEX_LOT2.values()) if m == debut2 - 1 else 0
        flux = recettes + flotte - expl - capex
        tresorerie += flux
        lignes.append(dict(m=m, recettes=recettes, flotte=flotte, exploitation=-(expl + capex),
                           flux=flux, tresorerie=tresorerie))
    return lignes


def synthese(lignes):
    bas = min(lignes, key=lambda l: l['tresorerie'])
    mois_flux_negatifs = [l['m'] for l in lignes if l['m'] > 0 and l['flux'] < 0]
    mois_tresorerie_negative = [l['m'] for l in lignes if l['tresorerie'] < 0]
    return dict(
        recettes_cumul=sum(l['recettes'] for l in lignes),
        flotte_cumul=-sum(l['flotte'] for l in lignes),
        expl_cumul=-sum(l['exploitation'] for l in lignes),
        point_bas=bas['tresorerie'], mois_bas=bas['m'],
        fin=lignes[-1]['tresorerie'],
        premier_mois_negatif=mois_tresorerie_negative[0] if mois_tresorerie_negative else None,
        nb_mois_tresorerie_negative=len(mois_tresorerie_negative),
        nb_mois_flux_negatif=len(mois_flux_negatifs),
        dernier_mois_flux_negatif=mois_flux_negatifs[-1] if mois_flux_negatifs else None,
    )


def svg_tresorerie():
    """Courbes de trésorerie des trois scénarios (SVG en ligne, générées par le modèle)."""
    W, H, gauche, droite, haut, bas = 720, 270, 52, 16, 26, 34
    vals = [l['tresorerie'] for j in (7000, 9000, 12000) for l in simuler(j, **RETENU)]
    ymin = (int(min(vals) / 5e6) - 1) * 5e6
    ymax = (int(max(vals) / 5e6) + 1) * 5e6
    def x(m): return gauche + (W - gauche - droite) * m / HORIZON
    def y(v): return haut + (H - haut - bas) * (ymax - v) / (ymax - ymin)
    couleurs = {7000: ('#A34A29', 'Prudent · 7 000 F/jour'), 9000: ('#2251CB', 'De base · 9 000 F/jour'),
                12000: ('#097C72', 'Ambitieux · 12 000 F/jour')}
    o = [f'<svg viewBox="0 0 {W} {H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" '
         f'aria-label="Trésorerie cumulée sur 36 mois" style="font-family:Segoe UI,sans-serif">']
    v = int(ymin / 1e6)
    while v <= ymax / 1e6:
        yy = y(v * 1e6)
        zero = ' stroke-dasharray="5 4"' if v == 0 else ''
        o.append(f'<line x1="{gauche}" x2="{W-droite}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="{"#071B3A" if v == 0 else "#E3E8F5"}" stroke-width="{1.4 if v == 0 else 1}"{zero}/>')
        etiquette = '0' if v == 0 else f'{v:+d} M'
        o.append(f'<text x="{gauche-8}" y="{yy+3:.1f}" text-anchor="end" font-size="9.5" fill="#4E5B6F">{etiquette}</text>')
        v += 5
    for m in range(0, HORIZON + 1, 6):
        o.append(f'<text x="{x(m):.1f}" y="{H-14}" text-anchor="middle" font-size="9.5" fill="#4E5B6F">M{m}</text>')
    o.append(f'<text x="{(gauche+W-droite)/2:.0f}" y="{H-2}" text-anchor="middle" font-size="9" fill="#4E5B6F">mois d’activité</text>')
    for jour, (couleur, nom) in couleurs.items():
        pts = ' '.join(f'{x(l["m"]):.1f},{y(l["tresorerie"]):.1f}' for l in simuler(jour, **RETENU))
        o.append(f'<polyline points="{pts}" fill="none" stroke="{couleur}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>')
    for i, (jour, (couleur, nom)) in enumerate(couleurs.items()):
        xx = gauche + 8 + i * 190
        o.append(f'<line x1="{xx}" x2="{xx+18}" y1="12" y2="12" stroke="{couleur}" stroke-width="3"/>')
        o.append(f'<text x="{xx+24}" y="15.5" font-size="10" font-weight="600" fill="#071B3A">{nom}</text>')
    o.append('</svg>')
    return ''.join(o)


def _fmt(v):
    return f"{v:,.0f}".replace(',', ' ') if isinstance(v, (int, float)) else str(v)


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == 'detail':
        for l in simuler(int(sys.argv[2]), **RETENU):
            print(f"M{l['m']:>2}  recettes {_fmt(l['recettes']):>10}  flotte {_fmt(l['flotte']):>11}  expl {_fmt(l['exploitation']):>11}  flux {_fmt(l['flux']):>11}  tréso {_fmt(l['tresorerie']):>12}")
        sys.exit()
    for jour in (7000, 9000, 12000):
        print(f"\n=== {jour} F/jour/tricycle ===")
        for k, v in synthese(simuler(jour, **RETENU)).items():
            print(f"{k:32s} {_fmt(v)}")


# =====================================================================================================
# CAS A / CAS B (2026-09-30) — flotte mixte, cession et fin de cession
#   Cas A : 10 tricycles (5 à Cotonou au mois 1, 5 à Parakou au mois 7)
#   Cas B : cas A + 5 motos à Cotonou dès le mois 1 (test arrêté après 3 mois si < 50 % de l'objectif)
#   Entretien à la charge du conducteur pour tous les véhicules (Terence) : aucune provision côté TamCar.
#   À la fin de la cession, le véhicule passe au chauffeur : TamCar ne garde plus que 20 % (plateforme),
#   ne paie plus l'assurance, et encaisse le fonds de rachat du chauffeur (prix de la valeur résiduelle).
# =====================================================================================================
TYPES = {
    'tri':  dict(prix=1_500_000, objectif=9000, assurance_an=75_000, cession=36),
    'moto': dict(prix=550_000,   objectif=4500, assurance_an=50_000, cession=24),
}


def _g(type_, n, debut, ville='Cotonou'):
    return dict(type=type_, n=n, debut=debut, ville=ville)


CAS = {
    'A': [_g('tri', 5, 1, 'Cotonou'), _g('tri', 5, 7, 'Parakou')],
    'B': [_g('tri', 5, 1, 'Cotonou'), _g('tri', 5, 7, 'Parakou'), _g('moto', 5, 1, 'Cotonou')],
}
PART_PLATEFORME = 0.20

# Tracker GPS certifié ANATT, obligatoire (relevé de Terence du 2026-07-24, prix confirmés le 2026-09-30) :
# (première année, années suivantes) par véhicule, payé à la livraison puis à chaque anniversaire, tant que
# TamCar est propriétaire. À la cession, le chauffeur reprend le renouvellement. Mettre tracker=None pour l'exclure.
TRACKER_ANATT = {'tri': (139_000, 89_000), 'moto': (139_000, 49_000)}

# Autorisation de transporteur ANATT : 280 000 F, renouvelable chaque année (relevé du 2026-07-24 ; hypothèse confirmée par
# Terence le 2026-09-30). La première est dans le capex (300 000, mois 0) ; les renouvellements tombent aux mois 13 et 25.
ANATT_RENOUVELLEMENT = 280_000

# Impôts (CGI 2026), estimation chiffrée à la demande de Terence le 2026-10-01. Aucune exonération n'est comptée (label startup écarté).
#  - Impôt sur les sociétés : avec l'amortissement des véhicules, le résultat fiscal reste faible ou négatif ; c'est l'impôt minimum
#    qui s'applique (250 000 F + 4 000 F de redevance ORTB, art. 47), dû même en perte. Exercice = année civile, déclaration au
#    30 avril suivant : lancement en janvier 2027 -> exercice 2027 payé au mois 16, exercice 2028 au mois 28.
#  - Patente : droit fixe de 70 000 F + droit proportionnel sur la valeur locative des locaux (17 % à Cotonou, 25 % à Parakou),
#    exonération des 12 premiers mois : premier paiement 12 mois après l'ouverture du bureau, puis chaque année.
#  - La taxe sur les véhicules à moteur des tricycles (38 000 F par an) est supposée comprise dans l'enveloppe de 75 000 F par an et par tricycle.
IS_MINIMUM = 254_000
IS_MOIS = (16, 28)
PATENTE = {'Cotonou': 70_000 + 0.17 * 12 * BUREAU, 'Parakou': 70_000 + 0.25 * 12 * BUREAU}

# Véhicules de concessionnaires (tiers) : TamCar perçoit 20 % de plateforme + la gestion du fonds de rachat (3 % an 1, 2 % ensuite),
# soit 23 % puis 22 % du volume ; 20 % après cession. Le fonds de rachat revient au concessionnaire. Aucun achat, aucune assurance.
# Avance de démarrage remboursable (6.4/5.1) : versée à l'entrée, remboursée 12 mois plus tard ; elle finance les frais d'entrée
# (inspection, habillage, kit, carte de transport), que TamCar supporte donc définitivement.
TYPES['tri_t'] = dict(prix=0, objectif=9000, assurance_an=0, cession=36, tiers=True, adr=75_000)
TYPES['moto_t'] = dict(prix=0, objectif=4500, assurance_an=0, cession=24, tiers=True, adr=50_000)
PART_TIERS_AN1 = PART_PLATEFORME + 0.10 * 0.30
PART_TIERS_APRES = PART_PLATEFORME + 0.10 * 0.20


def simuler_cas(cas, facteur=1.0, cession_moto=None, levee=None, mensualites=18, acompte_pct=0.30, tracker=TRACKER_ANATT, modul=None, anatt=ANATT_RENOUVELLEMENT, tracker_tiers=None, impots=True):
    """Flux mensuels du cas 'A' ou 'B' (ou d'une liste de groupes). facteur : 1.0 = objectif atteint.
    facteur peut être un dict {'tri': x, 'moto': y}. Configuration de charges = RETENU (sans entretien)."""
    groupes = CAS[cas] if isinstance(cas, str) else cas
    TY = {k: dict(v) for k, v in TYPES.items()}
    if cession_moto:
        TY['moto']['cession'] = cession_moto
    cap0 = sum(CAPEX_M0.values())
    premier_parakou = min([g['debut'] for g in groupes if g['ville'] == 'Parakou'], default=None)
    ouvertures = {'Cotonou': 1}
    if premier_parakou is not None:
        ouvertures['Parakou'] = premier_parakou
    avances = {}
    for g in groupes:
        t = TY[g['type']]
        avances[g['debut'] - 1] = avances.get(g['debut'] - 1, 0) + g['n'] * t['prix'] * acompte_pct
    tres = (levee or LEVEE) - cap0 - avances.get(0, 0)
    lignes = [dict(m=0, recettes=0, flotte=-avances.get(0, 0), exploitation=-cap0,
                   flux=-(cap0 + avances.get(0, 0)), tresorerie=tres, cession=0, rec_ops=0, charges=0,
                   c_equipe=0, c_locaux=0, c_assur=0, c_presta=0, c_tracker=0, c_anatt=0, c_impots=0)]
    for m in range(1, HORIZON + 1):
        rec = cess = mens = veh = trk = adr_remb = 0.0
        vol_ville = {'Cotonou': 0.0, 'Parakou': 0.0}
        for g in groupes:
            t = TY[g['type']]
            if m < g['debut']:
                continue
            age = m - g['debut']
            fac = facteur.get(g['type'], 1.0) * facteur.get(g['ville'], 1.0) if isinstance(facteur, dict) else facteur
            if modul: fac *= modul(g, m)                    # facteur variable dans le temps (ex. redéploiement)
            plein = g['n'] * t['objectif'] * fac * JOURS
            vol = plein * (RAMP_MOIS_LIVRAISON if age == 0 else 1.0)
            vol_ville[g['ville']] += vol
            tiers = t.get('tiers', False)
            if tiers and age == 12:
                adr_remb += g['n'] * t['adr']                    # avance du concessionnaire remboursée 12 mois après l'entrée
            if age < t['cession']:
                if tiers:
                    rec += vol * (PART_TIERS_AN1 if age < 12 else PART_TIERS_APRES)
                    if tracker_tiers and age % 12 == 0:          # option : tracker des véhicules de tiers payé par TamCar
                        kt = g['type'][:-2]                      # 'tri_t' -> 'tri'
                        trk += g['n'] * (tracker_tiers[kt][0] if age == 0 else tracker_tiers[kt][1])
                else:
                    rec += vol * (PART_TAMCAR_AN1 if age < 12 else PART_TAMCAR_APRES)
                    veh += g['n'] * t['assurance_an'] / 12
                    if tracker and age % 12 == 0:                # tracker GPS certifié : payé à chaque anniversaire, tant que TamCar est propriétaire
                        trk += g['n'] * (tracker[g['type']][0] if age == 0 else tracker[g['type']][1])
            else:
                rec += vol * PART_PLATEFORME          # véhicule cédé : TamCar garde 20 %
            if age == t['cession'] and not tiers:     # encaissement du fonds de rachat du chauffeur
                fonds = 0.0
                for a in range(t['cession']):
                    v = plein * (RAMP_MOIS_LIVRAISON if a == 0 else 1.0)
                    fonds += v * 0.10 * (0.70 if a < 12 else 0.80)
                cess += fonds
            if age < mensualites:
                mens += g['n'] * t['prix'] * (1 - acompte_pct) / mensualites
        c_equipe = SECRETAIRE + INFRA
        if m >= 13: c_equipe += DEVELOPPEUR
        if m <= 12: c_equipe += 75_000                                 # Claude Code
        c_equipe += sum(min(0.03 * v, 150_000) for v in vol_ville.values())
        c_locaux = ELEC_EAU + BUREAU + (BUREAU if premier_parakou is not None and m >= premier_parakou else 0)
        c_assur = ASSURANCE_PRO + veh
        c_presta = 0
        if m % 3 == 0: c_presta += COMPTABLE_TRIMESTRE + JURISTE_TRIMESTRE
        if m <= 6: c_presta += PROMO_LANCEMENT
        c_anatt = anatt if (anatt and m > 1 and (m - 1) % 12 == 0) else 0          # renouvellement annuel de l'autorisation de transporteur
        c_impots = 0.0
        if impots:
            if m in IS_MOIS:
                c_impots += IS_MINIMUM
            for ville, ouverture in ouvertures.items():
                if m > ouverture and (m - ouverture) % 12 == 0:
                    c_impots += PATENTE[ville]
        charges = c_equipe + c_locaux + c_assur + c_presta + trk + c_anatt + c_impots
        ponctuel = avances.get(m, 0) + adr_remb
        if premier_parakou is not None and m == premier_parakou - 1:
            ponctuel += sum(CAPEX_LOT2.values())
        flux = rec + cess - mens - charges - ponctuel
        tres += flux
        lignes.append(dict(m=m, recettes=rec + cess, flotte=-(mens + avances.get(m, 0)), exploitation=-(charges + (ponctuel - avances.get(m, 0))),
                           flux=flux, tresorerie=tres, cession=cess, rec_ops=rec, charges=charges,
                           c_equipe=c_equipe, c_locaux=c_locaux, c_assur=c_assur, c_presta=c_presta, c_tracker=trk, c_anatt=c_anatt, c_impots=c_impots))
    return lignes


def seuil_resistance(cas, cession_moto=None):
    """Plus petit niveau d'objectif (uniforme, en %) pour lequel la trésorerie ne devient jamais négative."""
    lo, hi = 0.4, 1.3
    for _ in range(40):
        mid = (lo + hi) / 2
        if min(l['tresorerie'] for l in simuler_cas(cas, mid, cession_moto)) >= 0: hi = mid
        else: lo = mid
    return 100 * hi


def svg_tresorerie_cas():
    """Trésorerie cumulée : cas A et B, scénarios de base (trait plein) et prudent (pointillé)."""
    W, H, gauche, droite, haut, bas = 720, 270, 52, 16, 26, 34
    series = [('A · base', 'A', 1.0, '#2251CB', ''), ('B · base', 'B', 1.0, '#097C72', ''),
              ('A · prudent', 'A', 7 / 9, '#A34A29', '6 4'), ('B · prudent', 'B', 7 / 9, '#C98A1B', '6 4')]
    data = [(nom, simuler_cas(cas, fac), col, dash) for nom, cas, fac, col, dash in series]
    vals = [l['tresorerie'] for _, L, _, _ in data for l in L]
    ymin = (int(min(vals) / 5e6) - 1) * 5e6 if min(vals) < 0 else -5e6
    ymax = (int(max(vals) / 5e6) + 1) * 5e6
    def x(m): return gauche + (W - gauche - droite) * m / HORIZON
    def y(v): return haut + (H - haut - bas) * (ymax - v) / (ymax - ymin)
    o = [f'<svg viewBox="0 0 {W} {H}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" '
         f'aria-label="Trésorerie cumulée sur 36 mois, cas A et B" style="font-family:Segoe UI,sans-serif">']
    v = int(ymin / 1e6)
    while v <= ymax / 1e6:
        yy = y(v * 1e6)
        zero = ' stroke-dasharray="5 4"' if v == 0 else ''
        o.append(f'<line x1="{gauche}" x2="{W-droite}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="{"#071B3A" if v == 0 else "#E3E8F5"}" stroke-width="{1.4 if v == 0 else 1}"{zero}/>')
        o.append(f'<text x="{gauche-8}" y="{yy+3:.1f}" text-anchor="end" font-size="9.5" fill="#4E5B6F">{"0" if v == 0 else f"{v:+d} M"}</text>')
        v += 5
    for m in range(0, HORIZON + 1, 6):
        o.append(f'<text x="{x(m):.1f}" y="{H-14}" text-anchor="middle" font-size="9.5" fill="#4E5B6F">M{m}</text>')
    o.append(f'<text x="{(gauche+W-droite)/2:.0f}" y="{H-2}" text-anchor="middle" font-size="9" fill="#4E5B6F">mois d’activité</text>')
    for nom, L, col, dash in data:
        pts = ' '.join(f'{x(l["m"]):.1f},{y(l["tresorerie"]):.1f}' for l in L)
        d = f' stroke-dasharray="{dash}"' if dash else ''
        o.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"{d}/>')
    for i, (nom, L, col, dash) in enumerate(data):
        xx = gauche + 8 + i * 150
        d = f' stroke-dasharray="{dash}"' if dash else ''
        o.append(f'<line x1="{xx}" x2="{xx+20}" y1="12" y2="12" stroke="{col}" stroke-width="3"{d}/>')
        o.append(f'<text x="{xx+26}" y="15.5" font-size="10" font-weight="600" fill="#071B3A">{nom}</text>')
    o.append('</svg>')
    return ''.join(o)


svg_tresorerie = svg_tresorerie_cas      # le placeholder {{chart:tresorerie}} affiche désormais les cas A et B
