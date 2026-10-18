"""Génère resume.html : le résumé du plan d'affaires (10 pages) — version 6.

Pages 1 à 3 (couverture, projet, marché) : reprises du résumé précédent (archives/2026-10-03_plan_affaires_v5), mises à jour.
Pages 4 à 10 (modèle économique, flotte, organisation, prévisions, charges, risques, calendrier et opération) : refaites
sur le modèle v6, tous les chiffres lus dans le classeur TamCar_resultat_complet_v2 (voir modele_v6.py).

Le gabarit des pages 1 à 3 est resume_base_v5.html (copie du résumé de la version 5, qui reste archivée).
"""
import contextlib
import io
import math
import pathlib
import re

import modele_v6 as M

ICI = pathlib.Path(__file__).parent
n, sg, mm, pct, taux = M.n, M.sg, M.mm, M.pct, M.taux

with contextlib.redirect_stdout(io.StringIO()):
    import gen_partie2b as G2          # périmètre de la plateforme lu dans le dépôt (écrit aussi partie2b.html)


def D1(v):
    return f"{v:.1f}".replace('.', ',')


def tr(*cells, cls=''):
    return f'<tr{" class=" + chr(34) + cls + chr(34) if cls else ""}>' + ''.join(f'<td>{c}</td>' for c in cells) + '</tr>'


# ------------------------------------------------------------------ chiffres
E, C, VT, VM, J = M.PLANCHER_ESS, M.PLANCHER_CONF, M.VOL_TRI, M.VOL_MOTO, M.JOURS
PART = {
    'moto': M.VERS_MOTO * J,
    'tri': VT * J * M.PART_TRICYCLE,
    'ess': E * J * M.PART_VOITURE,
    'conf': C * J * M.PART_VOITURE,
}
TRI_MENS = M.PRIX_TRICYCLE * (1 - M.ACOMPTE_PCT) / M.MENS_TRICYCLE
ACHAT_TRI, ACHAT_MOTOS = M.PRIX_TRICYCLE, M.PRIX_MOTO * M.N_MOTO
MISE_DEPART = (M.ACOMPTE_TRICYCLE + M.MOTOS_COMPTANT + M.annuel(48)[1] + M.annuel(49)[1] + M.annuel(50)[1] + M.annuel(51)[1]
               + M.N_VEHICULES_TAMCAR * M.FRAIS_ENTREE)
NT = M.N_ESS_T + M.N_CONF_T
R = M.res(1.0)
R_S = M.res(1.0, False)
R70, R70_S = M.res(0.7), M.res(0.7, False)
SEUIL_S, SEUIL_T = M.seuils('flotte_actuelle'), M.seuils('avec_tiers')
MIN = M.MIN
MOIS_PLAFOND_OPS = next(i for i, v in enumerate(M.ligne(33)) if v >= 150000)
CVAL = round(M.valeur_usage(), -5)
REVENUS_S, REVENUS_T = M.rec_36(1.0, False), M.rec_36(1.0)
CAISSE_S, CAISSE_T = M.serie_caisse(1.0, False), M.serie_caisse(1.0)

# ------------------------------------------------------------------ pages 1 à 3 : gabarit du résumé v5, mis à jour
base = (ICI / 'resume_base_v5.html').read_text(encoding='utf-8')
coupe = base.index('<!-- ============================================================ 4 · MODÈLE ÉCONOMIQUE -->')
debut = base[:coupe]


def remp(ancien, nouveau):
    global debut
    assert debut.count(ancien) == 1, (ancien[:70], debut.count(ancien))
    debut = debut.replace(ancien, nouveau)


remp('Document établi le 1er octobre 2026.', 'Document établi le 18 octobre 2026 (version 6).')
remp("""<b>2 pôles</b>
        <strong>Cotonou &amp; Grand Nokoué, Parakou</strong>
        <small>lancement progressif</small>""",
     """<b>1 pôle</b>
        <strong>Cotonou &amp; Grand Nokoué</strong>
        <small>Parakou en extension</small>""")
remp('à Cotonou, dans le Grand Nokoué et à Parakou, avec cinq catégories', 'à Cotonou et dans le Grand Nokoué, avec cinq catégories')
remp('<div class="kpi"><b>92</b><span>écrans</span></div>', f'<div class="kpi"><b>{G2.ECR}</b><span>écrans</span></div>')
remp('<div class="kpi"><b>60</b><span>tables de données</span></div>', f'<div class="kpi"><b>{len(G2.tables)}</b><span>tables de données</span></div>')
remp("""1 000 F par jour de travail (26 jours par mois au plus) : <strong>300 000 F</strong> après une année complète. Conçu avec NSIA Assurances.""",
     """1 000 F par jour de travail : TamCar garantit au conducteur <strong>250 000 F</strong> par année de cotisation. Conçu avec NSIA Assurances.""")
remp("""Une part de chaque course alimente un fonds de rachat : cession du véhicule après 24 mois (moto) ou 36 mois (tricycle).""",
     """À la fin du contrat, le véhicule revient au conducteur sans paiement supplémentaire : 12 mois (moto), 36 mois (tricycle, Essentiel) ou 48 mois (Confort).""")
remp("""Grâce aux véhicules des concessionnaires partenaires, un conducteur sans véhicule rejoint la plateforme.""",
     """Grâce aux véhicules des propriétaires partenaires, un conducteur sans véhicule rejoint la plateforme.""")
remp("""<h4>Parakou · second marché</h4>
      <p>Étude de marché terminée : population jeune, bonne bancarisation, smartphones répandus. Aucune plateforme n’y opère ; Gozem s’est retiré faute de conducteurs. TamCar lève cette contrainte avec les véhicules de concessionnaires.</p>""",
     """<h4>Parakou · extension</h4>
      <p>Étude de marché terminée : population jeune, bonne bancarisation, smartphones répandus. Aucune plateforme n’y opère ; Gozem s’est retiré faute de conducteurs. Hors des projections de base, l’ouverture est décidée sur les résultats de Cotonou, avec des critères fixés d’avance.</p>""")
