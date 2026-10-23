"""Génère partie2b.html : page 2.10 « Valorisation de la plateforme et répartition du capital ».
Méthode A : heures réellement travaillées par le fondateur × tarif horaire senior local.
Méthode B : coût de reconstruction à périmètre connu.
Méthode C : valeur actualisée des revenus de TamCar sur 36 mois (flotte de départ du plan v6).
Le périmètre actuel est lu dans le dépôt à chaque build."""
import glob
import os
import pathlib
import re

import chiffres as C
import modele_v6 as M

ICI = pathlib.Path(__file__).parent
DEPOT = ICI.parent
n, pct = C.n, C.pct


# ------------------------------------------------------------------ périmètre actuel (dépôt)
def lignes(dossier, exts):
    tot = 0
    for racine, dirs, fichiers in os.walk(DEPOT / dossier):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', 'android', 'www', '.git')]
        for f in fichiers:
            if f.endswith(exts):
                tot += sum(1 for _ in open(os.path.join(racine, f), encoding='utf-8', errors='ignore'))
    return tot


def ecrans(dossier):
    return sum(1 for r, d, f in os.walk(DEPOT / dossier) for x in f if x == 'page.tsx')


sql = ''.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(str(DEPOT / 'backend/supabase/migrations/*.sql'))))
sql = re.sub(r'--[^\n]*', '', sql)
tables = set(re.findall(r'create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)', sql, re.I)) - \
    set(re.findall(r'drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)', sql, re.I))
vues = set(re.findall(r'create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?(\w+)', sql, re.I))
funcs = set(re.findall(r'create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(', sql, re.I))
metier = len([f for f in funcs if not f.startswith('_')])
ECR = sum(ecrans(f'apps/{a}/src') for a in ('client', 'driver-portal', 'back-office', 'web'))
TS = sum(lignes(f'apps/{a}/src', ('.ts', '.tsx')) for a in ('client', 'driver-portal', 'back-office', 'web'))
SQL_L = lignes('backend/supabase/migrations', ('.sql',))


def arrondi(v, pas=1000):
    return f"{round(v / pas) * pas:,}".replace(',', ' ')


# ------------------------------------------------------------------ calcul de la répartition
INVEST = 15_000_000
PART_INVEST = 0.40
TOTAL = INVEST / PART_INVEST                 # valeur totale des apports
APPORT = TOTAL * (1 - PART_INVEST)           # valeur de la plateforme nécessaire pour 60 %

HEURES = 2_000                               # heures travaillées par le fondateur depuis novembre 2025
TARIF = 25_000                               # FCFA par heure : développeur senior, tarif local
HEURES_REPRO = 800                           # reconstruction à périmètre connu : 40 % du temps historique
A = HEURES * TARIF
B = HEURES_REPRO * TARIF
CVAL = round(M.valeur_usage(), -5)   # revenus de TamCar sur 36 mois, flotte de départ sans véhicule de tiers, actualisés à 20 %, arrondis à 100 000 F

METHODES = [
    ('A · Coût historique', f'{n(HEURES)} heures de travail depuis novembre 2025 × {n(TARIF)} F de l’heure (développeur senior, tarif local)', A),
    ('B · Coût de reproduction', f'{n(HEURES_REPRO)} heures pour reconstruire à périmètre connu (40 % du temps historique) × {n(TARIF)} F', B),
    ('C · Valeur d’usage', 'revenus de TamCar sur 36 mois (flotte de départ du plan), actualisés à 20 %', CVAL),
]


def part(v):
    return 100 * v / (v + INVEST)


def tr(*cells, cls=''):
    return f'<tr{" class=" + chr(34) + cls + chr(34) if cls else ""}>' + ''.join(f'<td>{c}</td>' for c in cells) + '</tr>'


lignes_m = ''
for nom, principe, v in METHODES:
    lignes_m += tr(f'<strong>{nom}</strong><small>{principe}</small>', f'{n(v)} F', pct(part(v), 1))
lignes_m += tr('<strong>Valeur nécessaire pour 60 / 40</strong><small>15 M ÷ 40 % × 60 %</small>', f'<strong>{n(APPORT)} F</strong>', f'<strong>{pct(part(APPORT), 1)}</strong>', cls='cle')

