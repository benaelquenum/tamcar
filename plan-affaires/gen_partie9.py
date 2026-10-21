"""Génère partie9.html (Analyse des risques et mesures d'atténuation) — version 6.
Le texte du fondateur est conservé quand il reste vrai ; les risques et les chiffres sont ceux du classeur v2 (modele_v6).
La version 5 (cas A et B, Parakou en pilote) est dans archives/2026-10-03_plan_affaires_v5.
"""
import pathlib

import modele_v6 as M

ICI = pathlib.Path(__file__).parent
n, sg, mm, pct, taux = M.n, M.sg, M.mm, M.pct, M.taux

SEUIL_S, SEUIL_T = M.seuils('flotte_actuelle'), M.seuils('avec_tiers')
HD = M.HD
NT = M.N_ESS_T + M.N_CONF_T
CUM6 = M.ligne(87)[6] + M.ligne(88)[6]
R = {(p, t): M.res(p, t) for p in (1.0, 0.9, 0.8, 0.7, 0.6, 0.5) for t in (True, False)}
POINT_BAS_T = min(M.serie_caisse(1.0, True))
VEH_TAMCAR = M.PRIX_TRICYCLE + M.N_MOTO * M.PRIX_MOTO
TRACKERS = sum(M.annuel(50)[i] + M.annuel(51)[i] for i in (1, 2, 3))
PATENTE = M.h('B50') + M.h('B51') * 12 * M.h('B37')
IMPOTS_36 = M.cat_total('impots')


def tr(*cells, cls=''):
    return f'<tr{" class=" + chr(34) + cls + chr(34) if cls else ""}>' + ''.join(f'<td>{c}</td>' for c in cells) + '</tr>'


def ligne_ev(titre, sous, r):
    return tr(f'<strong>{titre}</strong><small>{sous}</small>', mm(r['point_bas']), mm(r['caisse_fin'][2]), mm(r['ebe'][1]))


pages = []