remp("""Transparence tarifaire, prévisibilité de la relation avec les conducteurs, fidélisation économique (TamAssur, cession du véhicule, TamPass).""",
     """Transparence tarifaire, prévisibilité de la relation avec les conducteurs, fidélisation économique (TamAssur, cession du véhicule, TamPass).""")

# ------------------------------------------------------------------ page 4 : modèle économique
p4 = f'''<!-- ============================================================ 4 · MODÈLE ÉCONOMIQUE -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">03</span><h1>Modèle économique</h1></div>

  <p class="intro">
    Chaque course est répartie entre les acteurs selon une clé unique, intégrée aux règles de calcul de la plateforme.
    TamCar perçoit <strong>20 % du prix payé par le client sur tous les véhicules</strong>, 5 % de plus pour la gestion des véhicules
    qui ne sont pas à leur conducteur, et la part propriétaire (30 %) sur ceux qu’elle possède.
  </p>

  <div class="h-serif">Sur 1 000 F payés par le client</div>
  <p class="bar-label" style="margin-top:8px">Véhicule fourni (propriétaire partenaire ou flotte TamCar)</p>
  <div class="bar4">
    <div class="c1" style="width:40%">Conducteur 400 F</div>
    <div class="c2" style="width:5%">50</div>
    <div class="c3" style="width:30%">Propriétaire 300 F</div>
    <div class="c4" style="width:25%">TamCar 250 F</div>
  </div>
  <p class="bar-label">Véhicule du conducteur</p>
  <div class="bar4">
    <div class="c1" style="width:80%">Conducteur 800 F</div>
    <div class="c4" style="width:20%">TamCar 200 F</div>
  </div>
  <p class="note">Le carburant, l’entretien et les réparations sont à la charge du conducteur. Les 50 F de fonds de cession (barre orange) sont versés au propriétaire à la cession du véhicule, en plus de ses 300 F. La clé s’applique aux véhicules d’un propriétaire partenaire ; sur ceux de TamCar, la part propriétaire lui revient.</p>

  <div class="h-serif">Ce qui revient à TamCar</div>
  <table class="tbl serre" style="margin-top:8px">
    <thead>
      <tr><th>Pour 1 000 F payés</th><th>Véhicule d’un propriétaire partenaire</th><th>Véhicule de la flotte TamCar</th><th>Véhicule du conducteur</th></tr>
    </thead>
    <tbody>
      {tr('Part de la plateforme', 200, 200, 200)}
      {tr('Gestion du véhicule (5 %)', 50, 50, 0)}
      {tr('Part propriétaire', 0, 300, 0)}
      {tr('Total pour TamCar', '<strong>250</strong>', '<strong>550</strong>', '<strong>200</strong>', cls='cle')}
      {tr('Aux planchers, par mois<small>Essentiel · Confort | tricycle · moto</small>', f"{n(PART['ess'])} · {n(PART['conf'])}", f"{n(PART['tri'])} · {n(PART['moto'])}", '20 % du volume')}
    </tbody>
  </table>

  <div class="duo">
    <div>
      <div class="rule-label" style="margin-top:0">Grille de prix · FCFA</div>
      <table class="tbl serre" style="margin-top:7px">
        <thead><tr><th>Catégorie</th><th>Minimum</th><th>3 km</th><th>6,1 km</th><th>12 km</th></tr></thead>
        <tbody>
          <tr><td>Moto</td><td>200</td><td>200</td><td>450</td><td>800</td></tr>
          <tr><td>Tricycle</td><td>350</td><td>550</td><td>850</td><td>1 400</td></tr>
          <tr><td>Essentiel</td><td>500</td><td>700</td><td>1 000</td><td>1 950</td></tr>
          <tr><td>Confort</td><td>700</td><td>950</td><td>1 350</td><td>2 600</td></tr>
          <tr><td>VIP</td><td>950</td><td>1 250</td><td>1 800</td><td>3 400</td></tr>
        </tbody>
      </table>
      <p class="note">Arrondis au 50 F supérieur, hors climatisation en option.</p>
    </div>
    <div>
      <div class="rule-label" style="margin-top:0">Plancher et objectif du jour · FCFA</div>
      <table class="tbl serre" style="margin-top:7px">
        <colgroup><col style="width:32%"><col style="width:17%"><col style="width:17%"><col style="width:17%"><col style="width:17%"></colgroup>
        <thead><tr><th>Par jour</th><th>Essentiel</th><th>Confort</th><th>Tricycle</th><th>Moto</th></tr></thead>
        <tbody>
          {tr('Plancher', n(E), n(C), n(VT), n(VM))}
          {tr('Versement (60 %)', n(M.VERS_ESS), n(M.VERS_CONF), n(M.VERS_TRI), n(M.VERS_MOTO))}
          {tr('Objectif<small>TamAssur compris</small>', n(M.VERS_ESS + 1000), n(M.VERS_CONF + 1000), n(M.VERS_TRI + 1000), n(M.VERS_MOTO + 1000), cls='cle')}
        </tbody>
      </table>
      <p class="note">Le plancher est un montant de courses réalisées, avant carburant et avant la part de TamCar ; celui de la moto est du même ordre que les recettes d’un zémidjan (2 000 à 6 000 F par jour avant carburant).</p>
    </div>
  </div>

  <div class="h-serif">Quatre sources de revenus</div>
  <div class="row c-4" style="margin-top:9px">
    <div class="dom"><b>La part de chaque course <em>25 %</em></b><p>20 % de plateforme sur tous les véhicules, plus 5 % de gestion sur ceux d’un propriétaire partenaire : la source de base.</p></div>
    <div class="dom v"><b>La part propriétaire <em>30 %</em></b><p>Sur les véhicules que TamCar possède (un tricycle, cinq motos). Elle sert d’abord à rembourser leur achat.</p></div>
    <div class="dom g"><b>Le versement minimum <em>chaque nuit</em></b><p>Si la part de TamCar sur les courses du jour est sous l’objectif du conducteur, la différence est prélevée sur son portefeuille.</p></div>
    <div class="dom o"><b>Les services <em>en plus</em></b><p>TamPass et services complémentaires : ils s’ajoutent au plan et ne figurent pas dans la trésorerie.</p></div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
'''

