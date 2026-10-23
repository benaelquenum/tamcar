"""Dossier d'évaluation IP, version 2.0 (23 octobre 2026) : BENAEL apporte la plateforme à Tam Logistics SARL.

Reprend le gabarit (CSS) de la version 1.0 archivée dans archives/2026-10-23_dossier_IP_v1/ ; les chiffres sont ceux du plan v6
(page 2.10 : 2 000 h × 25 000 F, 800 h × 25 000 F, valeur d'usage actualisée, 22,5 M nécessaires pour 60 / 40) ;
le périmètre est la liste fermée de l'annexe 1.  Sortie : ../TamCar_dossier_evaluation_IP.html
"""
import pathlib
import re

ICI = pathlib.Path(__file__).parent
DEPOT = ICI.parent
V1 = DEPOT / 'archives' / '2026-10-23_dossier_IP_v1' / 'TamCar_dossier_evaluation_IP.html'
SORTIE = DEPOT / 'TamCar_dossier_evaluation_IP.html'

v1 = V1.read_text(encoding='utf-8')
tete = v1[:v1.index('<body>') + len('<body>')]
tete = tete.replace("<title>TamCar — Dossier d'évaluation IP pour Commissaire aux Apports</title>",
                    "<title>TamCar — Dossier d'évaluation IP pour Commissaire aux Apports (V2.0)</title>")

# comparables sectoriels : tableau et note conservés de la version 1 (mis à jour le 21 octobre avec 4U, INAS Travel et inDrive)
m = re.search(r'(<h2>Comparables sectoriels</h2>.*?</table>\s*<p class="small muted"[^>]*>.*?</p>)', v1, re.S)
assert m, 'bloc comparables introuvable'
COMPARABLES = m.group(1).replace('<h2>Comparables sectoriels</h2>', '<h2 style="break-before: page">Comparables sectoriels</h2>')

TOTAL = 11
FOOT = '''  <div class="page-footer">
    <div>TamCar — Dossier d'évaluation IP</div>
    <div>Confidentiel · Page {n} / ''' + str(TOTAL) + '''</div>
  </div>
</div>
'''


def entete(num, titre, sous):
    return f'''<div class="page">
  <div class="section-hd">
    <div class="section-num">{num}</div>
    <div>
      <div class="section-name">{titre}</div>
      <div class="section-sub">{sous}</div>
    </div>
  </div>
'''


PAGES = []

# ------------------------------------------------------------------ 1 · couverture
PAGES.append('''<div class="page cover">
  <div class="cover-mark">Dossier confidentiel · Évaluation d'apport en nature</div>
  <div class="cover-title">Plateforme TamCar</div>
  <div class="cover-subtitle">
    Dossier de justification à l'attention du Commissaire aux Apports,
    en vue de la constitution de Tam Logistics SARL, marque TamCar (droit OHADA)
  </div>

  <div class="cover-verdict">
    <div class="label">Valeur d'apport en nature proposée</div>
    <div class="value">22 500 000 FCFA</div>
    <div class="value-sub">Entre le coût de reproduction (20 M) et la valeur d'usage (25,5 M) · 45 % du coût historique (50 M)</div>
  </div>

  <div class="cover-meta">
    <div>
      <div class="k">Apporteur</div>
      <div class="v">BENAEL, SARL à associé unique (RCCM RB/COT/26 B 44404)</div>
    </div>
    <div>
      <div class="k">Représentée par son gérant</div>
      <div class="v">Terence Beni Raphaël QUENUM</div>
    </div>
    <div>
      <div class="k">Société bénéficiaire</div>
      <div class="v">Tam Logistics SARL (en formation), marque TamCar</div>
    </div>
    <div>
      <div class="k">Nature de l'apport</div>
      <div class="v">Propriété intellectuelle : logiciel, marque, savoir-faire</div>
    </div>
    <div>
      <div class="k">Cadre juridique</div>
      <div class="v">Art. 312 AUSCGIE — OHADA</div>
    </div>
    <div>
      <div class="k">Établissement · édition</div>
      <div class="v">Octobre 2026 · V2.0 — Confidentielle</div>
    </div>
  </div>
</div>
''')

