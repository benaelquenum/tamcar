import sys
sys.path.insert(0, r'D:\TERENCE\TamCar\App\plan-affaires')
import modele_tresorerie as M

M.TYPES['voit_t'] = dict(prix=0, objectif=15000, assurance_an=0, cession=24, tiers=True, adr=100_000)
g = M._g
V = [g('voit_t', 10, 1, 'Cotonou')]
tri_cot = [g('tri', 5, 1, 'Cotonou')]
tri_par = [g('tri', 5, 7, 'Parakou')]
moto = [g('moto', 5, 1, 'Cotonou')]


def fmt(v):
    return f"{v:,.0f}".replace(',', ' ')


def ligne(nom, grp, fac):
    L = M.simuler_cas(grp, fac)
    bas = min(L, key=lambda l: l['tresorerie'])
    neg = [l['m'] for l in L if l['tresorerie'] < 0]
    achats = -sum(l['flotte'] for l in L)
    print(f"{nom:44s} point bas {fmt(bas['tresorerie']):>12} (M{bas['m']:>2})  M36 {fmt(L[-1]['tresorerie']):>12}  mois neg {len(neg):>2}  achats flotte {fmt(achats):>11}")


for label, f in (('BASE', 1.0), ('PRUDENT (7/9)', 7 / 9)):
    print(f"\n=== {label} ===")
    fac = {'tri': f, 'moto': f, 'voit_t': f}
    ligne('10 voitures seules (aucun achat)', V, fac)
    ligne('10 voitures + 5 tricycles Cotonou', V + tri_cot, fac)
    ligne('10 voitures + 5 motos', V + moto, fac)
    ligne('10 voitures + 10 tricycles (cas A)', M.CAS['A'] + V, fac)
    ligne('10 voitures + cas B (10 tri + 5 motos)', M.CAS['B'] + V, fac)

print('\n=== Si la voiture ne rapporte que 20 % (pas de poche de rachat, aucune cession) — cas B + 10 voitures ===')
old = (M.PART_TIERS_AN1, M.PART_TIERS_APRES)
M.PART_TIERS_AN1 = M.PART_TIERS_APRES = 0.20
for label, f in (('BASE', 1.0), ('PRUDENT (7/9)', 7 / 9)):
    ligne(f'B + 10 voitures à 20 % ({label})', M.CAS['B'] + V, {'tri': f, 'moto': f, 'voit_t': f})
M.PART_TIERS_AN1, M.PART_TIERS_APRES = old

print('\n=== Revenu mensuel de TamCar par voiture à l objectif ===')
vol = 15000 * 26
print('volume mensuel par voiture', fmt(vol), ' TamCar an1 23 %', fmt(vol * 0.23), ' an2 22 %', fmt(vol * 0.22), ' après cession 20 %', fmt(vol * 0.20))
print('propriétaire (30 %)', fmt(vol * 0.30), ' chauffeur cash (40 %)', fmt(vol * 0.40), ' fonds de rachat chauffeur (10 %)', fmt(vol * 0.10))
print('10 voitures : propriétaire par mois', fmt(10 * vol * 0.30), ' TamCar an1', fmt(10 * vol * 0.23))