# ------------------------------------------------------------------ page 5 : flotte
def ligne_veh(nom, sous, plancher, vers, part, capital, delai):
    return tr(f'<strong>{nom}</strong><small>{sous}</small>', n(plancher), n(vers), n(part), capital, delai)


p5 = f'''<!-- ============================================================ 5 · FLOTTE -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">04</span><h1>Flotte, propriétaires partenaires et cession</h1></div>

  <div class="row c-6-4 stretch">
    <div class="hero">
      <span class="pill">La flotte de départ</span>
      <h2>Quinze véhicules au mois 1, <em>au moins six voitures de tiers ensuite.</em></h2>
      <p>
        <strong>TamCar achète six véhicules</strong> ({n(ACHAT_TRI + ACHAT_MOTOS)} F) : un tricycle thermique à {n(M.PRIX_TRICYCLE)} F (30 % à la commande, puis {M.MENS_TRICYCLE} mensualités de {n(TRI_MENS)} F sans intérêt,
        conditions à confirmer par le fournisseur) et cinq motos électriques à {n(M.PRIX_MOTO)} F, payées comptant.
      </p>
      <p>
        <strong>Neuf voitures</strong> (six Essentiel, trois Confort) sont mises à disposition par Afrik Group Consulting, associé de TamCar : aucun capital pour TamCar,
        {n(M.FRAIS_ENTREE)} F d’entrée par véhicule. Le plan recrute en plus <strong>au minimum {NT} voitures de tiers</strong> ({M.N_ESS_T} Essentiel, {M.N_CONF_T} Confort), du mois 4 au mois 12.
      </p>
    </div>
    <div class="card">
      <div class="eyebrow violet">{{{{ico:car}}}} Pourquoi des voitures</div>
      <p>
        Une voiture rapporte <strong>{n(PART['ess'])} à {n(PART['conf'])} F par mois</strong> à TamCar pour {n(M.FRAIS_ENTREE)} F d’entrée : six voitures de tiers
        portent l’excédent de l’année 2 de {mm(R_S['ebe'][1], 1, False)} à {mm(R['ebe'][1], 1, False)}.
      </p>
    </div>
  </div>

  <div class="h-serif">Ce que rapporte chaque véhicule, planchers atteints</div>
  <table class="tbl serre" style="margin-top:8px">
    <colgroup><col style="width:25%"><col style="width:12%"><col style="width:12%"><col style="width:15%"><col style="width:19%"><col style="width:17%"></colgroup>
    <thead><tr><th>Véhicule</th><th>Plancher par jour</th><th>Versement par jour</th><th>Part de TamCar par mois</th><th>Capital engagé</th><th>Récupération</th></tr></thead>
    <tbody>
      {ligne_veh('Moto', 'de TamCar · cédée à 12 mois', VM, M.VERS_MOTO, PART['moto'], f'{n(M.PRIX_MOTO)} comptant', f'{D1(M.PRIX_MOTO / PART["moto"])} mois')}
      {ligne_veh('Tricycle', 'de TamCar · cédé à 36 mois', VT, M.VERS_TRI, PART['tri'], f'{n(M.PRIX_TRICYCLE)} (30 % + {M.MENS_TRICYCLE} mois)', f'{D1(M.PRIX_TRICYCLE / PART["tri"])} mois')}
      {ligne_veh('Voiture Essentiel', 'Afrik Group ou tiers · 36 mois', E, M.VERS_ESS, PART['ess'], 'aucun', f'{n(M.FRAIS_ENTREE)} F d’entrée')}
      {ligne_veh('Voiture Confort', 'Afrik Group ou tiers · 48 mois', C, M.VERS_CONF, PART['conf'], 'aucun', f'{n(M.FRAIS_ENTREE)} F d’entrée')}
    </tbody>
  </table>

  <p class="note" style="margin-top:6px">Un tricycle qui atteint son plancher fait {n(VT * J)} F de courses par mois ; {n(PART['tri'])} F reviennent à TamCar (55 %) et couvrent la mensualité d’achat de {n(TRI_MENS)} F dès {pct(100 * TRI_MENS / PART['tri'])} du plancher. Une moto rembourse son prix en {D1(M.PRIX_MOTO / PART['moto'])} mois ; cédée au bout de 12 mois, elle ne rapporte plus que {n(VM * J * 0.2)} F par mois (20 % du volume).</p>

  <div class="duo">
    <div class="tile vert">
      <div class="ico">{{{{ico:check}}}}</div>
      <h4>La cession au conducteur</h4>
      <p>Le véhicule revient au conducteur <strong>sans paiement supplémentaire</strong> : à 12 mois pour une moto, 36 mois pour un tricycle ou une Essentiel, 48 mois pour une Confort. TamCar garde alors 20 % du volume, contre 25 % à 55 % pendant le contrat. L’équilibre du plan repose donc sur les voitures, pas sur les motos.</p>
    </div>
    <div class="tile rouille">
      <div class="ico" style="background:var(--fond-rouille);color:var(--rouille)">{{{{ico:lock}}}}</div>
      <h4>L’actif est protégé</h4>
      <p>Réserve de propriété écrite et publiée au RCCM, assurance, inspections et <strong>tracker GPS certifié ANATT</strong> payé par TamCar jusqu’à la cession pour ses six véhicules ; pour les voitures, assurance, tracker et entretien sont à la charge de leur propriétaire.</p>
    </div>
  </div>

  <div class="h-serif">Les voitures de tiers : croître sans capital</div>
  <table class="tbl serre" style="margin-top:8px">
    <colgroup><col style="width:44%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:14%"></colgroup>
    <thead><tr><th>Véhicule de tiers : valeur pour TamCar par mois</th><th>Moto</th><th>Tricycle</th><th>Essentiel</th><th>Confort</th></tr></thead>
    <tbody>
      {tr('Planchers atteints', n(M.VALEUR['moto@100']), n(M.VALEUR['tri@100']), n(M.VALEUR['ess@100']), n(M.VALEUR['conf@100']))}
      {tr('Planchers versés à 70 %', n(M.VALEUR['moto@70']), n(M.VALEUR['tri@70']), n(M.VALEUR['ess@70']), n(M.VALEUR['conf@70']))}
      {tr('Nombre minimal à 70 %<small>excédent et trésorerie positifs chaque mois</small>', MIN['moto@70'], MIN['tri@70'], MIN['ess@70'], MIN['conf@70'], cls='cle')}
    </tbody>
  </table>
  <p class="note">Valeur nette de la part du responsable des opérations (3 %) et des postes vacants. Une voiture de tiers qui ne roule pas coûte {n(M.FRAIS_ENTREE)} F d’entrée : le risque est borné, et les voitures sont le levier le plus efficace du plan.</p>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
'''

