import pathlib

ICI = pathlib.Path(__file__).parent


def patch(nom, paires):
    p = ICI / nom
    s = p.read_text(encoding='utf-8')
    for old, new in paires:
        assert old in s, (nom, old[:90])
        s = s.replace(old, new, 1)
    p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------- modèle : facteur dans le temps
patch('modele_tresorerie.py', [
    ("def simuler_cas(cas, facteur=1.0, cession_moto=None, levee=None, mensualites=18, acompte_pct=0.30, tracker=TRACKER_ANATT):",
     "def simuler_cas(cas, facteur=1.0, cession_moto=None, levee=None, mensualites=18, acompte_pct=0.30, tracker=TRACKER_ANATT, modul=None):"),
    ("            plein = g['n'] * t['objectif'] * fac * JOURS\n",
     "            if modul: fac *= modul(g, m)                    # facteur variable dans le temps (ex. redéploiement)\n            plein = g['n'] * t['objectif'] * fac * JOURS\n"),
])

# ---------------------------------------------------------------- chiffres : reprise après le creux, sensibilités aux risques
pc = ICI / 'chiffres.py'
s = pc.read_text(encoding='utf-8')
marque = "if __name__ == '__main__':"
ajout = '''def reprise(cas='A', sc='base'):
    """Creux de trésorerie et remontée qui suit (scénario de base par défaut)."""
    L = run(cas, sc)
    c = [l['tresorerie'] for l in L]
    neg = [m for m in range(37) if c[m] < 0]
    mm_ = c.index(min(c))
    prem = neg[-1] + 1 if neg else None
    return dict(neg=neg, premier=prem, t_premier=c[prem] if neg else None, t24=c[24], t30=c[30], t36=c[36],
                moyen=(c[36] - c[25]) / 11, mois_mini=mm_, trk_creux=L[mm_]['c_tracker'], mini=min(c))


def test(cas, facteur=1.0, modul=None):
    """(point bas, mois du point bas, trésorerie au mois 36) d'un test de résistance."""
    L = M.simuler_cas(cas, facteur, CESSION_MOTO if cas == 'B' else None, modul=modul)
    c = [l['tresorerie'] for l in L]
    return min(c), c.index(min(c)), c[-1]


def parakou(cas, f=0.5, redeploiement=False):
    """Le second lot (Parakou) ne fait que f % de l'objectif ; avec redéploiement, il rejoint le Sud à 100 % dès le mois 13."""
    if redeploiement:
        return test(cas, 1.0, modul=lambda g, m: f if (g['ville'] == 'Parakou' and m <= 12) else 1.0)
    return test(cas, {'tri': 1.0, 'moto': 1.0, 'Parakou': f})


'''
assert marque in s
pc.write_text(s.replace(marque, ajout + marque, 1), encoding='utf-8')

# ---------------------------------------------------------------- partie 7 : « Aucun » = le creux du cas A est laissé tel quel
patch('gen_partie7.py', [
    ("OPTA = C.options_correctives('A')\n", "OPTA = C.options_correctives('A')\nRA = C.reprise('A')\n"),
    ("""Le cas A passe brièvement sous zéro : point bas de {mm(A['mini'])} au mois {A['mois_mini']}, soit {A['tres_neg']} mois de
      trésorerie négative, puis {mm(A['fin'])} au mois 36 ; flux stable dès le mois {A['stable']}. Ce creux tient aux trackers
      GPS (8.4) : sans eux, le cas A aurait un point bas de {mm(C.sans_tracker('A')['mini'])}. Il se comble par un solde des
      véhicules sur 21 mois ({mm(OPTA['solde_21'])} au point bas), par un solde sur 24 mois ({mm(OPTA['solde_24'])}) ou par une
      levée de {mm(OPTA['levee_mini'] + 50_000, 1, False)} FCFA.</span>""",
     """Le cas A passe brièvement sous zéro : point bas de {mm(A['mini'])} au mois {A['mois_mini']}, négatif pendant
      {A['tres_neg']} mois (mois {RA['neg'][0]} à {RA['neg'][-1]}). Il remonte ensuite à {mm(RA['t_premier'])} au mois {RA['premier']},
      {mm(RA['t24'])} au mois 24, {mm(RA['t30'])} au mois 30 et {mm(RA['t36'])} au mois 36, soit environ
      {mm(RA['moyen'], 2, False)} par mois. Le creux tombe au mois {A['mois_mini']}, quand le renouvellement des trackers du
      second lot ({n(RA['trk_creux'])} F) s’ajoute aux mensualités de la flotte ; sans trackers GPS (8.4), le point bas du cas A
      serait de {mm(C.sans_tracker('A')['mini'])}. Le plan l’assume : aucun réglage ne le comble.</span>"""),
    ("qu’un solde sur 21 ou 24 mois comble. Le scénario prudent", "que le plan assume. Le scénario prudent"),
])

