"""Tous les chiffres des parties 5 à 8, calculés à partir du modèle de trésorerie.
Aucun montant n'est saisi à la main dans les pages générées : on change une hypothèse dans
modele_tresorerie.py (ou ici : CESSION_MOTO) puis on relance `python build.py`.
"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import modele_tresorerie as M

CESSION_MOTO = 24
FACS = {'prudent': 7 / 9, 'base': 1.0, 'ambitieux': 12 / 9}
CASES = ('A', 'B')
MOTOS = 5
PHASES = [(1, 6, 'Mois 1 à 6', 'lancement, premier lot seul'),
          (7, 12, 'Mois 7 à 12', 'deux lots, ouverture de Parakou'),
          (13, 24, 'Mois 13 à 24', 'développeur rémunéré, flotte en remboursement'),
          (25, 36, 'Mois 25 à 36', 'flotte payée')]


# ------------------------------------------------------------------ mise en forme
def n(v):
    """1 234 567 (espaces simples : la typographie du build met les espaces fines)."""
    return f"{round(v):,}".replace(',', ' ').replace('-', '−')


def sg(v):
    """+ 1 234 567 / − 1 234 567"""
    return ('+ ' if v >= 0 else '− ') + f"{abs(round(v)):,}".replace(',', ' ')


def mm(v, d=1, signe=True):
    """en millions : +1,9 M / −2,7 M"""
    s = f"{abs(v) / 1e6:.{d}f}".replace('.', ',')
    if not signe:
        return f"{s} M"
    return ('+' if v >= 0 else '−') + f"{s} M"


def pct(v, d=1):
    return f"{v:.{d}f}".replace('.', ',') + ' %'


# ------------------------------------------------------------------ simulations
_cache = {}


def run(cas, sc='base'):
    cle = (cas, sc)
    if cle not in _cache:
        _cache[cle] = M.simuler_cas(cas, FACS[sc], CESSION_MOTO)
    return _cache[cle]


def capex_total():
    return sum(M.CAPEX_M0.values()) + sum(M.CAPEX_LOT2.values())


def flotte_detail(cas):
    """{mois: (avance, mensualité)} — mêmes règles que simuler_cas."""
    out = {}
    for g in M.CAS[cas]:
        t = M.TYPES[g['type']]
        out.setdefault(g['debut'] - 1, [0, 0])[0] += g['n'] * t['prix'] * 0.30
        for k in range(18):
            out.setdefault(g['debut'] + k, [0, 0])[1] += g['n'] * t['prix'] * 0.70 / 18
    return out


def synthese(cas, sc='base'):
    L = run(cas, sc)
    c = [l['tresorerie'] for l in L]
    stable = next((k for k in range(1, 37) if all(l['flux'] >= 0 for l in L[k:])), None)
    return dict(
        mini=min(c), mois_mini=c.index(min(c)), fin=c[-1],
        mois_neg=sum(1 for l in L if l['m'] >= 1 and l['flux'] < 0), stable=stable,
        tres_neg=sum(1 for x in c if x < 0),
        rec_ops=sum(l['rec_ops'] for l in L), fonds=sum(l['cession'] for l in L),
        charges=sum(l['charges'] for l in L), flotte=-sum(l['flotte'] for l in L),
        rec_mois_an1=L[10]['rec_ops'],
        cats={k: sum(l[k] for l in L) for k in ('c_equipe', 'c_locaux', 'c_assur', 'c_presta', 'c_tracker', 'c_anatt', 'c_impots')},
    )


def phases(cas, sc='base'):
    L = run(cas, sc)
    det = flotte_detail(cas)
    res = []
    for a, b, nom, sous in PHASES:
        mois = range(a, b + 1)
        k = len(mois)
        res.append(dict(
            nom=nom, sous=sous,
            rec=sum(L[m]['rec_ops'] + L[m]['cession'] for m in mois) / k,
            equipe=sum(L[m]['c_equipe'] for m in mois) / k, locaux=sum(L[m]['c_locaux'] for m in mois) / k,
            assur=sum(L[m]['c_assur'] for m in mois) / k, presta=sum(L[m]['c_presta'] for m in mois) / k,
            tracker=sum(L[m]['c_tracker'] for m in mois) / k, anatt=sum(L[m]['c_anatt'] for m in mois) / k, impots=sum(L[m]['c_impots'] for m in mois) / k,
            charges=sum(L[m]['charges'] for m in mois) / k,
            mens=sum(det.get(m, (0, 0))[1] for m in mois) / k,
            avances=sum(det.get(m, (0, 0))[0] for m in mois),
            flux=sum(L[m]['flux'] for m in mois) / k,
        ))
    return res


def plan_financement(cas, mois, sc='base'):
    """Emplois et ressources cumulés jusqu'au mois `mois` (inclus)."""
    L = run(cas, sc)
    det = flotte_detail(cas)
    invest = sum(M.CAPEX_M0.values()) + (sum(M.CAPEX_LOT2.values()) if mois >= 6 else 0)
    avances = sum(det.get(m, (0, 0))[0] for m in range(0, mois + 1))
    mens = sum(det.get(m, (0, 0))[1] for m in range(0, mois + 1))
    charges = sum(L[m]['charges'] for m in range(1, mois + 1))
    rec = sum(L[m]['rec_ops'] for m in range(1, mois + 1))
    fonds = sum(L[m]['cession'] for m in range(1, mois + 1))
    emplois = invest + avances + mens + charges
    ressources = M.LEVEE + rec + fonds
    return dict(invest=invest, avances=avances, mens=mens, charges=charges, emplois=emplois,
                levee=M.LEVEE, rec=rec, fonds=fonds, ressources=ressources,
                solde=ressources - emplois, verif=L[mois]['tresorerie'])