# ------------------------------------------------------------------ 2 · résumé exécutif
PAGES.append(entete('01', 'Résumé exécutif', 'Ce dossier en une page') + '''
  <p class="lead">
    Ce document justifie la valorisation de l'apport en nature de <strong>BENAEL</strong> à Tam Logistics SARL
    (marque TamCar), société en formation. Il vise à assister le Commissaire aux Apports désigné dans l'exercice
    de sa mission conformément à <strong>l'article 312 de l'Acte Uniforme relatif au droit des sociétés commerciales
    et du groupement d'intérêt économique (OHADA)</strong>.
  </p>

  <h2>Valeur proposée — 3 méthodes d'évaluation</h2>

  <table>
    <thead>
      <tr><th>Méthode</th><th class="right">Valeur de la plateforme</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>A · Coût historique</strong><br>
        <span class="small muted">2 000 heures depuis novembre 2025 × 25 000 F/h (développeur senior, tarif local)</span></td>
        <td class="right">50 000 000 F</td>
      </tr>
      <tr>
        <td><strong>B · Coût de reproduction</strong><br>
        <span class="small muted">800 heures pour reconstruire à périmètre connu (40 % du temps historique) × 25 000 F/h</span></td>
        <td class="right">20 000 000 F</td>
      </tr>
      <tr>
        <td><strong>C · Valeur d'usage</strong><br>
        <span class="small muted">Revenus de TamCar sur 36 mois (flotte de départ du plan), actualisés à 20 %</span></td>
        <td class="right">25 500 000 F</td>
      </tr>
      <tr class="subtotal">
        <td><strong>Valeur proposée</strong><br>
        <span class="small muted">+ 12,5 % sur B · − 11,8 % sur C · 45 % de A</span></td>
        <td class="right"><strong>22 500 000 FCFA</strong></td>
      </tr>
    </tbody>
  </table>

  <h2>Points clés</h2>
  <ul class="list-clean">
    <li><strong>Plateforme en production</strong> — actif fonctionnel testable en temps réel (tamcar-client.vercel.app, tamcar-driver-portal.vercel.app).</li>
    <li><strong>Périmètre au 20 octobre 2026</strong> — 4 applications web (passagers, chauffeurs, TamCar Office, site vitrine) et 2 coques Android, 107 écrans, 90 tables, 9 vues, 349 fonctions métier, environ 66 000 lignes de TypeScript et 66 000 lignes de SQL de migration.</li>
    <li><strong>Origine de la valeur proposée</strong> — c'est la valeur qui permet la répartition convenue avec l'investisseur (15 000 000 F en numéraire pour 40 %, soit 37 500 000 F d'apports et 22 500 000 F pour 60 %). Elle reste dans la fourchette des méthodes B et C.</li>
    <li><strong>Titularité</strong> — chaîne documentée : travaux du fondateur cédés à BENAEL en apport, puis apport de BENAEL à la société (chapitre 08 et annexe 1).</li>
  </ul>

''' + FOOT.format(n=2))

# ------------------------------------------------------------------ 3 · description
PAGES.append(entete('02', "Description de l'apport", 'Nature et périmètre du bien apporté') + '''
  <h2>Nature juridique</h2>
  <p>
    L'apport consiste en la <strong>totalité des droits patrimoniaux</strong> attachés à la plateforme « TamCar »,
    plateforme technologique de mise en relation entre clients demandeurs de course et chauffeurs prestataires de transport
    (VTC — Véhicule de Transport avec Chauffeur), <strong>dans les limites de la liste fermée de l'annexe 1</strong> :
  </p>

  <ul class="list-clean">
    <li>Le <strong>code source</strong> des applications : passagers, chauffeurs (TamCar Pro), TamCar Office, site vitrine et espace partenaire, coques Android, bibliothèque partagée.</li>
    <li>La <strong>base de données et la logique métier</strong> : schéma Postgres (PostGIS), politiques de sécurité, fonctions, tâches planifiées, fonctions serveur (paiements, notifications, bot WhatsApp Tamy).</li>
    <li>La <strong>documentation</strong> : spécifications, guides d'utilisation, roadmap, plan d'affaires et classeur de projections.</li>
    <li>La <strong>marque et les signes distinctifs</strong> : nom, logo, palette, slogan, charte graphique, sous-marques (TamAssur, TamPass, Tamy, TamCar Pro, TamCar Office, TamCar Connect), visuels, ainsi que le droit de les déposer.</li>
    <li>Le <strong>savoir-faire</strong> : grille tarifaire, règles de partage des revenus, cession échelonnée, versement quotidien, TamAssur, matching par proximité, procédures d'exploitation.</li>
    <li>Les <strong>documents juridiques et commerciaux types</strong> : contrat de partenariat véhicule, conditions générales, politique de confidentialité, modèles de reçus, plaquettes.</li>
    <li>Les <strong>noms de domaine</strong> liés à TamCar.</li>
  </ul>

  <h2>Périmètre fonctionnel — inventaire au 20 octobre 2026</h2>

  <div class="grid-3">
    <div class="kpi-mini"><div class="val">4 + 2</div><div class="lbl">Applications web + coques Android</div></div>
    <div class="kpi-mini"><div class="val">107</div><div class="lbl">Écrans / pages fonctionnelles</div></div>
    <div class="kpi-mini"><div class="val">349</div><div class="lbl">Fonctions métier Postgres</div></div>
    <div class="kpi-mini"><div class="val">90 + 9</div><div class="lbl">Tables et vues SQL</div></div>
    <div class="kpi-mini"><div class="val">~132 k</div><div class="lbl">Lignes (TypeScript et SQL)</div></div>
    <div class="kpi-mini"><div class="val">450+</div><div class="lbl">Commits Git depuis le 13 juillet 2026</div></div>
  </div>

  <h2 style="break-before: page">Catégories de fonctionnalités livrées</h2>

  <table>
    <thead>
      <tr><th>Domaine</th><th>Fonctionnalités clés</th></tr>
    </thead>
    <tbody>
      <tr><td><strong>Passagers</strong></td><td>Commande immédiate et à l'avance, catégories Moto, Tricycle, Essentiel, Confort et VIP, suivi du chauffeur en direct (y compris écran verrouillé), chat et appel audio, portefeuille, paiement Mobile Money et carte, facture, notation, TamPass, courses programmées, favoris, suivi de nuit par un proche</td></tr>
      <tr><td><strong>Chauffeurs (TamCar Pro)</strong></td><td>Mise en ligne, matching par cercles de proximité, navigation, alertes de course, objectif du jour, versement quotidien, TamAssur (épargne), portefeuille et retraits automatiques, litiges et points</td></tr>
      <tr><td><strong>Administration</strong></td><td>Candidatures et rendez-vous, partenaires et véhicules, contrats et suspension automatique, fonds de rachat, alertes SOS, litiges automatiques, classements semestriels, guide d'utilisation</td></tr>
      <tr><td><strong>TamCar Office</strong></td><td>Comptabilité SYSCOHADA, trésorerie, paie, courrier, lecture de justificatifs par intelligence artificielle</td></tr>
      <tr><td><strong>Transverse</strong></td><td>Authentification, notifications push, bot WhatsApp Tamy, site vitrine et espace partenaire, multi-langue, installation PWA et coques Android</td></tr>
    </tbody>
  </table>

''' + FOOT.format(n=3))