# ------------------------------------------------------------------ page 6 : lancement, commercial, organisation
OPS1 = M.ops_mensuel(1, False)
p6 = f'''<!-- ============================================================ 6 · COMMERCIAL ET ORGANISATION -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">05</span><h1>Lancement, commercial et organisation</h1></div>

  <div class="h-serif" style="margin-top:12px">Un lancement progressif</div>
  <div class="flow" style="margin-top:9px">
    <div class="st"><i>Mois 0 · décembre 2026</i><b>Levée et commande</b>Constitution de la société, levée de 15 M, commande du tricycle et des cinq motos.</div>
    <div class="st"><i>Mois 1 · janvier 2027</i><b>Cotonou</b>Lancement avec 15 véhicules, dont neuf voitures d’Afrik Group ; trackers posés.</div>
    <div class="st"><i>Mois 4 à 12 · 2027</i><b>Voitures de tiers</b>Au moins six voitures recrutées : environ deux au mois 6, six au mois 11.</div>
    <div class="st"><i>Mois 13 · janvier 2028</i><b>Décision d’extension</b>Parakou, si les critères d’ouverture sont réunis.</div>
  </div>

  <div class="duo">
    <div class="card">
      <div class="eyebrow">{{{{ico:car}}}} Acquérir les conducteurs et les voitures</div>
      <ul class="liste">
        <li>Prospection directe, réseaux de conducteurs, recommandations, partenaires locaux.</li>
        <li>Propriétaires partenaires : un véhicule mis à disposition, 30 % du prix de chaque course et 5 % à la cession.</li>
        <li>Conducteurs aux couleurs de TamCar : casque, gilet et capote personnalisés.</li>
        <li>Aucune promesse de revenu minimum : le conducteur est rémunéré à la course, sur des prix annoncés.</li>
      </ul>
    </div>
    <div class="card">
      <div class="eyebrow violet">{{{{ico:smartphone}}}} Acquérir les passagers</div>
      <ul class="liste">
        <li>Commande par WhatsApp, installable sans boutique d’applications.</li>
        <li>Réseaux sociaux, démonstrations, opérations de lancement dans les zones d’activité.</li>
        <li>Code promo sur la première course des nouveaux clients, plafonné et suivi.</li>
        <li>Parrainage, TamPass et notation du conducteur pour la récurrence.</li>
      </ul>
    </div>
  </div>

  <p class="note" style="margin-top:8px">
    Budget de lancement : 1 000 000 F de marketing (photo, vidéo, sponsoring) et 150 000 F de graphisme au mois 0. Le plan ne budgète ni publicité payante, ni marketing de rue, ni radio.
  </p>

  <div class="h-serif">Une équipe légère</div>
  <div class="card profil" style="margin-top:9px; padding:13px 16px">
    <figure class="portrait">
      <img src="assets/terence-quenum.jpg" alt="Térence Quenum">
      <figcaption><strong>Térence Quenum</strong><span>Fondateur et gérant</span></figcaption>
    </figure>
    <div class="profil-texte">
      <p>
        Juriste d’affaires, il a conçu et développé la plateforme : <strong>quatre applications, {len(G2.tables)} tables, {G2.metier} fonctions métier</strong>
        et environ {G2.arrondi(G2.TS)} lignes de code TypeScript et {G2.arrondi(G2.SQL_L)} lignes de SQL. Il assure la direction générale, la stratégie, les relations avec
        les investisseurs et les partenaires, ainsi que la maintenance technique la première année.
      </p>
      <p>
        Il ne perçoit <strong>aucun salaire en première phase</strong> d’exploitation : sa contribution est apportée au développement de l’entreprise,
        pour préserver la trésorerie de lancement.
      </p>
    </div>
  </div>

  <table class="tbl serre" style="margin-top:10px">
    <thead><tr><th>Fonction</th><th>Rémunération (brut)</th><th>Début</th></tr></thead>
    <tbody>
      <tr><td>Responsable Opérations · Cotonou</td><td>3 % du volume local, plafonné à 150 000 F par mois ({n(OPS1)} F au mois 1, plafond atteint au mois {MOIS_PLAFOND_OPS})</td><td>Mois 1</td></tr>
      <tr><td>Secrétaire-comptable</td><td>100 000 F par mois (comptabilité formelle confiée à un professionnel externe)</td><td>Mois 1</td></tr>
      <tr><td>Développeur</td><td>200 000 F par mois, en prestation ou en recrutement</td><td>Mois 13</td></tr>
      <tr><td>Infrastructure technique</td><td>75 000 F par mois (base de données, hébergement, cartes, notifications)</td><td>Mois 1</td></tr>
      <tr><td>Outil de développement</td><td>75 000 F par mois, jusqu’au mois 12, puis inclus dans la rémunération du développeur</td><td>Mois 1</td></tr>
    </tbody>
  </table>
  <p class="note">La rémunération du responsable des opérations est variable : elle suit le volume de la ville. Au-delà de 5 M F de volume mensuel, un second responsable serait à prévoir.</p>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
'''