def dette_fournisseur(cas):
    """Solde restant dû au fournisseur (mensualités à venir) à la fin de chaque mois."""
    res = {}
    for m in range(0, 37):
        total = 0
        for g in M.CAS[cas]:
            solde = g['n'] * M.TYPES[g['type']]['prix'] * 0.70
            if m >= g['debut'] - 1:                        # le lot est commandé : le solde est dû
                payees = max(0, min(18, m - g['debut'] + 1))
                total += solde * (1 - payees / 18)
        res[m] = total
    return res


def vehicules(cas):
    tri = sum(g['n'] for g in M.CAS[cas] if g['type'] == 'tri')
    mot = sum(g['n'] for g in M.CAS[cas] if g['type'] == 'moto')
    valeur = sum(g['n'] * M.TYPES[g['type']]['prix'] for g in M.CAS[cas])
    return tri, mot, valeur


def ro_variable_mensuel(cas):
    """Rémunération variable des responsables (3 % du volume, base, régime établi)."""
    vol_cotonou = 5 * 9000 * 26 + (MOTOS * 4500 * 26 if cas == 'B' else 0)
    vol_parakou = 5 * 9000 * 26
    return min(0.03 * vol_cotonou, 150_000), min(0.03 * vol_parakou, 150_000)


def seuil(cas):
    return M.seuil_resistance(cas, CESSION_MOTO if cas == 'B' else None)


def moto_stress(cf):
    """Cas B, tricycles à 100 %, motos à cf % de l'objectif."""
    L = M.simuler_cas('B', {'tri': 1.0, 'moto': cf}, CESSION_MOTO)
    c = [l['tresorerie'] for l in L]
    return min(c), c.index(min(c)), c[-1]


def tracker_annuel(cas):
    """Coût des trackers payé pendant chacune des trois années, scénario de base."""
    L = run(cas)
    return [sum(L[m]['c_tracker'] for m in range(a, a + 12)) for a in (1, 13, 25)]


def tracker_par_vehicule():
    """Coût d'un tracker sur la période de détention par TamCar (tricycle 36 mois, moto 24 mois)."""
    t = M.TRACKER_ANATT
    tri = t['tri'][0] + 2 * t['tri'][1]
    moto = t['moto'][0] + 1 * t['moto'][1]
    return tri, moto


def sans_tracker(cas, sc='base'):
    L = M.simuler_cas(cas, FACS[sc], CESSION_MOTO, tracker=None)
    c = [l['tresorerie'] for l in L]
    return dict(mini=min(c), mois_mini=c.index(min(c)), fin=c[-1])