# ------------------------------------------------------------------ 4 · méthodologie
PAGES.append(entete('03', "Méthodologie d'évaluation", 'Trois approches convergentes conformes aux standards') + '''
  <p class="lead">
    L'évaluation d'un actif immatériel logiciel s'appuie traditionnellement sur trois familles de méthodes
    complémentaires. Ce dossier applique les trois et situe la valeur proposée <strong>entre le coût de reproduction
    et la valeur d'usage</strong>.
  </p>

  <div class="grid-3">
    <div class="card primary">
      <h3>A. Coût historique</h3>
      <p class="small">Mesure le coût des ressources humaines investies pour produire l'actif : temps de travail × tarif horaire du marché local.</p>
      <p class="small muted">Approche rétrospective — reflète l'investissement historique.</p>
    </div>
    <div class="card primary">
      <h3>B. Coût de reproduction</h3>
      <p class="small">Mesure ce que coûterait la reconstitution de l'actif aujourd'hui, à périmètre connu : les itérations et les découvertes métier n'ont plus à être refaites.</p>
      <p class="small muted">Approche de remplacement — reflète la valeur d'usage immédiate.</p>
    </div>
    <div class="card primary">
      <h3>C. Valeur d'usage</h3>
      <p class="small">Mesure la valeur actuelle des revenus que TamCar tire de l'actif sur 36 mois, dans la flotte de départ du plan d'affaires, actualisés à 20 %.</p>
      <p class="small muted">Approche prospective — dépend des hypothèses du plan.</p>
    </div>
  </div>

  <h2>Lecture des trois méthodes</h2>
  <table>
    <thead><tr><th>Méthode</th><th class="right">Valeur</th><th>Fiabilité</th></tr></thead>
    <tbody>
      <tr><td>A · Coût historique</td><td class="right">50 000 000 F</td><td>Moyenne — heures déclarées, à justifier par un relevé de temps (chapitre 04)</td></tr>
      <tr><td>B · Coût de reproduction</td><td class="right">20 000 000 F</td><td>Haute — fondée sur un périmètre connu et mesuré</td></tr>
      <tr><td>C · Valeur d'usage</td><td class="right">25 500 000 F</td><td>Moyenne — dépend des hypothèses du plan d'affaires</td></tr>
    </tbody>
  </table>

  <p class="small muted" style="margin-top:4mm;">
    Normes de référence : IAS 38 (immobilisations incorporelles), référentiel SYSCOHADA révisé, guides d'évaluation des
    apports en nature des experts-comptables de l'espace OHADA.
  </p>

''' + FOOT.format(n=4))