# ---------------------------------------------------------------- partie 8
patch('gen_partie8.py', [
    ("OPTA = C.options_correctives('A')\n", "OPTA = C.options_correctives('A')\nRA = C.reprise('A')\n"),
    ("Ils laissent une réserve, mesurée au point bas de trésorerie.</p>",
     "Ils laissent une réserve dans le cas B et un léger creux dans le cas A, mesurés au point bas de trésorerie.</p>"),
    ("    tot = M.LEVEE\n    segs = [", "    segs = ["),
    ("    out = '<div class=\"bar4\">'\n    for cl, nom, v in segs:",
     "    tot = max(M.LEVEE, sum(v for _, _, v in segs))              # au-delà de la levée : le creux dépasse 100 %\n    out = '<div class=\"bar4\">'\n    for cl, nom, v in segs:"),
    ("<div class=\"bar-label\">Cas A <small>réserve au point bas : {mm(UA['reserve'], 1, False)}</small></div>",
     "<div class=\"bar-label\">Cas A <small>{lib_bas(UA)}</small></div>"),
    ("<div class=\"bar-label\">Cas B <small>réserve au point bas : {mm(UB['reserve'], 1, False)}</small></div>",
     "<div class=\"bar-label\">Cas B <small>{lib_bas(UB)}</small></div>"),
    ("def barre(u):", "def lib_bas(u):\n    return (f\"réserve au point bas : {mm(u['reserve'], 1, False)}\" if u['reserve'] >= 0\n            else f\"creux au point bas : {mm(u['reserve'], 1)} (au-delà de la levée)\")\n\n\ndef barre(u):"),
    ("""Dans le cas A, le point
        bas est de {mm(SA['mini'])} au mois {SA['mois_mini']} : un creux de {SA['tres_neg']} mois, que quatre
        ajustements comblent (voir ci-dessous). Le scénario prudent n’est couvert dans aucun des deux cas.""",
     """Dans le cas A, le point
        bas est de {mm(SA['mini'])} au mois {SA['mois_mini']} : un creux de {SA['tres_neg']} mois, laissé tel quel dans
        le plan, puis la trésorerie remonte à {mm(SA['fin'], 1, False)} au mois 36. Le scénario prudent n’est couvert
        dans aucun des deux cas."""),
    ("""    <strong>Combler le creux du cas A.</strong> Quatre ajustements rétablissent une trésorerie jamais négative :
    solde des véhicules sur 21 mois (point bas {mm(OPTA['solde_21'])}) ou 24 mois ({mm(OPTA['solde_24'])}) ;
    levée portée à 15,5 M FCFA ({mm(OPTA['levee_15_5'])}) ; ou tracker de l’année 1 seul à la charge de TamCar. La
    levée minimale qui couvre le cas A est d’environ {mm(OPTA['levee_mini'], 2, False)} FCFA.""",
     """    <strong>Après le creux du cas A.</strong> Le point bas ({mm(SA['mini'])}, mois {SA['mois_mini']}) représente
    {pct(100 * abs(SA['mini']) / M.LEVEE, 1)} de la levée. La trésorerie redevient positive au mois {RA['premier']}
    ({mm(RA['t_premier'])}), atteint {mm(RA['t24'])} au mois 24, {mm(RA['t30'])} au mois 30 et {mm(RA['t36'])} au mois 36,
    soit environ {mm(RA['moyen'], 2, False)} par mois à régime établi. Le plan laisse ce creux tel quel."""),
])
print('ok')