def options_correctives(cas='A'):
    """Ce qui rétablit une trésorerie jamais négative pour le cas `cas` (scénario de base)."""
    res = {}
    for nom, kw in (('solde_21', dict(mensualites=21)), ('solde_24', dict(mensualites=24)),
                    ('levee_15_5', dict(levee=15_500_000)), ('levee_16', dict(levee=16_000_000))):
        L = M.simuler_cas(cas, 1.0, CESSION_MOTO if cas == 'B' else None, **kw)
        res[nom] = min(l['tresorerie'] for l in L)
    mini = synthese(cas)['mini']
    res['levee_mini'] = M.LEVEE - min(0, mini)
    return res


def plages(mois):
    """[17, 18, 19, 22] -> 'mois 17 à 19, puis mois 22'"""
    if not mois:
        return ''
    bl, cur = [], [mois[0], mois[0]]
    for m in mois[1:]:
        if m == cur[1] + 1:
            cur[1] = m
        else:
            bl.append(cur); cur = [m, m]
    bl.append(cur)
    return ', puis '.join(f"mois {a} à {b}" if b > a else f"mois {a}" for a, b in bl)


def reprise(cas='A', sc='base'):
    """Creux de trésorerie et remontée qui suit (scénario de base par défaut)."""
    L = run(cas, sc)
    c = [l['tresorerie'] for l in L]
    neg = [m for m in range(37) if c[m] < 0]
    mm_ = c.index(min(c))
    prem = neg[-1] + 1 if neg else None                     # premier mois à partir duquel la trésorerie reste positive
    return dict(neg=neg, txt=plages(neg), premier=prem, t_premier=c[prem] if neg else None, t24=c[24], t30=c[30], t36=c[36],
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


def tiers_k_min(m0, cas='A', sc='base'):
    """Plus petit nombre de tricycles de concessionnaires (Cotonou, entrés au mois m0) qui suppriment tout mois négatif."""
    for k in range(1, 60):
        groupes = M.CAS[cas] + [dict(type='tri_t', n=k, debut=m0, ville='Cotonou')]
        L = M.simuler_cas(groupes, FACS[sc], CESSION_MOTO if cas == 'B' else None)
        if min(l['tresorerie'] for l in L) >= 0:
            return k
    return None


def _test_groupes(groupes, levee, f=1.0):
    L = M.simuler_cas(groupes, f, CESSION_MOTO, levee=levee)
    c = [l['tresorerie'] for l in L]
    return dict(mini=min(c), mois=c.index(min(c)), fin=c[-1], neg=sum(1 for x in c if x < 0))


def adapter_levee(levee, flotte_propre):
    """Levée réduite : mêmes charges, flotte propre donnée, plus le plus petit nombre de tricycles de concessionnaires
    (Cotonou, dès le mois 1) qui évite tout mois de trésorerie négative. Renvoie aussi le prudent, la moitié des tiers
    et le plan inchangé (cas A) sans adaptation."""
    def tiers(k):
        return [dict(type='tri_t', n=k, debut=1, ville='Cotonou')] if k else []
    k = next(k for k in range(0, 80) if (lambda r: r['neg'] == 0 and r['mini'] >= 0)(_test_groupes(flotte_propre + tiers(k), levee)))
    g = flotte_propre + tiers(k)
    return dict(k=k, groupes=g, base=_test_groupes(g, levee), prudent=_test_groupes(g, levee, FACS['prudent']),
                moitie=_test_groupes(flotte_propre + tiers(max(1, k // 2)), levee),
                brut=_test_groupes(M.CAS['A'], levee),
                m0=sum(M.CAPEX_M0.values()) + sum(gr['n'] * M.TYPES[gr['type']]['prix'] * 0.30 for gr in flotte_propre if gr['debut'] == 1))


def tri_entres(k):
    """2 -> 'deux tricycles entrés'"""
    return mots_tri(k) + (' entré' if k == 1 else ' entrés')


def mots_tri(k):
    """1 -> 'un tricycle', 2 -> 'deux tricycles'"""
    return {1: 'un', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq'}.get(k, str(k)) + (' tricycle' if k == 1 else ' tricycles')


def vehicule_marginal(type_, m0=1, ville='Cotonou', f=1.0, **kw):
    """Ce que rapporte et coûte UN véhicule de plus (hors effet de plafond RO), sur 36 mois, par différence avec le cas A.
    f : niveau d'activité du seul véhicule ajouté (1.0 = objectif)."""
    g = dict(type=type_, n=1, debut=m0, ville=ville)
    L0 = M.simuler_cas(M.CAS['A'], 1.0, CESSION_MOTO)
    L1 = M.simuler_cas(M.CAS['A'] + [g], 1.0, CESSION_MOTO, modul=(lambda gg, m: f if gg is g else 1.0), **kw)
    d = lambda k: sum(l[k] for l in L1) - sum(l[k] for l in L0)
    achat = -(sum(l['flotte'] for l in L1) - sum(l['flotte'] for l in L0))
    rec = d('rec_ops') + d('cession')
    charges = d('charges')
    adr = sum(l['tresorerie'] - 0 for l in L1[-1:]) - sum(l['tresorerie'] for l in L0[-1:])   # effet total sur la trésorerie au mois 36
    net = L1[-1]['tresorerie'] - L0[-1]['tresorerie']
    return dict(rec=rec, charges=charges, achat=achat, net=net, entree=net - (rec - charges - achat))


def tiers_effet(k, m0, cas='A', type_='tri_t', **kw):
    """Cas de référence + k véhicules de tiers à Cotonou entrés au mois m0 : (point bas, mois, mois 36, mois négatifs)."""
    groupes = M.CAS[cas] + [dict(type=type_, n=k, debut=m0, ville='Cotonou')]
    L = M.simuler_cas(groupes, 1.0, CESSION_MOTO if cas == 'B' else None, **kw)
    c = [l['tresorerie'] for l in L]
    return min(c), c.index(min(c)), c[-1], sum(1 for x in c if x < 0)


if __name__ == '__main__':
    for cas in CASES:
        print('=== cas', cas)
        for sc in FACS:
            s = synthese(cas, sc)
            print(f"  {sc:9s} min {n(s['mini']):>12} (M{s['mois_mini']:>2}) fin {n(s['fin']):>12} mois flux<0 {s['mois_neg']:>2} stable dès M{s['stable']} | rec {n(s['rec_ops'])} fonds {n(s['fonds'])} charges {n(s['charges'])} flotte {n(s['flotte'])} | rec/mois an1 {n(s['rec_mois_an1'])}")
        for p in phases(cas):
            print(f"  {p['nom']:14s} rec {n(p['rec']):>10} charges {n(p['charges']):>10} (équipe {n(p['equipe'])}, locaux {n(p['locaux'])}, assur {n(p['assur'])}, presta {n(p['presta'])}) mens {n(p['mens']):>9} avances {n(p['avances']):>10} flux {n(p['flux']):>10}")
        for mo in (0, 12, 24, 36):
            pf = plan_financement(cas, mo)
            print(f"  M{mo:>2} emplois {n(pf['emplois']):>12} (inv {n(pf['invest'])}, avances {n(pf['avances'])}, mens {n(pf['mens'])}, charges {n(pf['charges'])}) ressources {n(pf['ressources']):>12} solde {n(pf['solde'])} vérif {n(pf['verif'])}")
        dd = dette_fournisseur(cas)
        pic = max(dd.values()); mp = [m for m, v in dd.items() if v == pic][0]
        print('  dette fournisseur : pic', n(pic), 'au mois', mp, '; M12', n(dd[12]), '; M24', n(dd[24]), '; M36', n(dd[36]))
        print('  seuil de résistance', pct(seuil(cas)), '; véhicules', vehicules(cas), '; RO variable', [n(x) for x in ro_variable_mensuel(cas)])
    for cf in (1.0, 0.5, 0.34, 0.0):
        mi, mo, fi = moto_stress(cf)
        print(f"  test moto à {int(cf * 100)} % : min {n(mi)} (M{mo}) fin {n(fi)}")