# ------------------------------------------------------------------ 5 · méthode A
PAGES.append(entete('04', 'Méthode A — Coût historique', 'Temps × tarif horaire senior local') + '''
  <h2>Temps investi</h2>

  <table>
    <thead>
      <tr><th>Élément</th><th class="right">Valeur</th></tr>
    </thead>
    <tbody>
      <tr><td>Période de travail</td><td class="right">novembre 2025 → 20 octobre 2026 (environ 11 mois)</td></tr>
      <tr><td>Volume de travail du fondateur</td><td class="right">environ 2 000 heures (environ 175 h par mois)</td></tr>
      <tr><td>Rémunération versée</td><td class="right">aucune : heures non payées</td></tr>
      <tr class="total"><td>Dépenses en numéraire engagées</td><td class="right">4 000 000 F</td></tr>
    </tbody>
  </table>

  <div class="card warn" style="margin-top:4mm;">
    <p class="small">
      <strong>Justification des heures.</strong> Le dépôt Git privé commence le 13 juillet 2026 : il atteste la période
      juillet-octobre 2026. Les travaux de novembre 2025 à juillet 2026 (cadrage, prototypes, conception) sont justifiés
      par les pièces remises au Commissaire (chapitre 08, pièces 4 et 5). Un <strong>relevé de temps ventilé par domaine
      technique</strong> sera établi et remis avec le présent dossier (pièce 3).
    </p>
  </div>

  <h2>Barème horaire — marché local du développement senior</h2>

  

  <table>
    <thead>
      <tr><th>Niveau d'expertise</th><th class="right">Tarif horaire (FCFA)</th></tr>
    </thead>
    <tbody>
      <tr><td>Junior (0-2 ans)</td><td class="right">8 000 - 12 000</td></tr>
      <tr><td>Confirmé (2-5 ans)</td><td class="right">15 000 - 20 000</td></tr>
      <tr><td><strong>Senior full-stack (5-10 ans)</strong></td><td class="right"><strong>20 000 - 30 000</strong></td></tr>
      <tr><td>Expert / Lead (10+ ans, rare au Bénin)</td><td class="right">35 000 - 50 000</td></tr>
    </tbody>
  </table>

  <p class="small muted">
    Sources : consultations professionnelles auprès d'agences tech Cotonou / Lomé, retours de missions freelance sur le
    marché sous-régional 2024-2026. Le tarif retenu (25 000 F) est le milieu de la fourchette senior.
  </p>

  <div class="card result" style="margin-top:4mm;">
    <h3>Résultat Méthode A</h3>
    <div class="result-value">50 000 000 FCFA</div>
    <p style="color: rgba(255,255,255,.95); font-size:10pt;">
      2 000 heures × 25 000 FCFA/heure : coût du travail du fondateur au tarif médian senior local, si le développement avait été confié à un prestataire.
    </p>
  </div>

''' + FOOT.format(n=5))

# ------------------------------------------------------------------ 6 · méthode B
PAGES.append(entete('05', 'Méthode B — Coût de reproduction', 'Reconstruire à périmètre connu') + '''
  <p class="lead">
    Cette méthode évalue ce qu'il en coûterait pour reconstruire aujourd'hui la plateforme à l'identique, en
    connaissant le périmètre, les modèles de données et les règles métier. Les itérations, les essais abandonnés et les
    découvertes métier de la période historique n'ont plus à être refaits.
  </p>

  <h2>Calcul</h2>

  <table>
    <thead>
      <tr><th>Poste</th><th class="right">Valeur</th></tr>
    </thead>
    <tbody>
      <tr><td>Temps historique (méthode A)</td><td class="right">2 000 heures</td></tr>
      <tr><td>Part nécessaire pour reconstruire à périmètre connu</td><td class="right">40 %</td></tr>
      <tr><td>Heures de reconstruction</td><td class="right">800 heures</td></tr>
      <tr><td>Tarif horaire senior local (cf. chapitre 04)</td><td class="right">25 000 F</td></tr>
      <tr class="total"><td>Coût de reproduction</td><td class="right">20 000 000 F</td></tr>
    </tbody>
  </table>

  <div class="formula" style="margin-top:6mm;">
    Coût de reproduction = 800 heures × 25 000 FCFA/heure = 20 000 000 FCFA
  </div>

  <h2>Choix prudents</h2>
  <ul class="list-clean">
    <li><strong>Heures de développement seulement</strong> — aucun poste de coordination de projet, de design ou de marge d'agence n'est ajouté, alors qu'un prestataire tiers les facturerait.</li>
    <li><strong>Périmètre arrêté</strong> — le coût porte sur la liste fermée de l'annexe 1 au 20 octobre 2026 ; les développements postérieurs ne sont pas comptés.</li>
    <li><strong>Un devis d'agence régionale</strong> (Cotonou, Lomé, Abidjan) pourrait être remis au Commissaire pour contrôle de cette estimation.</li>
  </ul>

  <div class="card result" style="margin-top:6mm;">
    <h3>Résultat Méthode B</h3>
    <div class="result-value">20 000 000 FCFA</div>
    <p style="color: rgba(255,255,255,.95); font-size:10pt;">
      Valeur la plus directement observable : c'est le plancher défendable de la valeur proposée.
    </p>
  </div>

''' + FOOT.format(n=6))