html = f'''<!-- ============================================================ 02 · 2.10 valorisation -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">02</span><h1>Présentation générale du projet <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">2.10 · Valorisation de la plateforme et répartition du capital</div>
  <p class="intro">La répartition proposée, <strong>60 % pour BENAEL, société du fondateur</strong> et <strong>40 % pour l’investisseur</strong>, suppose que l’apport en nature de la plateforme soit évalué à un montant suffisant. Cette page montre le calcul et ce qui le justifie.</p>

  <div class="row c-3" style="margin-top:8px">
    <div class="kpi"><b>{n(INVEST)} F</b><span>versés en numéraire</span><small>par l’investisseur, pour 40 % des parts</small></div>
    <div class="kpi"><b>{n(TOTAL)} F</b><span>valeur totale des apports</span><small>15 000 000 F ÷ 40 %</small></div>
    <div class="kpi"><b>{n(APPORT)} F</b><span>valeur de la plateforme</span><small>nécessaire pour 60 % : 37 500 000 F × 60 %</small></div>
  </div>

  <div class="rule-label" style="margin-top:16px">Trois méthodes d’évaluation</div>
  <table class="tbl" style="margin-top:8px">
    <colgroup><col style="width:58%"><col style="width:21%"><col style="width:21%"></colgroup>
    <thead><tr><th>Méthode</th><th>Valeur de la plateforme</th><th>Part de BENAEL si retenue</th></tr></thead>
    <tbody>
      {lignes_m}
    </tbody>
  </table>

  <div class="callout" style="margin-top:12px">
    <strong>Lecture.</strong> Part de BENAEL = valeur ÷ (valeur + 15 000 000 F). La valeur nécessaire pour 60 % ({n(APPORT)} F) représente
    <strong>{pct(100 * APPORT / A, 0)} du coût historique</strong> : le fondateur a travaillé environ <strong>{n(HEURES)} heures</strong> sur la plateforme, soit {n(A)} F au tarif retenu.
    Elle dépasse le coût de reproduction ({n(B)} F) et reste sous la valeur d’usage ({n(CVAL)} F).
  </div>

  <div class="rule-label" style="margin-top:16px">Ce que la plateforme contient au 20 octobre 2026</div>
  <table class="tbl txt" style="margin-top:8px">
    <colgroup><col style="width:24%"><col style="width:76%"></colgroup>
    <thead><tr><th>Périmètre</th><th>Contenu</th></tr></thead>
    <tbody>
      {tr('Applications', '4 applications web (passagers, chauffeurs, TamCar Office, site vitrine) et 2 coques Android')}
      {tr('Écrans', f'{ECR} écrans')}
      {tr('Code', f'environ {arrondi(TS)} lignes de TypeScript et {arrondi(SQL_L)} lignes de SQL de migration')}
      {tr('Base de données', f'{len(tables)} tables, {len(vues)} vues, {metier} fonctions métier')}
      {tr('Modules', 'commande immédiate et à l’avance, tarification, TamPass, portefeuilles, TamAssur, recrutement des chauffeurs, TamCar Office (comptabilité, trésorerie, paie), lecture de justificatifs par IA, bot WhatsApp Tamy')}
    </tbody>
  </table>

  <div class="row c-1-1 stretch" style="margin-top:12px">
    <div class="callout">
      <strong>Dépenses et valeur.</strong> Les 4 000 000 F cités en 2.1 sont les dépenses engagées en numéraire. Les {n(HEURES)} heures du fondateur n’ont pas été payées : elles font la valeur de l’apport, avec la marque et le savoir-faire. Le fondateur les cède à BENAEL, qui apporte la plateforme (liste fermée en annexe du dossier d’évaluation).
    </div>
    <div class="callout violet">
      <strong>Un commissaire aux apports tranche.</strong> Il est désigné lorsque l’apport dépasse 5 000 000 F ou la moitié du capital (art. 312 de l’Acte uniforme) : ici, les deux.
      Le forfait de 1 500 000 F (2.3) couvre l’évaluation ; la valeur finale est celle qu’il arrête.
    </div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
'''
(ICI / 'partie2b.html').write_text(html, encoding='utf-8')
print('partie2b.html : 1 page')