# =====================================================================================================
# p.1 — 9.1 et 9.2 (les six risques)
pages.append(f'''<!-- ============================================================ 09 · p.1 · 9.1 + 9.2 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">09</span><h1>Analyse des risques et mesures d’atténuation</h1></div>

  <div class="hero" style="margin-top:14px">
    <span class="pill">9.1 · Une approche préventive des risques</span>
    <div class="cols2" style="margin-top:6px">
      <p style="text-align:left">
        Le développement de TamCar repose sur plusieurs facteurs interdépendants : l’adoption de la
        plateforme par les clients, la disponibilité des chauffeurs, la rentabilité de la flotte, la
        fiabilité des outils numériques et le respect des obligations applicables au transport.
      </p>
      <p style="text-align:left">
        Le projet prévoit donc des mesures destinées à anticiper les difficultés, à limiter leurs
        conséquences et à préserver la continuité de l’activité. Une étude juridique des risques
        a été réalisée, une cartographie des risques établie (ci-dessous), et une stratégie de réduction,
        voire d’élimination, de chaque risque élaborée : ces mesures sont traduites en procédures
        opérationnelles, en clauses contractuelles et en indicateurs de suivi.
      </p>
    </div>
  </div>

  <div class="h-serif" style="margin-top:16px">9.2 · Principaux risques identifiés</div>

  <table class="tbl txt" style="margin-top:10px">
    <colgroup><col style="width:22%"><col style="width:28%"><col style="width:50%"></colgroup>
    <thead><tr><th>Risque</th><th>Conséquence possible</th><th>Mesures prévues</th></tr></thead>
    <tbody>
      {tr('Recrutement insuffisant de voitures et de conducteurs',
          'Excédent d’exploitation inférieur aux prévisions : il dépend du recrutement d’au moins six voitures de tiers et de conducteurs pour chaque véhicule',
          f'<span class="modif">Objectif de recrutement du mois 4 au mois 12, suivi chaque mois ; un véhicule de tiers ne coûte que {n(M.FRAIS_ENTREE)} F d’entrée ; responsable des opérations rémunéré à la performance ; conducteurs recrutés avec TamCar (4.3). Le plan reste à l’équilibre sans ces voitures (10.9).</span>')}
      {tr('Activité insuffisante d’un chauffeur',
          'Baisse des recettes et difficulté à couvrir les charges',
          '<span class="modif">Versement minimum quotidien prélevé automatiquement sur le portefeuille du conducteur, suivi du volume de courses,</span> procédure d’avertissement puis de réaffectation du véhicule.')}
      {tr('Difficultés de recouvrement des versements et des commissions en espèces',
          'Retards ou pertes de recettes pour la plateforme',
          'Débit automatique de la commission sur le compte du chauffeur pour chaque course payée en espèces et blocage de la mise en ligne en cas de solde négatif <span class="modif">au-delà d’une tolérance de 5 000 F (6.3)</span>, jusqu’à régularisation ; suspension automatique d’une dette prolongée.')}
      {tr('Casse, vol ou détournement d’un véhicule',
          'Perte financière, interruption du service et difficulté de remboursement',
          'Assurance, inspections périodiques, <span class="modif">traceur GPS certifié ANATT, obligatoire et payé par TamCar jusqu’à la cession pour ses six véhicules, par leur propriétaire pour les voitures (8.4),</span> et encadrement contractuel de la propriété du véhicule jusqu’à la cession complète. <span class="modif">Les réparations et l’entretien sont à la charge du chauffeur (6.4).</span>')}
      {tr('Pression concurrentielle sur les prix',
          'Baisse des marges et difficulté à fidéliser les chauffeurs et les clients',
          'Différenciation par la tarification annoncée à l’avance<span class="modif">, sans hausse dynamique (3.4)</span>, la qualité de service, la fidélisation des chauffeurs et la cession du véhicule au conducteur à l’issue du contrat.')}
      {tr('Risques réglementaires et fiscaux',
          'Retard de lancement, dépenses supplémentaires ou sanctions',
          'Vérification des autorisations requises <span class="modif">(autorisation de transporteur et trackers certifiés de l’ANATT)</span>, conformité des actes de la société, validation juridique des conditions générales d’utilisation et vérification du régime fiscal applicable.')}
    </tbody>
  </table>

  <div class="callout" style="margin-top:12px">
    Ces réponses reprennent les risques et mesures retenus <span class="modif">dès la conception du projet</span>.
    Leur efficacité est mesurée en exploitation par les indicateurs du 9.8.
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# =====================================================================================================
# p.2 — risques complémentaires
pages.append(f'''<!-- ============================================================ 09 · p.2 · risques complémentaires -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">09</span><h1>Analyse des risques et mesures d’atténuation <small>(suite)</small></h1></div>

  <div class="h-serif ajout" style="margin-top:14px">9.2 (suite) · Cinq risques complémentaires</div>
  <p class="intro ajout-in">Cinq autres risques complètent le tableau : l’encaissement des versements, la dépendance aux voitures d’Afrik Group, le financement, l’engagement TamAssur et la fiabilité des outils numériques et de l’équipe. Les trois premiers découlent des parties 7 et 8.</p>

  <table class="tbl txt" style="margin-top:8px">
    <colgroup><col style="width:22%"><col style="width:28%"><col style="width:50%"></colgroup>
    <thead><tr><th>Risque</th><th>Conséquence possible</th><th>Mesures prévues</th></tr></thead>
    <tbody>
      {tr('Encaissement des versements insuffisant, véhicules vacants',
          f'L’excédent d’exploitation n’est positif qu’à partir de {pct(100 * SEUIL_S["ebe"], 0)} des planchers pour la flotte de départ ({pct(100 * SEUIL_T["ebe"], 0)} avec les voitures de tiers) ; la trésorerie reste positive jusqu’à {pct(100 * SEUIL_S["caisse"], 0)} (8.8).',
          'Taux d’encaissement des planchers suivi chaque mois ; plan correctif sous 90 %, puis sous 80 % : recouvrement, remplacement de conducteurs, recrutement de voitures de tiers ; remplacement d’un poste vacant en moins de 21 jours (8.8).',
          cls='ajout-ligne')}
      {tr('Dépendance aux voitures d’Afrik Group',
          f'Sans les neuf voitures, la trésorerie devient négative au mois {HD["sans_voitures"]["premier_mois_negatif"]} et atteint {mm(HD["sans_voitures"]["point_bas"])} au mois 36 (7.9).',
          'Afrik Group Consulting est associé de TamCar ; la mise à disposition des voitures est formalisée dans un contrat partenaire (durée, part du propriétaire, cession, confidentialité). Recrutement de voitures de tiers en parallèle (10.9).',
          cls='ajout-ligne')}
      {tr('Financement et trésorerie',
          f'Point bas de {mm(POINT_BAS_T, 1, False)} au mois 1 avec 15 M ; avec 10 M, {mm(HD["levee_10M"]["point_bas"], 1, False)} ; avec 5 M, la trésorerie devient négative ({mm(HD["levee_5M_sans_vehicule"]["point_bas"], 1)} au mois {HD["levee_5M_sans_vehicule"]["mois_point_bas"]}) (7.9).',
          'Suivi mensuel de la trésorerie ; réserve de 5 M au point bas ; prix et paiement échelonné du tricycle à confirmer avec le fournisseur (8.6) ; plan correctif (réduction des charges, recrutement de voitures).',
          cls='ajout-ligne')}
      {tr('Engagement TamAssur',
          'TamCar garantit 250 000 F par année de contrat, par paliers (moto 12 mois ; autres 24 mois, puis chaque année jusqu’au terme) : l’écart entre cette garantie et la valeur de rachat du contrat NSIA est un risque porté par TamCar, chiffré au premier palier (29 000 F par moto, 48 000 F par autre véhicule, estimations) mais pas aux paliers suivants.',
          'Confirmation écrite de la valeur de rachat avec NSIA avant le lancement ; réserve dédiée ; suivi par conducteur (dates, versements, retards) dans la plateforme.',
          cls='ajout-ligne')}
      {tr('Panne de la plateforme ; dépendance à une équipe restreinte',
          'Courses non commandées ou non payées, perte de confiance ; retard de développement ou d’exploitation si le fondateur ou le développeur devient indisponible ; supervision à revoir au-delà de 5 M F de volume mensuel.',
          'Suivi de la disponibilité et des délais de résolution des incidents (5.7) ; paiement en espèces maintenu en secours ; secrétaire-comptable dès le lancement, responsable des opérations (5.2) ; procédures et code documentés avant l’arrivée du développeur (mois 13) ; second responsable prévu si le volume le justifie.',
          cls='ajout-ligne')}
    </tbody>
  </table>

  <div class="row c-1-1 stretch" style="margin-top:14px">
    <div class="callout ajout">
      <strong>Le risque le plus lourd.</strong> L’encaissement des planchers pèse davantage que tous les coûts : de 100 % à 70 %, l’excédent d’exploitation de l’année 2 de la flotte de départ passe de
      {mm(R[(1.0, False)]['ebe'][1])} à {mm(R[(0.7, False)]['ebe'][1])}.
    </div>
    <div class="callout vert ajout">
      <strong>Ce qui protège le plus.</strong> Les voitures de tiers : à 70 % des planchers, l’excédent de l’année 2 est de {mm(R[(0.7, True)]['ebe'][1])} avec les {NT} voitures, contre
      {mm(R[(0.7, False)]['ebe'][1])} sans elles.
    </div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# =====================================================================================================
# p.3 — coût des risques dans le modèle
pages.append(f'''<!-- ============================================================ 09 · p.3 · coût des risques -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">09</span><h1>Analyse des risques et mesures d’atténuation <small>(suite)</small></h1></div>

  <div class="h-serif ajout" style="margin-top:14px">Ce que coûtent les principaux risques dans le modèle</div>
  <p class="intro">Trésorerie avec 15 M FCFA de levée, planchers atteints et flotte recrutée sauf mention. Un point bas négatif se lit comme un besoin de financement en plus de la levée.</p>
  <table class="tbl ajout" style="margin-top:6px">
    <colgroup><col style="width:46%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup>
    <thead><tr><th>Événement</th><th>Point bas de la caisse</th><th>Caisse au mois 36</th><th>Excédent brut, an 2</th></tr></thead>
    <tbody>
      {ligne_ev('Scénario de base', 'planchers atteints, flotte recrutée', R[(1.0, True)])}
      {ligne_ev('Voitures de tiers non recrutées', 'planchers atteints, flotte de départ', R[(1.0, False)])}
      {ligne_ev('Planchers versés à 80 %', 'flotte recrutée', R[(0.8, True)])}
      {ligne_ev('Planchers versés à 70 %', 'flotte recrutée', R[(0.7, True)])}
      {ligne_ev('Planchers versés à 70 %', 'flotte de départ', R[(0.7, False)])}
      {ligne_ev('Planchers versés à 50 %', 'flotte recrutée', R[(0.5, True)])}
      {ligne_ev('Planchers versés à 50 %', 'flotte de départ', R[(0.5, False)])}
      {ligne_ev('Les neuf voitures d’Afrik Group ne viennent pas', 'avec les six voitures de tiers', HD['sans_voitures_afrik'])}
      {ligne_ev('Aucune voiture', 'tricycle et cinq motos seuls', HD['sans_voitures'])}
      {ligne_ev('Levée de 10 M', 'même flotte', HD['levee_10M'])}
      {ligne_ev('Levée de 5 M', 'aucun véhicule acheté par TamCar', HD['levee_5M_sans_vehicule'])}
    </tbody>
  </table>

  <div class="row c-1-1 stretch" style="margin-top:14px">
    <div class="callout ajout">
      <strong>Ce que montre le tableau.</strong> Avec les voitures de tiers, la caisse tient jusqu’à {pct(100 * SEUIL_T['caisse'], 0)} des planchers : la levée absorbe les écarts. Ce qui se dégrade, c’est l’excédent d’exploitation, c’est-à-dire
      la capacité des versements à couvrir les charges sans consommer la levée.
    </div>
    <div class="callout rouille ajout">
      <strong>Les deux conditions du plan.</strong> Les neuf voitures d’Afrik Group (sans elles, la trésorerie devient négative au mois {HD['sans_voitures']['premier_mois_negatif']})
      et l’encaissement des versements. Les voitures de tiers abaissent de {round(100 * (SEUIL_S['ebe'] - SEUIL_T['ebe']))} points le seuil d’excédent et de {round(100 * (SEUIL_S['net'] - SEUIL_T['net']))} points celui du résultat.
    </div>
  </div>
  <div class="src">Les coûts d’un second responsable des opérations, de la garantie TamAssur aux paliers de 36 mois et au-delà et de l’amortissement de l’apport en nature ne sont pas dans ces chiffres.</div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# =====================================================================================================
# p.4 — 9.3 et 9.4
pages.append(f'''<!-- ============================================================ 09 · p.4 · 9.3 + 9.4 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">09</span><h1>Analyse des risques et mesures d’atténuation <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">9.3 · Maîtriser le risque commercial et territorial</div>
  <div class="card" style="margin-top:10px">
    <div class="cols2">
      <p>
        <span class="modif">Le plan financier se concentre sur Cotonou et le Grand Nokoué, où se trouvent le bureau, le responsable des opérations et les
        véhicules. L’ouverture de Parakou n’est pas comptée dans les projections de base : c’est une extension, décidée sur les résultats de Cotonou et financée
        par la trésorerie dégagée plutôt que par la levée.</span>
      </p>
      <p>
        Cette approche limite l’exposition initiale. Des critères définis à l’avance déclenchent le
        lancement, l’ajustement ou le report de l’extension ; ils portent sur le nombre de courses réalisées, le
        taux d’utilisation des véhicules, les recettes générées et la capacité à recruter puis fidéliser les
        chauffeurs.
      </p>
      <p>
        Le précédent de Gozem à Parakou, qui s’est retiré faute de conducteurs recrutés, montre que la contrainte principale est l’offre de chauffeurs :
        les véhicules de propriétaires partenaires (10.9) y répondent, puisque le véhicule cesse d’être une condition d’entrée.
      </p>
    </div>
  </div>

  <div class="rule-label ajout" style="margin-top:14px">Conditions d’ouverture de Parakou · proposées</div>
  <table class="tbl txt ajout" style="margin-top:8px">
    <colgroup><col style="width:34%"><col style="width:66%"></colgroup>
    <thead><tr><th>Critère</th><th>Condition</th></tr></thead>
    <tbody>
      {tr('Excédent d’exploitation', 'Positif trois mois de suite à Cotonou, avec un taux d’encaissement des planchers d’au moins 90 %')}
      {tr('Trésorerie', 'Au moins 10 M FCFA, soit la trésorerie de départ après le démarrage')}
      {tr('Véhicules', 'La flotte de départ et les six voitures de tiers sont en service')}
      {tr('Conducteurs', 'Un nombre suffisant de conducteurs engagés à Parakou, seuil arrêté au plan opérationnel d’après les premiers résultats de Cotonou')}
    </tbody>
  </table>

  <div class="h-serif" style="margin-top:20px">9.4 · Prévenir les défauts d’activité des chauffeurs</div>
  <div class="card" style="margin-top:10px">
    <div class="cols2">
      <p>
        <span class="modif">Le modèle de flotte prévoit pour chaque véhicule un plancher contractuel de recettes par jour : {n(M.PLANCHER_ESS)} F pour une Essentiel, {n(M.PLANCHER_CONF)} F pour un Confort,
        {n(M.VOL_TRI)} F pour un tricycle et {n(M.VOL_MOTO)} F pour une moto, sur une base de 26 jours travaillés par mois. Le conducteur doit en atteindre 60 % (objectif du jour, cotisation TamAssur comprise) ; la différence éventuelle est prélevée
        chaque nuit sur son portefeuille.</span>
      </p>
      <p>
        Ce seuil est l’engagement contractuel et opérationnel du conducteur ; la demande varie selon les
        jours, les zones et les périodes.
      </p>
      <p>
        Le suivi distingue donc les difficultés temporaires, les problèmes d’affectation
        géographique et les insuffisances persistantes d’activité. Avant toute réaffectation, TamCar
        applique une procédure clairement définie, documentée et conforme aux contrats conclus avec les
        chauffeurs.
      </p>
      <p>
        Les abonnements TamPass contribuent à la récurrence des trajets ; leur effet tient au nombre
        d’abonnés, à la fréquence des déplacements et aux conditions commerciales mises en place.
      </p>
    </div>
  </div>

  <div class="callout ajout" style="margin-top:12px">
    <strong>Le plancher est la base du plan.</strong> Pour que l’excédent d’exploitation reste positif, il faut que les planchers soient versés à au moins
    {pct(100 * SEUIL_S['ebe'], 0)} (flotte de départ) ou {pct(100 * SEUIL_T['ebe'], 0)} (flotte recrutée) ; en dessous, la levée absorbe l’écart (8.8). Un jour non travaillé (panne, maladie)
    est déclaré : rien n’est prélevé et le contrat est prolongé d’autant.
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# =====================================================================================================
# p.5 — 9.5, 9.6
pages.append(f'''<!-- ============================================================ 09 · p.5 · 9.5 + 9.6 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">09</span><h1>Analyse des risques et mesures d’atténuation <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">9.5 · Sécuriser les recettes et les véhicules</div>
  <div class="card" style="margin-top:10px">
    <div class="cols2">
      <p>
        Le recouvrement des commissions est essentiel pour éviter que les courses payées en espèces ne
        créent un décalage entre les montants dus à la plateforme et les sommes effectivement perçues.
      </p>
      <p>
        Le dispositif <span class="modif">décrit en 6.3</span> prévoit le débit automatique de la commission et du versement minimum, et la suspension de la
        mise en ligne lorsque le compte du chauffeur présente un solde négatif non régularisé<span class="modif"> (au-delà de la tolérance
        de 5 000 F)</span>. Le bon fonctionnement de ce mécanisme est contrôlé régulièrement,
        notamment en cas de panne réseau, de paiement incomplet ou de contestation d’une course.
      </p>
      <p>
        La flotte constitue par ailleurs un actif important. Les contrats, les assurances, les inspections
        et le suivi des véhicules<span class="modif">, par trackers GPS certifiés (8.4),</span> réduisent les risques de détournement, de dommages et
        d’immobilisation prolongée. La réserve de propriété <span class="modif">prévue en 6.4</span> est formalisée dans les
        contrats et sécurisée juridiquement jusqu’à la réalisation de la cession.
      </p>
    </div>
  </div>

  <div class="row c-1-1 stretch" style="margin-top:12px">
    <div class="callout ajout">
      <strong>Une protection qui s’écrit et se publie.</strong> Une clause de réserve de propriété est convenue par
      écrit et, pour valoir contre les tiers, publiée au RCCM (Acte uniforme OHADA sur les sûretés, art. 72 et suivants).
      Elle est rédigée dans les contrats de cession.
    </div>
    <div class="callout ajout">
      <strong>Ce que TamCar possède.</strong> Jusqu’à la cession, TamCar est propriétaire de {n(VEH_TAMCAR)} FCFA de véhicules
      (un tricycle et cinq motos) : c’est l’actif que ces mesures protègent. Les voitures appartiennent à leurs propriétaires, qui en assurent la protection.
    </div>
  </div>

  <div class="h-serif" style="margin-top:22px">9.6 · Faire face à la concurrence</div>
  <div class="card" style="margin-top:10px">
    <div class="cols2">
      <p>
        TamCar se différencie par un prix annoncé avant la commande, une expérience numérique
        intégrée, l’accompagnement des chauffeurs et un mécanisme de cession des véhicules aux conducteurs.
      </p>
      <p>
        Cette stratégie ne supprime pas le risque concurrentiel : une baisse de prix d’un concurrent, une
        évolution des habitudes des utilisateurs ou une offre de rémunération plus attractive pour les
        chauffeurs affecte les volumes de courses.
      </p>
      <p>
        TamCar suit donc régulièrement ses tarifs, les délais de prise en charge, les annulations,
        la satisfaction des clients, la fidélité des chauffeurs et la rentabilité par ville. Toute réponse
        concurrentielle est évaluée à partir de ses effets sur les marges et la trésorerie, plutôt
        que par une baisse de prix automatique.
      </p>
    </div>
  </div>

  <div class="row c-1-1 stretch" style="margin-top:12px">
    <div class="callout ajout">
      <strong>Le point de départ est mesuré.</strong> Sur le relevé du 30 septembre 2026, TamCar est de 11 à 25 % plus cher
      que Yango sur la voiture ordinaire et moins cher que Gozem ; sur une course courte, il est de 46 % moins cher
      qu’INAS en voiture (3.4) ; inDrive, limité à la moto, fonctionne sur un prix proposé par le client (3.4.5) ; 4U, basée à Cotonou, est de 8 à 71 % plus
      chère que TamCar sur un trajet de 5,6 km (3.4.6). Le risque tient à cet écart avec Yango, que le prix
      annoncé, sans hausse dynamique, justifie.
    </div>
    <div class="callout rouille ajout">
      <strong>Ce que coûte une baisse de prix.</strong> Les planchers sont exprimés en montants : une baisse de prix ne réduit pas ce que le conducteur doit à TamCar tant que
      son contrat court, mais elle rend le plancher plus difficile à atteindre. À 80 % des planchers versés, l’excédent de l’année 2 est de
      {mm(R[(0.8, True)]['ebe'][1])} avec les voitures de tiers et {mm(R[(0.8, False)]['ebe'][1])} sans elles.
    </div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# =====================================================================================================
# p.6 — 9.7 et 9.8
pages.append(f'''<!-- ============================================================ 09 · p.6 · 9.7 + 9.8 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">09</span><h1>Analyse des risques et mesures d’atténuation <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">9.7 · Respecter les obligations réglementaires et fiscales</div>
  <div class="card" style="margin-top:10px">
    <div class="cols2">
      <p>
        TamCar vérifie les autorisations liées à l’activité de transport,
        les obligations administratives de la société, les règles applicables aux chauffeurs et aux
        véhicules, ainsi que les obligations fiscales et sociales pertinentes.
      </p>
      <p>
        Le <span class="modif">plan prévoit notamment l’autorisation de transporteur et les trackers certifiés de l’ANATT</span>, la conformité des actes de la société au droit
        OHADA et la validation juridique des conditions générales d’utilisation. Ces éléments sont
        confirmés auprès des autorités compétentes et des conseils concernés avant le lancement.
      </p>
      <p>
        Le régime fiscal <span class="modif">retenu</span> est vérifié au regard de la
        situation effective de la société et des textes applicables à la date de son immatriculation.
        Aucune exonération ou facilité fiscale n’est comptée dans le plan avant sa confirmation.
      </p>
    </div>
  </div>

  <div class="row c-1-1 stretch" style="margin-top:12px">
    <div class="callout ajout">
      <strong>Ce que le plan chiffre.</strong> L’autorisation ANATT (300 000 F au démarrage, puis 280 000 F à chaque renouvellement annuel, aux mois 13 et 25), les trackers
      de TamCar ({n(TRACKERS)} F sur 36 mois, 8.4), l’impôt minimum sur les sociétés ({n(M.h('B49'))} F par an) et la patente
      ({n(PATENTE)} F à Cotonou), soit {n(IMPOTS_36)} F d’impôts et taxes sur 36 mois (8.3). Aucune exonération n’est comptée.
    </div>
    <div class="callout rouille ajout">
      <strong>Effet sur le plan.</strong> Les renouvellements de l’autorisation ({n(2 * M.h('B48'))} F aux mois 13 et 25) et les impôts et taxes pèsent sur les mois 13, 16, 25 et 28 :
      ils sont mis en réserve chaque mois dans l’analyse « chaque mois positif » (7.6). L’autorisation seule représente {pct(100 * M.h('B48') / M.LEVEE, 1)} de la levée par an.
    </div>
  </div>

  <div class="h-serif" style="margin-top:20px">9.8 · Organiser le suivi des risques</div>
  <div class="card" style="margin-top:10px">
    <p style="margin-bottom:6px">
      La gestion des risques ne se limite pas à leur identification initiale. TamCar met en
      place un suivi régulier fondé sur des données vérifiables. Les indicateurs prioritaires comprennent :
    </p>
    <ul class="liste deux" style="margin-top:0">
      <li>le nombre de chauffeurs actifs ;</li>
      <li>le nombre de courses réalisées et leur évolution ;</li>
      <li>le volume de courses par véhicule ;</li>
      <li>les annulations, incidents et réclamations ;</li>
      <li>les commissions dues, encaissées et en retard ;</li>
      <li>les véhicules immobilisés <span class="modif">et la durée d’immobilisation (les réparations sont à la charge du chauffeur)</span> ;</li>
      <li>la trésorerie disponible et les échéances à venir ;</li>
      <li>les coûts d’acquisition et de fidélisation des utilisateurs.</li>
    </ul>
    <ul class="liste deux ajout" style="margin-top:8px">
      <li>le taux d’encaissement des planchers (versements encaissés ÷ dus) ;</li>
      <li>les voitures de tiers recrutées et les postes vacants ;</li>
      <li>l’état des trackers : véhicules localisables, renouvellements à l’échéance.</li>
    </ul>
    <p style="margin-top:8px">
      Un tableau de bord mensuel repère les écarts par rapport aux prévisions et décide
      des actions correctives. Les seuils d’alerte ci-dessous sont tirés du modèle, puis ajustés
      sur les données réelles.
    </p>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# =====================================================================================================
# p.7 — seuils et conclusion
pages.append(f'''<!-- ============================================================ 09 · p.7 · conclusion -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">09</span><h1>Analyse des risques et mesures d’atténuation <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">9.8 · Organiser le suivi des risques <small>(suite)</small></div>
  <div class="rule-label ajout" style="margin-top:10px">Seuils d’alerte · tirés du modèle</div>
  <table class="tbl txt ajout" style="margin-top:8px">
    <colgroup><col style="width:30%"><col style="width:32%"><col style="width:38%"></colgroup>
    <thead><tr><th>Indicateur</th><th>Seuil d’alerte</th><th>Décision</th></tr></thead>
    <tbody>
      {tr('Taux d’encaissement des planchers<small>moyenne mensuelle</small>', f'Sous 90 %, puis sous 80 % (excédent négatif sous {pct(100 * SEUIL_T["ebe"], 0)})', 'Vigilance, puis plan correctif : recouvrement, remplacement de conducteurs, recrutement de voitures (8.8)')}
      {tr('Voitures de tiers recrutées', f'Moins de {CUM6} au mois 6 ; moins de {NT} au mois 12', 'Intensifier le recrutement ; différer les dépenses non essentielles (10.9)')}
      {tr('Dette d’un chauffeur', 'Plus de 5 000 F', 'Mise en ligne bloquée jusqu’à la recharge (6.3)')}
      {tr('Poste vacant', 'Plus de 21 jours', 'Recrutement prioritaire ; coût de la cotisation avancée suivi (8.3)')}
      {tr('Trésorerie', 'Sous 8 M FCFA après le mois 12', 'Gel des dépenses de développement ; revue du plan avec l’investisseur')}
    </tbody>
  </table>

  <div class="h-serif" style="margin-top:22px">Conclusion</div>

  <div class="hero" style="margin-top:12px; padding:22px 26px">
    <span class="pill">Conclusion</span>
    <div class="cols2" style="margin-top:8px">
      <p style="text-align:left">
        Les principaux risques de TamCar concernent l’encaissement des versements, le recrutement de véhicules et de conducteurs, la
        protection de la flotte, le recouvrement des commissions, la concurrence et la
        conformité réglementaire. Le projet prévoit déjà plusieurs mécanismes de prévention, notamment le prélèvement automatique du versement minimum, des seuils
        d’alerte chiffrés, l’automatisation du recouvrement
        et le suivi des véhicules<span class="modif"> par trackers GPS certifiés</span>.
      </p>
      <p style="text-align:left">
        Ces mesures sont traduites en procédures concrètes, en engagements contractuels et en
        indicateurs de contrôle ; les performances présentées sont les projections du modèle.
      </p>
    </div>
  </div>

  <div class="rule-label ajout" style="margin-top:16px">Ce que l’investisseur doit retenir de cette partie</div>
  <div class="row c-3 stretch" style="margin-top:8px">
    <div class="tile ajout">
      <div class="ico">{{{{ico:chart}}}}</div>
      <h4>L’encaissement décide</h4>
      <p>Excédent d’exploitation positif dès {pct(100 * SEUIL_S['ebe'], 0)} des planchers avec la flotte de départ, {pct(100 * SEUIL_T['ebe'], 0)} avec six voitures de tiers.</p>
    </div>
    <div class="tile violet ajout">
      <div class="ico">{{{{ico:car}}}}</div>
      <h4>Les voitures sont le levier</h4>
      <p>À 70 % des planchers, six voitures de tiers font passer l’excédent de l’année 2 de {mm(R[(0.7, False)]['ebe'][1])} à {mm(R[(0.7, True)]['ebe'][1])}.</p>
    </div>
    <div class="tile vert ajout">
      <div class="ico">{{{{ico:shield}}}}</div>
      <h4>Le plan est borné</h4>
      <p>Avec 15 M, la trésorerie ne devient jamais négative, planchers atteints ; sans les neuf voitures d’Afrik Group, elle le devient au mois {HD['sans_voitures']['premier_mois_negatif']}.</p>
    </div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

(ICI / 'partie9.html').write_text('\n'.join(pages), encoding='utf-8')
print('partie9.html :', len(pages), 'pages')