# ------------------------------------------------------------------ 7 · méthode C
PAGES.append(entete('06', "Méthode C — Valeur d'usage", 'Revenus de TamCar actualisés') + '''
  <p class="lead">
    Cette méthode évalue la valeur actuelle des revenus que TamCar tire de la plateforme sur 36 mois. Elle est appliquée
    avec les hypothèses du plan d'affaires, <strong>sans voiture de tiers</strong> et sans extension géographique.
  </p>

  <h2>Hypothèses</h2>

  <ul class="list-clean">
    <li><strong>Flotte</strong> — flotte de départ du plan d'affaires v6 ; les voitures de tiers et Parakou sont hors projection.</li>
    <li><strong>Revenus</strong> — part de TamCar sur les recettes des véhicules, aux planchers de recettes prévus aux contrats (100 %).</li>
    <li><strong>Horizon</strong> — 36 mois à compter du lancement (janvier 2027).</li>
    <li><strong>Taux d'actualisation</strong> — 20 % par an (prime de risque startup Bénin conservatrice).</li>
  </ul>

  <div class="formula" style="margin-top:6mm;">
    Valeur d'usage = Σ (revenus du mois ÷ 1,20<sup>mois / 12</sup>), mois 1 à 36 = 25 500 000 FCFA
  </div>

  <h2>Note critique de méthode</h2>

  <div class="card warn">
    <p class="small">
      Une valeur d'usage appliquée à un actif jeune, sans historique de revenus, comporte une marge d'incertitude
      significative : elle dépend des planchers de recettes effectivement atteints. À 70 % des planchers, le plan ne dégage
      plus d'excédent d'exploitation. Elle est donc présentée à titre de <strong>confirmation</strong> et comme borne
      haute de la valeur proposée, non comme méthode principale. Le détail du calcul figure dans le classeur de projections
      remis au Commissaire (pièce 6).
    </p>
  </div>

  <div class="card result" style="margin-top:4mm;">
    <h3>Résultat Méthode C</h3>
    <div class="result-value">25 500 000 FCFA</div>
    <p style="color: rgba(255,255,255,.95); font-size:10pt;">
      Borne haute : la valeur proposée (22,5 M) lui est inférieure de 11,8 %.
    </p>
  </div>

''' + FOOT.format(n=7))

# ------------------------------------------------------------------ 8 · synthèse et comparables
PAGES.append(entete('07', 'Synthèse et comparables de marché', 'Convergence des méthodes et repères sectoriels') + '''
  <h2>Synthèse des trois méthodes</h2>

  <table>
    <thead>
      <tr><th>Méthode</th><th>Base</th><th class="right">Valeur</th></tr>
    </thead>
    <tbody>
      <tr><td>A. Coût historique</td><td>2 000 h × 25 000 F</td><td class="right">50 000 000</td></tr>
      <tr><td>B. Coût de reproduction</td><td>800 h × 25 000 F</td><td class="right">20 000 000</td></tr>
      <tr><td>C. Valeur d'usage</td><td>Revenus 36 mois actualisés à 20 %</td><td class="right">25 500 000</td></tr>
      <tr class="subtotal"><td colspan="2"><strong>VALEUR PROPOSÉE</strong></td><td class="right"><strong>22 500 000 FCFA</strong></td></tr>
    </tbody>
  </table>

  <p class="small" style="margin-top:3mm;">
    La valeur proposée est <strong>supérieure au coût de reproduction</strong> (+ 12,5 %), <strong>inférieure à la valeur
    d'usage</strong> (− 11,8 %) et égale à <strong>45 % du coût historique</strong>. Elle correspond à la valeur nécessaire
    pour la répartition convenue avec l'investisseur (15 000 000 F en numéraire pour 40 %).
  </p>

  ''' + COMPARABLES + '''

  <p style="margin-top:4mm;">
    Face à ces ordres de grandeur, une valeur d'apport de <strong>22,5 M FCFA</strong> pour une plateforme
    équivalente au démarrage reste <strong>très modeste</strong> et défendable.
  </p>

  <div class="card primary" style="margin-top:4mm;">
    <h3>Position finale du dossier</h3>
    <ul class="list-clean">
      <li>La valeur proposée de <strong>22 500 000 FCFA</strong> se situe <strong>entre B (20 M) et C (25,5 M)</strong></li>
      <li>Elle équivaut à <strong>45 %</strong> du coût historique (50 M)</li>
      <li>Elle représente une <strong>fraction infime</strong> des comparables sectoriels africains</li>
      <li>Elle assure la <strong>responsabilité solidaire</strong> des associés à un niveau maîtrisable (art. 312 AUSCGIE)</li>
    </ul>
  </div>

''' + FOOT.format(n=8))

