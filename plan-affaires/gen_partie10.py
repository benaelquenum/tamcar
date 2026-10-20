"""Génère partie10.html (Feuille de route et calendrier de déploiement) — version 6.
Le texte du fondateur est conservé quand il reste vrai ; les jalons en mois et les chiffres viennent du classeur v2 (modele_v6).
La version 5 (dix tricycles en deux lots, Parakou au mois 7) est dans archives/2026-10-03_plan_affaires_v5.
"""
import pathlib

import modele_v6 as M

ICI = pathlib.Path(__file__).parent
n, sg, mm, pct, taux = M.n, M.sg, M.mm, M.pct, M.taux

SEUIL_S, SEUIL_T = M.seuils('flotte_actuelle'), M.seuils('avec_tiers')
MIN = M.MIN
NT = M.N_ESS_T + M.N_CONF_T
M_CESS_MOTO = 13                     # motos achetées au mois 1, cédées après 12 mois
M_FIN_MENS = 13                      # dernière mensualité du tricycle (mois 2 à 13)
M_CESS_TRI = 37
M_CESS_ESS = 37
M_CESS_CONF = 49
M_RECRUT_FIN = next(m for m in range(1, 37) if M.ligne(87)[m] + M.ligne(88)[m] >= NT)
CUM6 = M.ligne(87)[6] + M.ligne(88)[6]
MISE_DEPART = (M.ACOMPTE_TRICYCLE + M.MOTOS_COMPTANT + M.annuel(48)[1] + M.annuel(49)[1] + M.annuel(50)[1] + M.annuel(51)[1]
               + M.N_VEHICULES_TAMCAR * M.FRAIS_ENTREE)
POINT_BAS_T = min(M.serie_caisse(1.0, True))
R70, R70_S = M.res(0.7), M.res(0.7, False)
R100, R100_S = M.res(1.0), M.res(1.0, False)
OPS = M.ops_mensuel(24, True)
TRK_M13 = M.h('B18')
DEV = M.h('B33')

MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
LANCEMENT = (2027, 1)                      # mois 1 du modèle : janvier 2027 (décision du fondateur)


def date(m):
    """Mois du modèle -> 'janvier 2027' (mois 0 = décembre 2026)."""
    a, mo = divmod(LANCEMENT[0] * 12 + (LANCEMENT[1] - 1) + (m - 1), 12)
    return f"{MOIS_FR[mo]} {a}"


def Date(m):
    d = date(m)
    return d[0].upper() + d[1:]


def tr(*cells, cls=''):
    return f'<tr{" class=" + chr(34) + cls + chr(34) if cls else ""}>' + ''.join(f'<td>{c}</td>' for c in cells) + '</tr>'


def D1(v):
    return f"{v:.1f}".replace('.', ',')


def val(g, p):
    """Gain mensuel net d'un véhicule de plus (flotte recrutée), régime établi (mois 20)."""
    a = M.SIM.simuler(M.BASE_SANS_NSIA, p, ess=M.N_ESS_T, conf=M.N_CONF_T)
    b = M.SIM.simuler(M.BASE_SANS_NSIA, p, ess=M.N_ESS_T + (g == 'ess'), conf=M.N_CONF_T + (g == 'conf'), tri=int(g == 'tri'), moto=int(g == 'moto'))
    return b['flux'][20] - a['flux'][20]


PLAN = {'ess': M.PLANCHER_ESS, 'conf': M.PLANCHER_CONF, 'tri': M.VOL_TRI, 'moto': M.VOL_MOTO}
NOM = {'ess': 'Essentiel', 'conf': 'Confort', 'tri': 'Tricycle', 'moto': 'Moto'}


def recettes_par_mois(g, p=1.0):
    """Part de TamCar sur un véhicule de tiers, nette de la cotisation TamAssur (fixe, hors taux d'atteinte)."""
    share = M.PART_VOITURE if g in ('ess', 'conf') else 0.25
    return PLAN[g] * M.JOURS * p * share - M.COTIS * M.JOURS


def charges_par_mois(g, p=1.0):
    return 0.03 * PLAN[g] * M.JOURS * p + M.h('B81') / 12 * M.h('B82') * M.h('B80')


pages = []