# ------------------------------------------------------------------ page 7 : prévisions
def lig_scen(p):
    s, t = M.scen('flotte_actuelle', p), M.scen('avec_tiers', p)
    cls = ' class="cle"' if abs(p - 1.0) < 1e-9 else ''
    cell = lambda r: f"<td>{mm(r['point_bas'], 1)}</td><td>{mm(r['caisse_fin'][2], 1)}</td><td>{mm(r['ebe'][1], 1)}</td>"
    return f'<tr{cls}><td><strong>{pct(100 * p)}</strong></td>{cell(s)}{cell(t)}</tr>'


p7 = f'''<!-- ============================================================ 7 · PRÉVISIONS FINANCIÈRES -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">06</span><h1>Prévisions financières</h1></div>

  <p class="intro">
    Le modèle chiffre la trésorerie de TamCar sur <strong>36 mois</strong> à partir d’une levée de 15 M F encaissée avant le mois 1.
    Deux flottes : la <strong>flotte de départ</strong> (15 véhicules) et la <strong>flotte recrutée</strong> (avec six voitures de tiers au moins). Le scénario de base suppose que les conducteurs versent leurs planchers ; l’analyse fait varier ce taux de 100 % à 50 %.
  </p>

  <table class="tbl serre" style="margin-top:9px">
    <thead><tr><th>Planchers atteints · 36 mois (FCFA)</th><th>Flotte de départ · 15 véhicules</th><th>Flotte recrutée · + {NT} voitures de tiers</th></tr></thead>
    <tbody>
      {tr('Levée de fonds', n(M.LEVEE), n(M.LEVEE))}
      {tr('Revenus de TamCar (courses et versements)', n(REVENUS_S), n(REVENUS_T))}
      {tr('Achat des véhicules de TamCar', n(ACHAT_TRI + ACHAT_MOTOS), n(ACHAT_TRI + ACHAT_MOTOS))}
      {tr('Investissements de démarrage', n(M.DEMARRAGE), n(M.DEMARRAGE))}
      {tr('Charges d’exploitation cumulées', n(M.phase_gen(1, 36, False)['ch'] * 36), n(M.CHARGES_36))}
      {tr('Trésorerie à 36 mois', f"<strong>{sg(CAISSE_S[36])}</strong>", f"<strong>{sg(CAISSE_T[36])}</strong>", cls='cle')}
      {tr('Point bas de trésorerie', f"{sg(min(CAISSE_S))} (mois {CAISSE_S.index(min(CAISSE_S))})", f"{sg(min(CAISSE_T))} (mois {CAISSE_T.index(min(CAISSE_T))})")}
      {tr('Excédent d’exploitation, année 2', n(R_S['ebe'][1]), n(R['ebe'][1]))}
      {tr('Planchers à atteindre pour un excédent positif', pct(100 * SEUIL_S['ebe']), pct(100 * SEUIL_T['ebe']))}
    </tbody>
  </table>

  <div class="h-serif">Trésorerie cumulée, mois par mois</div>
  <div class="schema" style="margin-top:6px; padding:4px 8px">{{{{chart:tresorerie}}}}</div>
  <p class="note">Flotte recrutée : planchers atteints, puis versés à 80 %, 70 % et 60 %. La trésorerie reste positive à chaque niveau.</p>

  <div class="h-serif">Quand les planchers ne sont pas tous versés</div>
  <table class="tbl serre" style="margin-top:8px">
    <thead>
      <tr><th rowspan="2">Taux d’atteinte</th><th colspan="3">Flotte de départ</th><th colspan="3">Flotte recrutée</th></tr>
      <tr><th>Point bas</th><th>Caisse mois 36</th><th>Excédent an 2</th><th>Point bas</th><th>Caisse mois 36</th><th>Excédent an 2</th></tr>
    </thead>
    <tbody>
      {''.join(lig_scen(p) for p in M.TAUX)}
    </tbody>
  </table>

  <div class="callout" style="margin-top:9px">
    <strong>Lecture.</strong> Résultats du modèle à hypothèses données, ni revenus garantis ni promesse de rendement. La caisse tient presque partout, la levée absorbant les écarts :
    la vraie mesure est l’excédent d’exploitation, positif dès {pct(100 * SEUIL_S['ebe'])} des planchers (flotte de départ) ou {pct(100 * SEUIL_T['ebe'])} (avec les voitures de tiers).
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
'''

# ------------------------------------------------------------------ page 8 : charges et fonds
RESERVE = min(CAISSE_T)
AUTRES = M.LEVEE - RESERVE - M.DEMARRAGE - MISE_DEPART
w = lambda v: 100 * v / M.LEVEE
cats_ordre = ['equipe', 'locaux', 'assur', 'presta', 'entree', 'nsia', 'tracker', 'anatt', 'impots']
CH = M.CHARGES_36
lig_ch = ''.join(
    tr(M.CATS[k][0], n(M.cat_total(k)), pct(100 * M.cat_total(k) / CH, 1)) for k in cats_ordre)