# ------------------------------------------------------------------ 9 · propriété intellectuelle
PAGES.append(entete('08', 'Propriété intellectuelle', 'Chaîne de titularité et attestations') + '''
  <h2>Chaîne de titularité</h2>
  <table>
    <thead><tr><th>Étape</th><th>Fait</th></tr></thead>
    <tbody>
      <tr><td><strong>1 · Création</strong></td><td>Terence Beni Raphaël QUENUM, personne physique, a conçu et développé la plateforme de novembre 2025 au 7 octobre 2026.</td></tr>
      <tr><td><strong>2 · Cession en apport</strong></td><td>Par acte du ____ 2026, il cède à BENAEL, en apport en nature, l'ensemble de ses droits patrimoniaux sur ces travaux (pièce 8).</td></tr>
      <tr><td><strong>3 · Poursuite</strong></td><td>BENAEL (RCCM du 8 octobre 2026) poursuit le développement : la plateforme est conçue et exploitée sous sa responsabilité.</td></tr>
      <tr><td><strong>4 · Apport</strong></td><td>BENAEL apporte à Tam Logistics SARL les droits listés en annexe 1, en échange de 60 % du capital.</td></tr>
    </tbody>
  </table>

  <h2>Déclarations de l'apporteur</h2>
  <p>BENAEL, représentée par son gérant, déclare sous sa responsabilité :</p>
  <ul class="list-clean">
    <li>Détenir la pleine propriété des droits patrimoniaux sur les éléments de l'annexe 1, par la création et par la cession décrite ci-dessus</li>
    <li>N'avoir souscrit aucun engagement susceptible de compromettre la libre disposition de ces éléments (aucun contrat de sous-traitance, cession, licence exclusive, ou obligation envers un employeur ou un client tiers)</li>
    <li>N'avoir utilisé aucun composant logiciel soumis à une licence de type « copyleft » (GPL, AGPL) ; les dépendances sont sous licences permissives (MIT, Apache 2.0, BSD). Les données de lieux sont amorcées à partir d'OpenStreetMap (licence ODbL : attribution et partage à l'identique de la base dérivée)</li>
    <li>Que la conception, la direction, la relecture et l'intégration du code ont été assurées par son gérant, avec l'aide d'outils d'intelligence artificielle pour la rédaction du code</li>
    <li>Assumer la garantie d'éviction et d'usage paisible au bénéfice de Tam Logistics SARL en formation</li>
  </ul>

  <h2>Traçabilité</h2>
  <p class="small">
    Le code source est hébergé sur un dépôt Git privé dont l'historique horodaté commence le 13 juillet 2026 (plus de 450 commits). Les travaux antérieurs sont justifiés par les pièces 4 et 5 ci-dessous.
  </p>

  <h2 style="break-before: page">Documents mis à disposition du Commissaire</h2>
  <table>
    <thead><tr><th>#</th><th>Document</th><th>Forme</th></tr></thead>
    <tbody>
      <tr><td>1</td><td>Archive du code source (branche main) et historique Git détaillé</td><td>Fichier .zip et export texte</td></tr>
      <tr><td>2</td><td>Accès démonstration aux applications déployées</td><td>URLs et comptes de test</td></tr>
      <tr><td>3</td><td>Relevé de temps ventilé par domaine technique</td><td>Tableau signé</td></tr>
      <tr><td>4</td><td>Pièces des travaux de novembre 2025 à juillet 2026 (prototypes, maquettes, cadrage)</td><td>Fichiers datés</td></tr>
      <tr><td>5</td><td>Brief de marque, charte graphique, documentation technique, roadmap</td><td>PDF et .docx</td></tr>
      <tr><td>6</td><td>Plan d'affaires v6 et classeur de projections</td><td>PDF et .xlsx</td></tr>
      <tr><td>7</td><td>Statuts de BENAEL et extrait RCCM</td><td>PDF</td></tr>
      <tr><td>8</td><td>Acte de cession en apport (fondateur → BENAEL)</td><td>Acte signé</td></tr>
      <tr><td>9</td><td>Attestation sur l'honneur de propriété intellectuelle de BENAEL</td><td>Document signé</td></tr>
      <tr><td>10</td><td>Inventaire des intégrations tierces et des licences</td><td>Tableau</td></tr>
    </tbody>
  </table>

''' + FOOT.format(n=9))

