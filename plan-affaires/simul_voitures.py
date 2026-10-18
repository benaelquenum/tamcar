import sys
sys.path.insert(0, r'D:\TERENCE\TamCar\App\plan-affaires')
import modele_tresorerie as M

# Voitures d'Afrik Group Consulting = véhicules de tiers (concessionnaire) : 23 % puis 22 % du volume, 20 % après cession,
# aucun achat, aucune assurance, tracker à la charge du propriétaire (hypothèse), avance de démarrage 100 000 F/voiture
# remboursée à M+12. Objectif 15 000 F/jour. Cession 24 mois (voiture d'occasion).
M.TYPES['voit_t'] = dict(prix=0, objectif=15000, assurance_an=0, cession=24, tiers=True, adr=100_000)
g = M._g

A = M.CAS['A']
B = M.CAS['B']
V = [g('voit_t', 10, 1, 'Cotonou')]
CAS = {
    'A': A,
    'B': B,
    'A + 10 voitures': A + V,
    'B + 10 voitures': B + V,
}


def fmt(v):
    return f"{v:,.0f}".replace(',', ' ')


def resume(nom, groupes, fac):
    L = M.simuler_cas(groupes, fac)
    bas = min(L, key=lambda l: l['tresorerie'])
    neg = [l['m'] for l in L if l['tresorerie'] < 0]
    rec = sum(l['rec_ops'] for l in L)
    return dict(nom=nom, bas=bas['tresorerie'], mois_bas=bas['m'], fin=L[-1]['tresorerie'], nneg=len(neg),
                premier=neg[0] if neg else None, rec=rec, ro=sum(l['c_equipe'] for l in L))


for label, fac in (('PRUDENT 7000/9000', 7 / 9), ('BASE', 1.0), ('AMBITIEUX 12000/9000', 12 / 9)):
    print(f"\n=== {label} ===")
    for nom, grp in CAS.items():
        f = fac if not isinstance(fac, dict) else fac
        # facteur uniforme sur tous les types, voitures comprises
        if nom.endswith('voitures'):
            f = {'tri': fac, 'moto': fac, 'voit_t': fac}
        r = resume(nom, grp, f)
        print(f"{nom:18s} point bas {fmt(r['bas']):>12} (M{r['mois_bas']:>2})  M36 {fmt(r['fin']):>12}  mois neg {r['nneg']:>2}"
              f"  premier neg {r['premier']}  recettes ops {fmt(r['rec'])}")

print('\n=== Seuil de résistance uniforme (part de l\'objectif pour ne jamais être négatif) ===')
for nom, grp in CAS.items():
    lo, hi = 0.2, 1.4
    for _ in range(40):
        mid = (lo + hi) / 2
        f = {'tri': mid, 'moto': mid, 'voit_t': mid}
        if min(l['tresorerie'] for l in M.simuler_cas(grp, f)) >= 0:
            hi = mid
        else:
            lo = mid
    print(f"{nom:18s} {100 * hi:5.1f} %")

print('\n=== Sensibilité : seules les voitures sous-performent (tricycles et motos à 100 %) ===')
for nom in ('A + 10 voitures', 'B + 10 voitures'):
    for fv in (1.0, 0.8, 0.6, 0.4, 0.2, 0.0):
        r = resume(nom, CAS[nom], {'voit_t': fv})
        print(f"{nom:18s} voitures à {int(fv * 100):>3} % : point bas {fmt(r['bas']):>12} (M{r['mois_bas']:>2})  M36 {fmt(r['fin']):>12}  mois neg {r['nneg']}")

print('\n=== Détail Cotonou : coût RO (plafond) ===')
for nom in ('B', 'B + 10 voitures'):
    L = M.simuler_cas(CAS[nom], 1.0)
    print(nom, 'équipe M2', fmt(L[2]['c_equipe']), 'M12', fmt(L[12]['c_equipe']), 'M24', fmt(L[24]['c_equipe']))

print('\n=== Contribution des 10 voitures seules (revenus de TamCar, base) ===')
Lb = M.simuler_cas(B, 1.0)
Lv = M.simuler_cas(B + V, 1.0)
print('revenus ops cumulés 36 mois, B :', fmt(sum(l['rec_ops'] for l in Lb)), ' B+voitures :', fmt(sum(l['rec_ops'] for l in Lv)),
      ' écart :', fmt(sum(l['rec_ops'] for l in Lv) - sum(l['rec_ops'] for l in Lb)))
print('charges cumulées B :', fmt(sum(l['charges'] for l in Lb)), ' B+voitures :', fmt(sum(l['charges'] for l in Lv)))
for m in (1, 2, 6, 12, 13, 24, 25, 36):
    print(f"M{m:>2}  B flux {fmt(Lb[m]['flux']):>10}  B+V flux {fmt(Lv[m]['flux']):>10}  écart {fmt(Lv[m]['flux'] - Lb[m]['flux']):>9}  tréso B {fmt(Lb[m]['tresorerie']):>11}  tréso B+V {fmt(Lv[m]['tresorerie']):>11}")