MENS_T, MENS_S = M.phase_gen(25, 36, True)['ch'], M.phase_gen(25, 36, False)['ch']
HD = M.HD
p8 = f'''<!-- ============================================================ 8 · CHARGES ET FONDS -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">07</span><h1>Charges et utilisation des fonds</h1></div>

  <div class="row c-1-1 stretch">
    <div>
      <div class="rule-label" style="margin-top:0">Investissements de démarrage · {n(M.DEMARRAGE)} F</div>
      <table class="tbl serre" style="margin-top:7px">
        <thead><tr><th>Poste</th><th>Montant (FCFA)</th><th>Quand</th></tr></thead>
        <tbody>
          <tr><td>Formalisation de la société</td><td>1 500 000</td><td>Mois 0</td></tr>
          <tr><td>ANATT : autorisation</td><td>300 000</td><td>Mois 0</td></tr>
          <tr><td>Juriste : contrats</td><td>100 000</td><td>Mois 0</td></tr>
          <tr><td>Bureau de Cotonou</td><td>500 000</td><td>Mois 0</td></tr>
          <tr><td>Informatique et mobilier</td><td>1 000 000</td><td>Mois 0</td></tr>
          <tr><td>Marketing de lancement</td><td>1 000 000</td><td>Mois 0</td></tr>
          <tr><td>Graphisme</td><td>150 000</td><td>Mois 0</td></tr>
        </tbody>
      </table>
      <p class="note">L’apport en nature de la plateforme (4 M F de dépenses documentées) n’est pas un décaissement. S’y ajoute, au mois 1, la mise de départ de la flotte propre : {n(MISE_DEPART)} F (avance du tricycle, motos, assurances, trackers, frais d’entrée).</p>
    </div>
    <div>
      <div class="rule-label" style="margin-top:0">Charges d’exploitation · 36 mois, flotte recrutée</div>
      <table class="tbl serre" style="margin-top:7px">
        <thead><tr><th>Poste</th><th>FCFA</th><th>Part</th></tr></thead>
        <tbody>
          {lig_ch}
        </tbody>
      </table>
      <p class="note">Soit environ {n(MENS_T)} F par mois à régime établi ({n(MENS_S)} F pour la flotte de départ), dont plus de la moitié pour l’équipe.</p>
    </div>
  </div>

  <div class="callout vert" style="margin-top:9px">
    <strong>Ce que TamCar ne paie pas :</strong> le carburant, l’entretien et les réparations (au conducteur) ; l’assurance, le tracker et l’entretien des voitures (à leur propriétaire) ; les frais de paiement Mobile Money (au client).
    Les rémunérations sont indiquées en brut. Aucune exonération fiscale n’est comptée : l’impôt minimum (254 000 F par an) et la patente sont chiffrés.
  </div>

  <div class="h-serif">Comment les 15 M F sont utilisés</div>
  <p class="intro" style="margin-top:6px">Utilisation de la levée jusqu’au point bas de trésorerie (mois {CAISSE_T.index(RESERVE)}), planchers atteints.</p>
  <p class="bar-label" style="margin-top:8px">Flotte de départ et flotte recrutée <small>· réserve restante : {mm(RESERVE, 1, False)} F</small></p>
  <div class="stack">
    <div class="s1" style="width:{w(M.DEMARRAGE):.1f}%">Démarrage {D1(M.DEMARRAGE / 1e6)} M</div>
    <div class="s2" style="width:{w(MISE_DEPART):.1f}%">Flotte propre {D1(MISE_DEPART / 1e6)} M</div>
    <div class="s3" style="width:{w(AUTRES):.1f}%"></div>
    <div class="s4" style="width:{w(RESERVE):.1f}%">Réserve {D1(RESERVE / 1e6)} M</div>
  </div>
  <div class="legend">
    <span><i style="background:#14B8A6"></i>Investissements de démarrage</span>
    <span><i style="background:#F59E0B"></i>Mise de départ de la flotte propre (avance, motos, assurances, trackers)</span>
    <span><i style="background:#8B5CF6"></i>Exploitation du mois 1 ({D1(AUTRES / 1e6)} M)</span>
    <span><i style="background:#2251CB"></i>Réserve au point bas</span>
  </div>

  <div class="h-serif">Si la levée est inférieure à 15 M F, ou si les voitures ne viennent pas</div>
  <p class="intro" style="margin-top:6px">
    Planchers atteints, flotte recrutée. Avec 5 M, TamCar n’achète aucun véhicule : les véhicules sont ceux des propriétaires.
  </p>
  <table class="tbl serre" style="margin-top:8px">
    <thead><tr><th></th><th>15 M · plan</th><th>10 M</th><th>5 M</th><th>Sans voiture</th></tr></thead>
    <tbody>
      {tr('Flotte achetée par TamCar', '1 tricycle et 5 motos', '1 tricycle et 5 motos', 'Aucun véhicule', '1 tricycle et 5 motos')}
      {tr('Voitures', "9 d’Afrik Group et 6 de tiers", "9 d’Afrik Group et 6 de tiers", "9 d’Afrik Group et 6 de tiers", 'Aucune')}
      {tr('Point bas de trésorerie', mm(min(CAISSE_T), 1), mm(HD['levee_10M']['point_bas'], 1), mm(HD['levee_5M_sans_vehicule']['point_bas'], 1), mm(HD['sans_voitures']['point_bas'], 1))}
      {tr('Trésorerie au mois 36', mm(CAISSE_T[36], 1), mm(HD['levee_10M']['caisse_fin'][2], 1), mm(HD['levee_5M_sans_vehicule']['caisse_fin'][2], 1), mm(HD['sans_voitures']['caisse_fin'][2], 1), cls='cle')}
      {tr('Mois de trésorerie négative', 0, HD['levee_10M']['mois_negatifs'], HD['levee_5M_sans_vehicule']['mois_negatifs'], HD['sans_voitures']['mois_negatifs'])}
    </tbody>
  </table>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
'''