# ------------------------------------------------------------------ 10 · annexe 1
PAGES.append(entete('09', 'Annexe 1 — Périmètre arrêté', "Liste fermée des éléments apportés, transférés et exclus") + '''
  <p class="small">
    Liste arrêtée au 23 octobre 2026. <strong>Tout élément qui n'y figure pas est exclu de l'apport</strong> ; les
    développements postérieurs à la date de l'apport ne sont pas compris.
  </p>

  <h2>Apportés — droits patrimoniaux en pleine propriété</h2>
  <table>
    <thead><tr><th>#</th><th>Élément</th><th>Contenu</th></tr></thead>
    <tbody>
      <tr><td>A1</td><td><strong>Code source</strong></td><td>Applications passagers (<span class="small muted">apps/client</span>), chauffeurs TamCar Pro (<span class="small muted">apps/driver-portal</span>), TamCar Office (<span class="small muted">apps/back-office</span>), site vitrine et espace partenaire (<span class="small muted">apps/site</span>, <span class="small muted">apps/web</span>), coques Android (<span class="small muted">mobile-client</span>, <span class="small muted">mobile-driver</span>), bibliothèque partagée (<span class="small muted">packages/shared</span>), scripts</td></tr>
      <tr><td>A2</td><td><strong>Base de données et logique métier</strong></td><td>Migrations SQL (90 tables, 9 vues, 349 fonctions), politiques de sécurité, tâches planifiées, fonctions serveur (<span class="small muted">backend/supabase/functions</span>), tests</td></tr>
      <tr><td>A3</td><td><strong>Documentation</strong></td><td>Spécifications, guides (back-office, TamCar Office), roadmap, plan d'affaires, classeur de projections</td></tr>
      <tr><td>A4</td><td><strong>Marque et signes distinctifs</strong></td><td>TamCar ; logo et déclinaisons ; palette ; slogan « Ta course est claire, ta course éclair. » ; charte graphique ; sous-marques TamAssur, TamPass, Tamy, TamCar Pro, TamCar Office, TamCar Connect ; visuels (icônes de véhicules, kit du Tam, habillage des véhicules, bannières, sons d'alerte) ; droit de déposer et de faire enregistrer ces marques</td></tr>
      <tr><td>A5</td><td><strong>Savoir-faire</strong></td><td>Grille tarifaire, règles de partage des revenus, cession échelonnée, versement quotidien, TamAssur, fonds de rachat, matching par proximité, procédures d'exploitation</td></tr>
      <tr><td>A6</td><td><strong>Documents juridiques et commerciaux types</strong></td><td>Contrat de partenariat véhicule, conditions générales, politique de confidentialité, modèles de reçus, plaquettes, propositions types</td></tr>
      <tr><td>A7</td><td><strong>Noms de domaine</strong></td><td>tamcar.app et les noms de domaine liés à TamCar : transfert de la titularité du compte chez le registraire</td></tr>
    </tbody>
  </table>

  <h2 style="break-before: page">Transférés — contrats et comptes, sans valeur d'apport</h2>
  <table>
    <thead><tr><th>#</th><th>Élément</th><th>Traitement</th></tr></thead>
    <tbody>
      <tr><td>T1</td><td>Comptes techniques : Supabase, Vercel, dépôt Git, Cloudflare, Firebase</td><td>Transfert ou ressouscription au nom de Tam Logistics à la constitution ; BENAEL assure la transition</td></tr>
      <tr><td>T2</td><td>Contrats de paiement et de messagerie : FeexPay, WhatsApp Business</td><td>Conclus au nom de la société d'exploitation</td></tr>
      <tr><td>T3</td><td>Comptes de développeur des boutiques d'applications</td><td>Ouverts au nom de la société d'exploitation</td></tr>
    </tbody>
  </table>

  <h2>Exclus — restent chez BENAEL</h2>
  <table>
    <thead><tr><th>#</th><th>Élément</th><th>Traitement</th></tr></thead>
    <tbody>
      <tr><td>E1</td><td>Plateforme de gestion du groupe BENAEL, Juvora, CleanCompta, site de BENAEL</td><td>Hors périmètre</td></tr>
      <tr><td>E2</td><td>Composants génériques de BENAEL réutilisés dans plusieurs projets (s'il en existe)</td><td>Licence non exclusive et gratuite pour l'usage de TamCar, listés à l'inventaire d'intégration (pièce 10)</td></tr>
      <tr><td>E3</td><td>Logiciels et données de tiers (open source, OpenStreetMap)</td><td>Conservent leur licence ; attribution maintenue</td></tr>
    </tbody>
  </table>

''' + FOOT.format(n=10))