# =====================================================================================================
# p.1 — 10.1 et 10.2
pages.append(f'''<!-- ============================================================ 10 · p.1 · 10.1 + 10.2 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">10</span><h1>Feuille de route et calendrier de déploiement</h1></div>

  <div class="hero" style="margin-top:14px">
    <span class="pill">10.1 · Objectif de la feuille de route</span>
    <div class="cols2" style="margin-top:6px">
      <p style="text-align:left">
        La feuille de route de TamCar organise le passage de la phase de préparation à l’exploitation
        commerciale, puis à la consolidation du modèle économique et à l’extension progressive de la flotte.
        Elle repose sur une montée en puissance par étapes, afin de maîtriser les dépenses, de valider les
        hypothèses opérationnelles et d’adapter le développement de la plateforme aux résultats obtenus sur
        le terrain.
      </p>
      <p style="text-align:left">
        <span class="modif">Le déploiement initial prévoit une flotte de départ de {M.N_VEHICULES_MOIS1} véhicules à Cotonou et dans le Grand Nokoué : un tricycle et cinq motos achetés par TamCar,
        neuf voitures mises à disposition par Afrik Group Consulting. Le recrutement d’au moins six voitures de tiers suit du mois 4 au mois 12. Porto-Novo est desservie depuis Cotonou (5.2) ;
        Parakou est une extension ultérieure.</span>
        Cette première phase évalue le fonctionnement du dispositif dans <span class="modif">un pôle urbain</span>,
        la capacité de mobilisation des conducteurs et la viabilité économique de l’exploitation.
      </p>
    </div>
  </div>
  <div class="callout" style="margin-top:10px">
    Le calendrier initial du projet couvrait 2026-2029.<span class="modif"> Le lancement est fixé à {date(1)} (mois 1 du modèle) ; le calendrier est actualisé en conséquence (10.6).</span>
  </div>

  <div class="h-serif" style="margin-top:16px">10.2 · Phase 1 — Formalisation juridique et préparation opérationnelle</div>
  <div class="card" style="margin-top:10px">
    <p style="margin-bottom:6px"><strong>Période initialement prévue : troisième trimestre 2026.</strong><span class="modif"> Période retenue : octobre à décembre 2026, avant le lancement de {date(1)}.</span> Cette phase réunit les conditions
    juridiques, financières, matérielles et techniques nécessaires au lancement de TamCar. Les principales actions prévues sont les suivantes :</p>
    <ul class="liste" style="margin-top:0">
      <li>procéder à la constitution de la société d’exploitation sous la forme juridique retenue ;</li>
      <li>organiser l’entrée des investisseurs et formaliser les apports des associés ;</li>
      <li>encadrer juridiquement la mise à disposition ou l’apport de la plateforme numérique à la société ;</li>
      <li>finaliser le financement nécessaire au lancement et à la couverture des premiers besoins de trésorerie ;</li>
      <li>engager <span class="modif">la commande du tricycle (30 % à la commande) et des cinq motos (paiement comptant) ; signer avec Afrik Group Consulting la mise à disposition des neuf voitures</span> ;</li>
      <li>aménager <span class="modif">le bureau de Cotonou</span> ;</li>
      <li>recruter la secrétaire <span class="modif">comptable, le responsable des opérations</span> et les conducteurs ;</li>
      <li>vérifier les autorisations, obligations administratives, fiscales et réglementaires applicables<span class="modif">, dont l’autorisation de transporteur de l’ANATT (300 000 F au démarrage, renouvelée chaque année pour 280 000 F) et les trackers GPS certifiés (8.4)</span>.</li>
    </ul>
    <ul class="liste ajout" style="margin-top:8px">
      <li>boucler la levée et passer les commandes au plus tard début décembre 2026, pour une livraison en {date(1)} ;</li>
      <li>commencer à recruter les propriétaires des voitures de tiers : un premier engagement avant le lancement raccourcit le calendrier ;</li>
      <li>mettre en service le paiement automatique par Mobile Money (FeexPay) avant le lancement ;</li>
      <li>intégrer la commande d’un véhicule de bout en bout par WhatsApp (11.10).</li>
    </ul>
  </div>
  <div class="row c-1-1 stretch" style="margin-top:10px">
    <div class="callout vert">
      <strong>Résultat attendu :</strong> disposer d’une structure juridique opérationnelle, d’un financement sécurisé, d’une équipe
      constituée et d’une plateforme prête pour le déploiement commercial.
    </div>
    <div class="callout ajout">
      <strong>Besoin au mois 0 et au mois 1.</strong> Investissements de démarrage de {n(M.DEMARRAGE)} FCFA au mois 0, puis mise de départ de la flotte propre de
      {n(MISE_DEPART)} FCFA au mois 1, sur une levée de 15 M.
    </div>
  </div>
  <div class="callout" style="margin-top:10px">
    La constitution de la société, l’apport de la plateforme et la commande des véhicules sont coordonnés : TamCar
    ne supporte aucun engagement financier important avant d’avoir sécurisé les ressources nécessaires.
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# =====================================================================================================
# p.2 — 10.3 et 10.4
pages.append(f'''<!-- ============================================================ 10 · p.2 · 10.3 + 10.4 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">10</span><h1>Feuille de route et calendrier de déploiement <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">10.3 · Phase 2 — Lancement commercial et déploiement de la flotte</div>
  <div class="card" style="margin-top:10px">
    <p style="margin-bottom:6px"><strong>Période initialement prévue : quatrième trimestre 2026.</strong><span class="modif"> Période retenue : {date(1)} à {date(6)} (mois 1 à 6).</span> Cette phase correspond au démarrage effectif des activités de transport
    et à la mise en exploitation <span class="modif">des {M.N_VEHICULES_MOIS1} véhicules de la flotte de départ</span>. Les actions prioritaires comprennent :</p>
    <ul class="liste" style="margin-top:0">
      <li>mettre en circulation <span class="modif">le tricycle, les cinq motos et les neuf voitures dès le mois 1</span> ;</li>
      <li>finaliser l’intégration des conducteurs et leur formation à l’utilisation de la plateforme ;</li>
      <li>déployer les outils de suivi de l’activité des conducteurs et des courses<span class="modif">, dont les trackers GPS posés sur les véhicules de TamCar</span> ;</li>
      <li>mettre en place le suivi opérationnel par le responsable des opérations ;</li>
      <li>activer les mécanismes de suivi des commissions et de régularisation des paiements ;</li>
      <li>déployer progressivement les abonnements TamPass destinés aux trajets récurrents ;</li>
      <li>suivre les premières données d’utilisation, les recettes générées et les coûts d’exploitation ;</li>
      <li>recueillir les retours des passagers et des conducteurs afin d’identifier les ajustements nécessaires.</li>
    </ul>
    <ul class="liste ajout" style="margin-top:8px">
      <li>recruter les voitures de tiers : <strong>{M.N_ESS_T} Essentiel et {M.N_CONF_T} Confort au minimum, du mois 4 au mois 12</strong>, soit environ {CUM6} au mois 6 ;</li>
      <li>suivre chaque mois le taux d’encaissement des planchers et les postes vacants (8.8) ;</li>
      <li>ouvrir la commande par WhatsApp : tout le processus de commande, du lieu de départ au suivi de la course, passe par la messagerie que la population connectée utilise déjà (11.10).</li>
    </ul>
    <p style="margin-top:8px">
      <span class="modif">L’automatisation des paiements sera en service avant le lancement.</span> Le déploiement de TamPass suit la disponibilité des
      fonctionnalités correspondantes.<span class="modif"> TamPass existe déjà dans l’application (4.6) ; ses conditions commerciales sont arrêtées au lancement.</span>
    </p>
  </div>
  <div class="callout vert" style="margin-top:10px">
    <strong>Résultat attendu :</strong> faire fonctionner le dispositif sur le terrain, constituer une première base d’utilisateurs et
    recueillir les données nécessaires à l’évaluation du modèle économique.
  </div>

  <div class="h-serif" style="margin-top:18px">10.4 · Phase 3 — Suivi des performances et ajustements</div>
  <div class="card" style="margin-top:10px">
    <p style="margin-bottom:6px"><strong>Période : 2027.</strong><span class="modif"> Période retenue : {date(7)} à {date(24)} (mois 7 à 24).</span> Après le lancement, TamCar privilégie la consolidation de son modèle avant d’engager une
    nouvelle phase d’investissement. Le suivi portera notamment sur :</p>
    <ul class="liste deux" style="margin-top:0">
      <li>le nombre de courses réalisées par véhicule et par jour ;</li>
      <li>le chiffre d’affaires généré ;</li>
      <li>le montant des commissions et des versements effectivement encaissés ;</li>
      <li>le taux d’activité et la régularité des conducteurs ;</li>
      <li>les coûts <span class="modif">d’assurance, de trackers et</span> d’immobilisation des véhicules<span class="modif"> (l’entretien est à la charge du chauffeur)</span> ;</li>
      <li>le niveau des dépenses de fonctionnement de la plateforme ;</li>
      <li>l’évolution de la trésorerie et la capacité à honorer les échéances de financement ;</li>
      <li>l’adoption des fonctionnalités numériques et des abonnements TamPass.</li>
    </ul>
    <p style="margin-top:8px">
      <span class="modif">Une attention particulière est accordée au recrutement des voitures de tiers, achevé au mois {M_RECRUT_FIN}, et à l’encaissement des planchers. Au mois 13, TamCar
      décide d’engager ou non l’extension à Parakou, selon les critères du 9.3.</span>
    </p>
    <p style="margin-top:8px">
      Le calendrier initial prévoit également la poursuite du remboursement des véhicules et la préparation d’un deuxième cycle d’investissement.
      Cette nouvelle phase est engagée après examen des résultats du premier cycle, de la trésorerie disponible et des engagements
      financiers restant à honorer.<span class="modif"> Le solde du tricycle se paie en {M.MENS_TRICYCLE} mensualités : fin au mois {M_FIN_MENS} ({date(M_FIN_MENS)}).</span>
    </p>
  </div>
  <div class="callout vert" style="margin-top:10px">
    <strong>Résultat attendu :</strong> identifier les conditions réelles de rentabilité, corriger les insuffisances du dispositif et établir
    une base de décision pour la croissance future.
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# =====================================================================================================
# p.3 — 10.5 et 10.6
pages.append(f'''<!-- ============================================================ 10 · p.3 · 10.5 + 10.6 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">10</span><h1>Feuille de route et calendrier de déploiement <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">10.5 · Phase 4 — Cession des véhicules et développement du modèle</div>
  <div class="card" style="margin-top:10px">
    <p style="margin-bottom:6px"><strong>Période initialement prévue : 2028-2029.</strong><span class="modif"> Période retenue : {date(25)} à {date(48)} (mois 25 à 48) ; les motos sont cédées dès {date(M_CESS_MOTO)}.</span> Le modèle économique de TamCar prévoit la cession des véhicules aux
    conducteurs selon les modalités contractuelles retenues<span class="modif"> : douze mois pour les motos, trente-six mois pour le tricycle et les voitures Essentiel, quarante-huit mois pour les voitures Confort, sans paiement supplémentaire</span>.</p>
    <p style="margin-bottom:6px">
      Cette évolution permet aux conducteurs concernés d’accéder à la propriété de leur outil de travail, tandis que TamCar
      poursuit son activité de plateforme et perçoit les commissions prévues sur les courses réalisées, selon les conditions applicables après la
      cession.<span class="modif"> Après la cession, TamCar garde 20 % du volume, contre 25 % à 55 % pendant le contrat.</span>
    </p>
    <p style="margin-bottom:6px">La mise en œuvre de cette phase comprend notamment :</p>
    <ul class="liste" style="margin-top:0">
      <li>de vérifier le paiement intégral des sommes dues au titre de chaque véhicule ;</li>
      <li>de respecter les conditions contractuelles de transfert de propriété ;</li>
      <li>de régulariser les formalités administratives correspondantes ;</li>
      <li>de mesurer l’évolution des recettes de TamCar après la fin des remboursements ;</li>
      <li>d’évaluer la capacité de la plateforme à financer son développement sur ses ressources propres ;</li>
      <li>de préparer un deuxième cycle de déploiement, portant initialement sur quinze à vingt véhicules, avec des voitures selon la demande et les moyens disponibles.</li>
    </ul>
    <ul class="liste ajout" style="margin-top:8px">
      <li>d’accueillir en continu des véhicules de propriétaires tiers, qui font croître les recettes sans capital (10.9).</li>
    </ul>
    <p style="margin-top:8px">
      L’extension de la flotte reste progressive : elle suit la demande observée, la disponibilité des conducteurs, la performance
      économique des véhicules et la capacité de TamCar à financer cette croissance sans fragiliser sa trésorerie.
    </p>
  </div>
  <div class="callout vert" style="margin-top:10px">
    <strong>Résultat attendu :</strong> faire évoluer TamCar d’un modèle de lancement fondé sur une première flotte financée vers un modèle d’exploitation
    durable, qui soutient de nouveaux investissements.
  </div>

  <div class="h-serif" style="margin-top:18px">10.6 · Tableau récapitulatif du calendrier</div>
  <table class="tbl txt" style="margin-top:10px">
    <colgroup><col style="width:11%"><col style="width:13%"><col style="width:46%"><col style="width:30%"></colgroup>
    <thead><tr><th>Phase</th><th>Période initiale</th><th>Principales réalisations attendues</th><th class="ajout-col">Calendrier retenu</th></tr></thead>
    <tbody>
      <tr><td>Phase 1</td><td>T3 2026</td><td>Constitution, financement, préparation du bureau, recrutement et préparation technique</td><td class="ajout-col">Octobre à décembre 2026, avant le mois 1 (mois 0 : levée, commandes)</td></tr>
      <tr><td>Phase 2</td><td>T4 2026</td><td>Lancement commercial, mise en circulation de <span class="modif">la flotte de départ ({M.N_VEHICULES_MOIS1} véhicules)</span>, début du recrutement des voitures de tiers et activation des outils opérationnels</td><td class="ajout-col">{Date(1)} à {date(6)} (mois 1 à 6)</td></tr>
      <tr><td>Phase 3</td><td>2027</td><td>Suivi des performances, fin du recrutement des voitures de tiers, décision sur l’extension et consolidation financière</td><td class="ajout-col">{Date(7)} à {date(24)} (mois 7 à 24), dont la décision d’extension en {date(13)}</td></tr>
      <tr><td>Phase 4</td><td>2028-2029</td><td>Cession des véhicules, évaluation du modèle et préparation de l’expansion</td><td class="ajout-col">{Date(25)} à {date(48)} (mois 25 à 48) : tricycle et Essentiel en {date(M_CESS_TRI)}, Confort en {date(M_CESS_CONF)}</td></tr>
    </tbody>
  </table>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# =====================================================================================================
# p.4 — jalons + 10.7
jalons = [
    ('Mois 0', 'Levée de 15 M FCFA, constitution, investissements de démarrage, commande du tricycle et des motos', f'{n(M.DEMARRAGE)} F'),
    ('Mois 1', 'Livraison du tricycle et des motos, trackers posés, lancement avec 15 véhicules (neuf voitures comprises)', f'Mise de départ de la flotte propre : {n(MISE_DEPART)} F'),
    ('Mois 4', 'Début du recrutement des voitures de tiers', f'{n(M.FRAIS_ENTREE)} F d’entrée par véhicule'),
    ('Mois 6', 'Point d’étape du recrutement et de l’encaissement', f'{CUM6} voitures de tiers environ ; taux d’encaissement d’au moins 90 %'),
    (f'Mois {M_RECRUT_FIN}', 'Six voitures de tiers en service', f'Excédent d’exploitation positif dès {pct(100 * SEUIL_T["ebe"], 0)} des planchers'),
    ('Mois 13', 'Cession des cinq motos ; dernière mensualité du tricycle ; développeur ; renouvellement de l’autorisation ANATT, patente ; décision d’extension (Parakou)', f'{n(DEV)} F par mois ; {n(M.h("B48"))} F de renouvellement ANATT'),
    ('Mois 16', 'Impôt minimum sur les sociétés', f'{n(M.h("B49"))} F'),
    ('Mois 25', 'Second renouvellement ANATT et patente', f'{n(M.h("B48"))} F + patente'),
    (f'Mois {M_CESS_TRI}', 'Cession du tricycle et des voitures Essentiel d’Afrik Group (36 mois)', 'TamCar ne garde que 20 % du volume'),
    (f'Mois {M_CESS_CONF}', 'Cession des voitures Confort d’Afrik Group (48 mois)', 'Fin du premier cycle de la flotte'),
]


def _quand(a):
    import re
    ms = [int(x) for x in re.findall(r'\d+', a)]
    return ' et '.join(date(m) for m in ms)


lignes_j = ''.join(tr(f'<strong>{a}</strong><small>{_quand(a)}</small>', b, c) for a, b, c in jalons)

pages.append(f'''<!-- ============================================================ 10 · p.4 · jalons + 10.7 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">10</span><h1>Feuille de route et calendrier de déploiement <small>(suite)</small></h1></div>

  <div class="h-serif ajout" style="margin-top:14px">Les jalons du modèle, en mois</div>
  <p class="intro ajout-in">Le mois 1 est celui de la livraison des véhicules et du lancement. Il tombe en {date(1)}.</p>
  <table class="tbl txt ajout" style="margin-top:8px">
    <colgroup><col style="width:15%"><col style="width:52%"><col style="width:33%"></colgroup>
    <thead><tr><th>Quand</th><th>Jalon</th><th>Chiffre du modèle</th></tr></thead>
    <tbody>
      {lignes_j}
    </tbody>
  </table>

  <div class="h-serif" style="margin-top:20px">10.7 · Conditions de passage d’une phase à l’autre</div>
  <div class="card" style="margin-top:10px">
    <p>
      Le calendrier est la trajectoire prévisionnelle du plan. Le passage à chaque phase est conditionné par
      l’atteinte de critères vérifiables.
    </p>
    <p style="margin-top:6px">
      Avant le lancement commercial, TamCar sécurise son financement, vérifie la conformité de son dispositif réglementaire,
      confirme la disponibilité des véhicules et teste les fonctionnalités indispensables à l’exploitation.
    </p>
    <p style="margin-top:6px">
      Avant de préparer un deuxième cycle d’investissement, la société dispose de données fiables sur le volume de courses, les
      commissions encaissées, les charges réelles, les incidents opérationnels et la trésorerie.
    </p>
    <p style="margin-top:6px">
      Enfin, avant toute cession de véhicule, les obligations contractuelles, les sommes restant dues et les formalités de transfert sont
      vérifiées individuellement.
    </p>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# =====================================================================================================
# p.5 — 10.7 critères + 10.8
pages.append(f'''<!-- ============================================================ 10 · p.5 · 10.8 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">10</span><h1>Feuille de route et calendrier de déploiement <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">10.7 · Conditions de passage d’une phase à l’autre <small>(suite)</small></div>
  <div class="rule-label ajout" style="margin-top:14px">Critères chiffrés de passage · tirés du modèle</div>
  <table class="tbl txt ajout" style="margin-top:8px">
    <colgroup><col style="width:30%"><col style="width:16%"><col style="width:54%"></colgroup>
    <thead><tr><th>Décision</th><th>Quand</th><th>Critère</th></tr></thead>
    <tbody>
      {tr('Poursuivre le recrutement de voitures', f'Mois 6<small>{date(6)}</small>', f'Au moins {CUM6} voitures de tiers en service et un taux d’encaissement des planchers d’au moins 90 % ; sinon, plan correctif (8.8)')}
      {tr('Engager l’extension (Parakou)', f'Mois 13<small>{date(13)}</small>', 'Critères du 9.3 : excédent d’exploitation positif trois mois de suite, trésorerie d’au moins 10 M FCFA, six voitures de tiers en service')}
      {tr('Recruter un second responsable des opérations', 'Quand le volume mensuel dépasse 5 M F', f'Le plafond de {n(OPS)} F du responsable est atteint ; le volume supplémentaire n’est plus rémunéré à 3 %')}
      {tr('Préparer un deuxième cycle', f'Après le mois {M_FIN_MENS}<small>{date(M_FIN_MENS)}</small>', 'Trésorerie positive, tricycle remboursé, données fiables sur trois mois de suite')}
    </tbody>
  </table>

  <div class="h-serif" style="margin-top:22px">10.8 · État d’avancement et calendrier retenu</div>
  <div class="hero" style="margin-top:12px; padding:20px 26px">
    <span class="pill">Calendrier</span>
    <div class="cols2" style="margin-top:6px">
      <p style="text-align:left">
        Le calendrier initial situait la formalisation et la préparation du projet au troisième trimestre 2026, puis le lancement au quatrième
        trimestre de la même année. Au 20 octobre 2026, l’état d’avancement de chaque action est établi ci-dessous et le lancement est
        fixé à janvier 2027.
      </p>
      <p style="text-align:left">
        Les étapes déjà réalisées sont identifiées comme telles ; les autres sont reprogrammées en fonction du financement disponible, des
        délais de constitution de la société, de la commande des véhicules et de la préparation technique. Cette actualisation donne un
        calendrier cohérent avec les moyens mobilisables par TamCar.
      </p>
    </div>
  </div>

  <div class="rule-label ajout" style="margin-top:16px">État d’avancement au 20 octobre 2026 · d’après ce que contient déjà le plan</div>
  <div class="row c-1-1 stretch" style="margin-top:8px">
    <div class="card ajout">
      <div class="eyebrow vert">{{{{ico:shield}}}} Déjà en place</div>
      <ul class="liste" style="margin-top:6px">
        <li>La plateforme : passagers (web installable, APK Android), chauffeurs, back-office (4.1).</li>
        <li>Le versement quotidien, l’objectif tout compris et l’épargne TamAssur garantie par TamCar (par paliers annuels), programmés et testés.</li>
        <li>L’espace des propriétaires partenaires : gains en direct, relevé mensuel par véhicule, demande de versement avec facture normalisée et retenue d’AIB, fiche numérique du véhicule (assurance, visite technique, suspension automatique en cas d’échéance dépassée) et règlement du fonds de rachat en fin de contrat.</li>
        <li>Une grille de prix sans majoration dynamique, relevée le 30 septembre 2026 (3.4).</li>
        <li>Les conditions générales et la politique de confidentialité, à jour.</li>
        <li>Un forfait de 1 500 000 FCFA avec le commissaire aux apports (2.3).</li>
        <li>Les relevés de prix ANATT (autorisation, trackers), faits en juillet 2026.</li>
        <li>La dénomination Tam Logistics, disponible.</li>
        <li>Les prix et le calendrier de livraison des véhicules, confirmés avec le fournisseur ; le paiement du tricycle (30 % puis 12 mois) est à confirmer.</li>
        <li>Les voitures d’Afrik Group Consulting, associé : accord de principe ; contrat partenaire rédigé.</li>
      </ul>
    </div>
    <div class="card ajout">
      <div class="eyebrow rouille">{{{{ico:clipboard}}}} À faire avant le mois 1</div>
      <ul class="liste rouille" style="margin-top:6px">
        <li>Constituer la SARL Tam Logistics et formaliser l’apport de la plateforme.</li>
        <li>Sécuriser la levée de 15 M FCFA.</li>
        <li>Commander le tricycle et les motos, au plus tard début décembre 2026.</li>
        <li>Obtenir l’autorisation de transporteur ANATT et les trackers.</li>
        <li>Mettre en service le paiement automatique par Mobile Money (FeexPay).</li>
        <li>Intégrer la commande d’un véhicule de bout en bout par WhatsApp (11.10).</li>
        <li>Aménager le bureau de Cotonou ; recruter la secrétaire-comptable et le responsable des opérations.</li>
        <li>Signer le contrat partenaire d’Afrik Group et les contrats chauffeurs ; confirmer par écrit la garantie TamAssur avec NSIA.</li>
      </ul>
    </div>
  </div>

  <div class="callout ajout" style="margin-top:12px">
    <strong>Calendrier retenu : lancement en {date(1)}.</strong> Flotte de départ en {date(1)}, voitures de tiers de {date(4)} à {date(M_RECRUT_FIN)}, cession des motos et dernière mensualité du tricycle en {date(M_CESS_MOTO)},
    cession du tricycle et des voitures Essentiel en {date(M_CESS_TRI)}, des Confort en {date(M_CESS_CONF)}.
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# =====================================================================================================
# p.6 — 10.9 véhicules de tiers
ACT = [(1.0, 'Planchers atteints'), (0.8, '80 %'), (0.7, '70 %'), (0.5, '50 %'), (0.0, 'Aucun versement')]
lignes_activite = ''.join(tr(nom, *[n(val(g, f)) for g in ('ess', 'conf', 'tri', 'moto')]) for f, nom in ACT)


def ligne_veh(g):
    r, c = recettes_par_mois(g), charges_par_mois(g)
    return tr(f'<strong>{NOM[g]}</strong>', n(r), n(c), n(r - c), f'{D1(r / c)}')


pages.append(f'''<!-- ============================================================ 10 · p.6 · 10.9 véhicules de tiers -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">10</span><h1>Feuille de route et calendrier de déploiement <small>(suite)</small></h1></div>

  <div class="h-serif ajout" style="margin-top:14px">10.9 · Croissance par les véhicules de propriétaires tiers</div>

  <div class="hero" style="margin-top:12px; padding:18px 24px 16px">
    <span class="pill">Réponse</span>
    <div class="cols2" style="margin-top:6px">
      <p style="text-align:left">
        Avec des véhicules qui ne lui appartiennent pas, TamCar augmente ses recettes bien plus que ses charges. Une voiture Essentiel de propriétaire tiers lui rapporte
        <strong>{n(recettes_par_mois('ess'))} F par mois</strong> (25 % de {n(M.PLANCHER_ESS * M.JOURS)} F de courses, moins {n(M.COTIS * M.JOURS)} F de cotisation TamAssur) et lui coûte {n(charges_par_mois('ess'))} F
        (responsable des opérations à 3 % et vacance d’un poste) : <strong>{D1(recettes_par_mois('ess') / charges_par_mois('ess'))} F de recettes pour 1 F de charges</strong>.
      </p>
      <p style="text-align:left">
        La raison : l’équipe, le bureau et la plateforme existent déjà. Le véhicule de tiers ne demande ni achat, ni assurance, ni
        mensualité, ni tracker. Au pire, s’il ne roule pas, il coûte {n(M.FRAIS_ENTREE)} F de frais d’entrée ; un tricycle acheté qui ne roule pas engage {n(M.PRIX_TRICYCLE)} F.
      </p>
    </div>
  </div>

  <div class="h-serif" style="margin-top:14px">Un véhicule de plus, par mois, planchers atteints (en FCFA)</div>
  <table class="tbl ajout" style="margin-top:8px">
    <colgroup><col style="width:28%"><col style="width:18%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup>
    <thead><tr><th>Véhicule de propriétaire tiers</th><th>Recettes de TamCar</th><th>Charges liées au véhicule</th><th>Résultat par mois</th><th>Recettes pour 1 F de charges</th></tr></thead>
    <tbody>
      {ligne_veh('conf')}
      {ligne_veh('ess')}
      {ligne_veh('tri')}
      {ligne_veh('moto')}
    </tbody>
  </table>
  <div class="src">Hypothèse à confirmer : un tricycle ou une moto de tiers rapporte 25 % du volume plancher à TamCar, comme une voiture, moins la cotisation TamAssur de {n(M.COTIS)} F par jour (comprise dans l’objectif du conducteur, financée par la part de TamCar). Les charges sont la part du responsable des opérations (3 % du volume) et le coût d’un poste vacant ({n(M.h('B81') / 12 * M.h('B82') * M.h('B80'))} F par mois). Chaque véhicule coûte aussi {n(M.FRAIS_ENTREE)} F d’entrée, une fois.</div>

  <div class="h-serif" style="margin-top:14px">Si le véhicule est moins encaissé que prévu · résultat mensuel net (en FCFA)</div>
  <table class="tbl ajout" style="margin-top:8px">
    <colgroup><col style="width:28%"><col style="width:18%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup>
    <thead><tr><th>Taux d’atteinte du plancher</th><th>Essentiel</th><th>Confort</th><th>Tricycle</th><th>Moto</th></tr></thead>
    <tbody>
      {lignes_activite}
    </tbody>
  </table>
  <div class="src">Même sans aucun versement, un véhicule de tiers coûte à TamCar {n(abs(val('ess', 0.0)))} F par mois (la cotisation TamAssur et le poste vacant), plus le manque éventuel au rachat NSIA ({n(M.NSIA_24)} F, une fois) : le risque est borné par les {n(M.FRAIS_ENTREE)} F d’entrée et ce coût, tant que le véhicule n’est pas retiré.</div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# =====================================================================================================
# p.7 — 10.9 (suite)
def ligne_flotte(nom):
    a, b = M.COMBOS[f'{nom}@100'], M.COMBOS[f'{nom}@70']
    return tr(f'<strong>{nom}</strong>', mm(a['ebe'][1]), mm(b['ebe'][1]), mm(b['caisse_fin'][2]), 'oui' if b['chaque_mois'] else 'non')


pages.append(f'''<!-- ============================================================ 10 · p.7 · 10.9 (suite) -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">10</span><h1>Feuille de route et calendrier de déploiement <small>(suite)</small></h1></div>

  <div class="h-serif ajout" style="margin-top:14px">10.9 · Croissance par les véhicules de propriétaires tiers <small>(suite)</small></div>

  <p class="intro ajout-in">Ce que change le recrutement, en plus de la flotte de départ. Arrivées régulières du mois 4 au mois 12, en FCFA.</p>
  <table class="tbl ajout" style="margin-top:8px">
    <colgroup><col style="width:34%"><col style="width:17%"><col style="width:17%"><col style="width:17%"><col style="width:15%"></colgroup>
    <thead><tr><th>Véhicules de tiers recrutés</th><th>Excédent, an 2, planchers atteints</th><th>Excédent, an 2, à 70 %</th><th>Caisse au mois 36, à 70 %</th><th>Positif chaque mois, à 70 % ?</th></tr></thead>
    <tbody>
      {tr('<strong>Aucun</strong><small>flotte de départ</small>', mm(R100_S['ebe'][1]), mm(R70_S['ebe'][1]), mm(R70_S['caisse_fin'][2]), 'non')}
      {ligne_flotte('3 Essentiel + 3 Confort')}
      {ligne_flotte('6 Essentiel')}
      {ligne_flotte('5 Essentiel + 5 Confort')}
      {ligne_flotte('10 motos + 3 tricycles + 2 Essentiel')}
    </tbody>
  </table>

  <div class="h-serif" style="margin-top:14px">Combien de véhicules pour un excédent positif chaque mois ?</div>
  <table class="tbl ajout" style="margin-top:8px">
    <colgroup><col style="width:28%"><col style="width:18%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup>
    <thead><tr><th>Taux d’atteinte des planchers</th><th>Motos</th><th>Tricycles</th><th>Essentiel</th><th>Confort</th></tr></thead>
    <tbody>
      {''.join(tr(f'<strong>{p} %</strong>', *[('—' if MIN[f"{g}@{p}"] is None else MIN[f"{g}@{p}"]) for g in ('moto', 'tri', 'ess', 'conf')]) for p in (100, 90, 80, 70))}
    </tbody>
  </table>
  <div class="src">Nombre minimal de véhicules d’un seul type pour que l’excédent d’exploitation et le flux de caisse restent positifs chaque mois à partir du mois 13, les charges annuelles étant mises en réserve chaque mois.</div>

  <div class="row c-1-1 stretch ajout" style="margin-top:12px">
    <div class="callout vert">
      <strong>Ce que cela règle.</strong> À 70 % des planchers, trois Essentiel et trois Confort de plus portent l’excédent d’exploitation de l’année 2 de {mm(R70_S['ebe'][1])} à {mm(R70['ebe'][1])} :
      cela ne suffit plus à le rendre positif ({'—' if MIN['ess@70'] is None else MIN['ess@70']} Essentiel ou {'—' if MIN['conf@70'] is None else MIN['conf@70']} Confort seraient nécessaires, à lui seul) ; à partir de {M.pct(100 * M.seuils('avec_tiers')['ebe'], 0)} des planchers, il l’est. Aucun nombre de motos n’y suffit : la cotisation TamAssur dépasse leur part.
    </div>
    <div class="callout rouille">
      <strong>Ce que cela suppose.</strong> Des propriétaires et des conducteurs à recruter (Parakou a montré la difficulté) ; le tracker GPS, l’assurance et l’entretien à la charge du propriétaire ;
      un second responsable des opérations au-delà de 5 M F de volume mensuel ; une exposition TamAssur par conducteur (250 000 F garantis par année de contrat, par paliers ; manque au rachat chiffré au premier palier).
    </div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

(ICI / 'partie10.html').write_text('\n'.join(pages), encoding='utf-8')
print('partie10.html :', len(pages), 'pages')