# ------------------------------------------------------------------ page 9 : risques
def ligne_risque(nom, sc, cls=''):
    return tr(nom, mm(sc['point_bas'], 1), mm(sc['caisse_fin'][2], 1), mm(sc['ebe'][1], 1), cls=cls)


S = lambda p, t=True: M.scen('avec_tiers' if t else 'flotte_actuelle', p)
p9 = f'''<!-- ============================================================ 9 · RISQUES -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">08</span><h1>Risques et pilotage</h1></div>

  <p class="intro">
    Une étude juridique des risques a été réalisée, une cartographie établie et une stratégie de réduction élaborée pour chacun.
    Elles se traduisent en procédures, en clauses contractuelles et en indicateurs de suivi.
  </p>

  <table class="tbl txt serre" style="margin-top:9px">
    <thead><tr><th style="width:24%">Risque</th><th style="width:76%">Mesures prévues</th></tr></thead>
    <tbody>
      <tr><td>Encaissement des versements, véhicules vacants</td><td>Taux d’encaissement des planchers suivi chaque mois ; plan correctif sous 90 %, puis sous 80 % ; poste vacant remplacé en moins de 21 jours. Le prélèvement de l’objectif est automatique, mais le portefeuille d’un conducteur peut devenir négatif.</td></tr>
      <tr><td>Voitures : Afrik Group et recrutement</td><td>Afrik Group, associé de TamCar, met neuf voitures à disposition par contrat partenaire ; au moins six voitures de tiers sont recrutées (deux au mois 6, six au mois 11), pour {n(M.FRAIS_ENTREE)} F d’entrée chacune.</td></tr>
      <tr><td>Commissions en espèces</td><td>Commission débitée automatiquement du compte du conducteur ; mise en ligne bloquée au-delà de 5 000 F de dette jusqu’à la recharge Mobile Money ; suspension automatique d’une dette prolongée.</td></tr>
      <tr><td>Casse, vol, détournement</td><td>Assurance, inspections, tracker GPS certifié ANATT, réserve de propriété écrite et publiée au RCCM.</td></tr>
      <tr><td>Engagement TamAssur</td><td>TamCar garantit 250 000 F par année de cotisation : l’écart avec la valeur de rachat du contrat NSIA est un risque porté par TamCar, non chiffré. Confirmation écrite de NSIA avant le lancement, réserve dédiée.</td></tr>
      <tr><td>Concurrence, réglementation</td><td>Prix annoncé sans hausse dynamique, TamAssur et cession du véhicule ; autorisation et trackers de l’ANATT, conformité OHADA, fiscalité chiffrée sans exonération.</td></tr>
      <tr><td>Panne, équipe restreinte</td><td>Suivi de disponibilité, paiement en espèces maintenu en secours, développeur rémunéré dès le mois 13, procédures documentées.</td></tr>
    </tbody>
  </table>

  <div class="h-serif">Ce que coûtent les principaux risques</div>
  <p class="intro" style="margin-top:6px">Avec 15 M F de levée ; un point bas négatif se lit comme un besoin de financement en plus de la levée.</p>
  <table class="tbl serre" style="margin-top:8px">
    <colgroup><col style="width:46%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup>
    <thead><tr><th>Événement</th><th>Point bas de la caisse</th><th>Caisse au mois 36</th><th>Excédent, année 2</th></tr></thead>
    <tbody>
      {ligne_risque('Scénario de base (planchers atteints, flotte recrutée)', S(1.0), cls='cle')}
      {ligne_risque('Voitures de tiers non recrutées', S(1.0, False))}
      {ligne_risque('Planchers versés à 70 % (flotte recrutée)', S(0.7))}
      {ligne_risque('Planchers versés à 70 % (flotte de départ)', S(0.7, False))}
      {ligne_risque('Planchers versés à 50 % (flotte de départ)', S(0.5, False))}
      {ligne_risque('Levée de 5 M, aucun véhicule acheté par TamCar', HD['levee_5M_sans_vehicule'])}
      {ligne_risque('Les neuf voitures d’Afrik Group ne viennent pas', HD['sans_voitures_afrik'])}
      {ligne_risque('Aucune voiture (tricycle et cinq motos seuls)', HD['sans_voitures'])}
    </tbody>
  </table>

  <div class="h-serif">Un pilotage par seuils</div>
  <div class="trio3">
    <div class="tile">
      <div class="ico">{{{{ico:target}}}}</div>
      <h4>L’encaissement décide</h4>
      <p>Excédent d’exploitation positif dès <strong>{pct(100 * SEUIL_S['ebe'])}</strong> des planchers (flotte de départ) et <strong>{pct(100 * SEUIL_T['ebe'])}</strong> (flotte recrutée) ; trésorerie positive jusqu’à {pct(100 * SEUIL_S['caisse'])} et {pct(100 * SEUIL_T['caisse'])}.</p>
    </div>
    <div class="tile vert">
      <div class="ico">{{{{ico:map-pin}}}}</div>
      <h4>Parakou se décide au mois 13</h4>
      <p>Excédent d’exploitation positif trois mois de suite avec un encaissement d’au moins 90 %, 10 M F de trésorerie, flotte de départ et voitures de tiers en service, conducteurs engagés à Parakou.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:users}}}}</div>
      <h4>Les voitures de tiers comblent les creux</h4>
      <p>À 70 % des planchers, il faut {MIN['ess@70']} Essentiel ou {MIN['conf@70']} Confort de tiers pour un excédent et une trésorerie positifs chaque mois, contre {MIN['tri@70']} tricycles ou {MIN['moto@70']} motos.</p>
    </div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
'''