# ------------------------------------------------------------------ 11 · contact et suite
PAGES.append(entete('10', 'Contact et suite du dossier', 'Coordonnées et modalités de restitution') + '''
  <h2>Interlocuteur unique</h2>
  <table>
    <tbody>
      <tr><td><strong>Interlocuteur</strong></td><td>Terence Beni Raphaël QUENUM — gérant de BENAEL et futur gérant de Tam Logistics SARL</td></tr>
      <tr><td><strong>Email</strong></td><td>terencebeniraphael@gmail.com</td></tr>
      <tr><td><strong>Téléphone / WhatsApp</strong></td><td>+229 [à compléter]</td></tr>
      <tr><td><strong>Adresse</strong></td><td>BENAEL — Cotonou, 9<sup>e</sup> arrondissement, Mènontin</td></tr>
      <tr><td><strong>Disponibilité RDV</strong></td><td>À votre convenance, Cotonou ou Porto-Novo</td></tr>
    </tbody>
  </table>

  <h2>Modalités de restitution attendues</h2>
  <p>
    À l'issue de sa mission, le Commissaire aux Apports produira son rapport officiel à annexer aux statuts de
    Tam Logistics SARL. Ce rapport devra notamment préciser :
  </p>
  <ul class="list-clean">
    <li>La nature et la description de l'apport en nature évalué, par référence à l'annexe 1</li>
    <li>Les méthodes d'évaluation retenues par le Commissaire</li>
    <li>La valeur définitive arrêtée par le Commissaire (qui peut différer de la valeur proposée dans le présent dossier)</li>
    <li>Les observations et réserves éventuelles du Commissaire</li>
    <li>Sa signature et sa date d'émission</li>
  </ul>

  <h2 style="break-before: page">Calendrier prévisionnel</h2>
  <table>
    <thead><tr><th>Étape</th><th>Délai estimé</th></tr></thead>
    <tbody>
      <tr><td>Remise du présent dossier et des documents annexes</td><td>Immédiate</td></tr>
      <tr><td>Étude et examens complémentaires par le Commissaire</td><td>2 à 4 semaines</td></tr>
      <tr><td>Éventuelles demandes de compléments d'information</td><td>Traitement sous 48 h par l'apporteur</td></tr>
      <tr><td>Restitution du rapport officiel</td><td>4 à 6 semaines après remise complète</td></tr>
      <tr><td>Assemblée générale constitutive de Tam Logistics SARL</td><td>Suite immédiate à la restitution</td></tr>
    </tbody>
  </table>

  <div class="card warn">
    <p class="small">
      <strong>Rappel important.</strong> La valeur définitive retenue par le Commissaire s'impose aux associés dans les
      statuts. Toute retenue d'une valeur différente entraînerait leur responsabilité solidaire pendant cinq ans (art. 312
      AUSCGIE).
    </p>
  </div>

  <div style="margin-top:6mm; padding-top:4mm; text-align:center; border-top:1px solid var(--line);">
    <p class="small muted" style="font-style:italic;">
      Ce dossier est confidentiel et communiqué exclusivement au Commissaire aux Apports désigné pour la constitution de
      Tam Logistics SARL. Toute reproduction, communication ou usage à des fins autres que la mission d'évaluation est
      strictement interdite sans autorisation écrite préalable de l'apporteur.
    </p>
    <p class="small muted" style="margin-top:2mm; font-style:italic;">
      <strong>BENAEL</strong> — Tam Logistics SARL en formation — Édition octobre 2026 — Version 2.0
    </p>
  </div>

''' + FOOT.format(n=11))

# une page = une feuille A4 (la version 1.0 débordait : hauteur sans le remplissage, pied de page rejeté sur une 2e feuille)
CSS_A4 = """
  /* V2.0 : une page logique = au moins une feuille A4, qui se poursuit sur la suivante si le contenu est plus long */
  .page { box-sizing: border-box; min-height: 297mm; padding: 14mm 15mm 11mm; }
  .page h2 { margin-top: 5mm; margin-bottom: 2mm; break-after: avoid; }
  .page td, .page th { padding: 1.8mm 2.5mm; }
  .page .section-hd { margin-bottom: 4mm; }
  .page { font-size: 9.6pt; line-height: 1.45; }
  .page .lead { font-size: 10.6pt; margin-bottom: 2.5mm; }
  .page h2 { font-size: 13pt; }
  .page td { font-size: 9pt; }
  .page th { font-size: 8pt; }
  .page p { margin-bottom: 2mm; }
  .page .list-clean li { font-size: 9.4pt; }
  .page tr, .page .card, .page .formula { break-inside: avoid; }
  @media print { .page { margin: 0; } }
"""
tete = tete.replace('</style>', CSS_A4 + '</style>', 1)
html = tete + '\n\n' + '\n'.join(PAGES) + '\n</body>\n</html>\n'
SORTIE.write_text(html, encoding='utf-8')
print(f'{SORTIE.name} : {len(PAGES)} pages, {len(html) // 1024} Ko')