# ------------------------------------------------------------------ page 10 : calendrier et opération
p10 = f'''<!-- ============================================================ 10 · CALENDRIER ET OPÉRATION -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">09</span><h1>Calendrier et opération proposée</h1></div>

  <div class="h-serif" style="margin-top:12px">Les jalons du plan</div>
  <div class="flow" style="margin-top:9px">
    <div class="st"><i>Décembre 2026</i><b>Levée et commande</b>Constitution, apport de la plateforme, commande du tricycle et des motos.</div>
    <div class="st"><i>Janvier 2027</i><b>Lancement</b>Quinze véhicules à Cotonou, trackers posés, premières courses.</div>
    <div class="st"><i>Juin 2027</i><b>Point d’étape</b>Environ deux voitures de tiers ; encaissement d’au moins 90 %.</div>
    <div class="st"><i>Novembre 2027</i><b>Six voitures de tiers</b>Objectif de recrutement atteint.</div>
    <div class="st"><i>Janvier 2028</i><b>Cession des motos</b>Dernière mensualité du tricycle ; développeur ; décision sur Parakou.</div>
  </div>
  <div class="flow vert" style="margin-top:12px">
    <div class="st"><i>Avril 2028</i><b>Impôt minimum</b>254 000 F.</div>
    <div class="st"><i>Janvier 2029</i><b>Renouvellement ANATT</b>280 000 F et patente.</div>
    <div class="st"><i>Janvier 2030</i><b>Cession du tricycle</b>Et des Essentiel d’Afrik Group (36 mois).</div>
    <div class="st"><i>Janvier 2031</i><b>Cession des Confort</b>Fin du premier cycle de la flotte.</div>
  </div>

  <div class="h-serif">Où en est TamCar au 18 octobre 2026</div>
  <div class="duo">
    <div class="card" style="border-top:3px solid var(--vert)">
      <div class="eyebrow vert">{{{{ico:check}}}} Déjà en place</div>
      <ul class="liste">
        <li>La plateforme : passagers (web installable, APK Android), conducteurs, back-office TamCar Office.</li>
        <li>L’objectif quotidien « tout compris » et l’épargne TamAssur, codés dans l’application.</li>
        <li>Une grille de prix sans majoration dynamique, relevée le 30 septembre 2026.</li>
        <li>Les conditions d’utilisation et la politique de confidentialité.</li>
        <li>Un forfait de 1 500 000 F avec l’expert-comptable, commissaire aux apports.</li>
        <li>La dénomination Tam Logistics, disponible ; le paiement Mobile Money (FeexPay) en service.</li>
      </ul>
    </div>
    <div class="card" style="border-top:3px solid var(--bleu)">
      <div class="eyebrow">{{{{ico:clipboard}}}} Avant le mois 1</div>
      <ul class="liste">
        <li>Constituer la SARL et formaliser l’apport de la plateforme.</li>
        <li>Boucler la levée et passer les commandes au plus tard début décembre 2026.</li>
        <li>Signer avec Afrik Group Consulting la mise à disposition des neuf voitures.</li>
        <li>Confirmer par écrit avec NSIA la valeur de rachat du contrat TamAssur, et avec le fournisseur le paiement du tricycle.</li>
        <li>Obtenir l’autorisation ANATT et les trackers certifiés.</li>
        <li>Aménager le bureau de Cotonou ; recruter la secrétaire-comptable et le responsable des opérations.</li>
      </ul>
    </div>
  </div>

  <div class="h-serif">L’opération proposée</div>
  <div class="row c-6-4 stretch" style="margin-top:9px">
    <div class="hero" style="padding:15px 18px">
      <span class="pill">15 000 000 FCFA</span>
      <h2 style="font-size:19px; margin:8px 0 6px">Un investissement en numéraire, <em>pour 40 % du capital.</em></h2>
      <p style="font-size:10.4px; margin-top:6px">
        L’investisseur verse 15 000 000 F pour <strong>40 %</strong> ; la structure du fondateur détient <strong>60 %</strong> par l’apport en nature de la plateforme.
        Cette répartition suppose une plateforme évaluée à 22 500 000 F : la valeur totale des apports est de 37 500 000 F.
      </p>
      <p style="font-size:10.4px">
        L’investissement finance le démarrage et le développement ; il ne rémunère pas l’apport de la plateforme.
      </p>
    </div>
    <div class="card" style="padding:13px 15px">
      <div class="eyebrow violet">{{{{ico:landmark}}}} Évaluation de l’apport</div>
      <p>Un <strong>commissaire aux apports</strong> arrête la valeur (forfait de 1 500 000 F).</p>
      <p style="margin-top:6px">Trois méthodes la situent : coût historique <strong>{mm(G2.A, 0, False)}</strong> ({n(G2.HEURES)} heures), coût de reproduction <strong>{mm(G2.B, 0, False)}</strong>, valeur d’usage <strong>{mm(CVAL, 1, False)}</strong>.</p>
    </div>
  </div>

  <div class="callout" style="margin-top:9px">
    <strong>Gouvernance.</strong> La répartition du capital, les droits des associés, les pouvoirs du gérant, les décisions soumises à approbation collective et les mécanismes de protection des associés
    sont formalisés dans les statuts de Tam Logistics (SARL à constituer) et dans un pacte d’associés. Le plan d’affaires complet, le dossier d’évaluation de l’apport et le classeur de projections
    (TamCar_resultat_complet_v2) sont remis à l’investisseur.
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>

</body>
</html>
'''

html = debut + p4 + p5 + p6 + p7 + p8 + p9 + p10
(ICI / 'resume.html').write_text(html, encoding='utf-8')
print('resume.html : couverture + 9 pages')
