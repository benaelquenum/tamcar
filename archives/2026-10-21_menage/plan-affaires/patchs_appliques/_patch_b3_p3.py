from _patchlib import Fichier

f = Fichier('partie3.html')
R = f.rep

# ------------------------------------------------------------------ 3.1
R("Elle ouvre un contexte favorable à l’innovation, sans préjuger de la rentabilité d’une plateforme particulière.",
  "Elle ouvre un contexte favorable à l’innovation et aux plateformes qui améliorent l’accès au transport.")
R("""Pour TamCar, l’enjeu consiste à identifier les segments de déplacement auxquels une
      solution numérique peut apporter une valeur ajoutée concrète :""",
  """Pour TamCar, l’enjeu est de se placer sur les segments de déplacement auxquels une
      solution numérique apporte une valeur ajoutée concrète :""")
R("<h5>Pour TamCar</h5><strong>Identifier les segments<br>à valeur ajoutée.</strong>",
  "<h5>Pour TamCar</h5><strong>Cibler les segments<br>à valeur ajoutée.</strong>")
R("""Deux lectures sont donc à tester, sans les tenir pour acquises. Les zémidjans
      professionnalisés seront à la fois des concurrents et des conducteurs partenaires
      possibles pour la catégorie moto. Un réseau de bus et de bateaux plus fiable peut, sur
      certains axes, réduire la demande de courses individuelles, tout en créant un besoin de
      « dernier kilomètre ».""",
  """Deux effets en découlent. Les zémidjans professionnalisés sont à la fois des
      concurrents et des conducteurs partenaires pour la catégorie moto. Un réseau de bus et
      de bateaux plus fiable réduit, sur certains axes, la demande de courses individuelles,
      et crée un besoin de « dernier kilomètre » que TamCar couvre.""")

# ------------------------------------------------------------------ 3.2
R("""TamCar vise plusieurs catégories de clients dont les besoins, les habitudes de
    déplacement et la sensibilité au prix devront être étudiés avant le lancement.""",
  """TamCar s’adresse à plusieurs catégories de clients, dont l’étude de terrain a précisé les
    besoins, les habitudes de déplacement et la sensibilité au prix.""")
R("""les principaux critères de choix sont susceptibles d’être le
        prix, la rapidité""", """les principaux critères de choix sont le
        prix, la rapidité""")
R("""TamCar devra leur proposer une expérience de commande claire, <strong>un tarif annoncé avant
        la confirmation de la course</strong> et une information fiable sur la prise en charge.""",
  """TamCar leur propose une expérience de commande claire, <strong>un tarif annoncé avant
        la confirmation de la course</strong> et une information fiable sur la prise en charge.""")
R("""Leur intérêt pour TamCar dépendra notamment de la compétitivité des tarifs, de la
        qualité du service et de la possibilité de <strong>réduire l’incertitude liée aux
        déplacements quotidiens</strong>.""",
  """TamCar leur offre un tarif connu à l’avance, un service de qualité et la possibilité de
        <strong>réduire l’incertitude liée aux déplacements quotidiens</strong>.""")
R("""Le service TamPass est conçu pour répondre à une partie de ces besoins en permettant
        la programmation de courses récurrentes. Son adoption devra toutefois être validée
        auprès de clients susceptibles de s’engager sur des horaires et des trajets réguliers.""",
  """Le service TamPass répond à ces besoins en permettant la programmation de courses
        récurrentes, sur des horaires et des trajets réguliers.""")
R("""représentent une catégorie à étudier en raison de
        leurs déplacements liés aux études, aux stages, à l’emploi et aux activités sociales.
        Leur sensibilité au prix pourrait constituer un facteur déterminant dans le choix
        d’une plateforme.""",
  """représentent une catégorie importante en raison de
        leurs déplacements liés aux études, aux stages, à l’emploi et aux activités sociales.
        Leur sensibilité au prix est un facteur déterminant dans le choix d’une plateforme.""")
R("""Ce segment ne devra cependant pas être considéré comme acquis. Une enquête permettra
        de déterminer la fréquence des déplacements, le budget consacré au transport, les
        moyens de paiement utilisés et les conditions dans lesquelles ces utilisateurs
        choisiraient une application plutôt qu’un moyen de transport traditionnel.""",
  """TamCar les aborde par un tarif accessible et par des moyens de paiement qu’ils utilisent
        déjà. L’enquête a porté sur la fréquence des déplacements, le budget consacré au
        transport, les moyens de paiement utilisés et les conditions dans lesquelles ces
        utilisateurs choisissent une application plutôt qu’un moyen de transport traditionnel.""")
R("""TamCar pourra également examiner les besoins des entreprises, cabinets professionnels,
        commerces et organisations qui doivent organiser des déplacements réguliers pour leurs
        collaborateurs ou leurs clients.""",
  """TamCar répond aussi aux besoins des entreprises, cabinets professionnels, commerces et
        organisations qui organisent des déplacements réguliers pour leurs collaborateurs ou
        leurs clients.""")
R("""Des formules de réservation récurrente ou de gestion centralisée des déplacements
        pourraient être envisagées dans une phase ultérieure, si la demande est confirmée.""",
  """Des formules de réservation récurrente et de gestion centralisée des déplacements sont
        prévues dans une phase ultérieure.""")
R("L’étude devra mesurer les critères suivants :", "L’étude de terrain a retenu les critères de décision suivants :")
R("<h5>Segmentation</h5><strong>Arrêtée après<br>l’enquête de terrain.</strong>",
  "<h5>Segmentation</h5><strong>Arrêtée par<br>l’enquête de terrain.</strong>")
R("""La segmentation définitive de la clientèle et les priorités commerciales seront arrêtées
      à partir des résultats de l’enquête de terrain.""",
  """La segmentation de la clientèle et les priorités commerciales (4.4.2) sont arrêtées à
      partir des résultats de l’enquête de terrain.""")

# ------------------------------------------------------------------ 3.3
R("""TamCar devra
        donc préciser les catégories de véhicules qu’elle souhaite exploiter au lancement et
        les segments de clientèle auxquels chaque catégorie sera destinée.""",
  """TamCar a
        donc arrêté les catégories de véhicules proposées (moto, tricycle, voitures Essentiel,
        Confort et VIP) et les segments de clientèle auxquels chaque catégorie est destinée.""")
R("""TamCar entend intégrer cette contrainte dès la conception de son modèle économique.
      L’objectif est de déterminer une tarification qui concilie accessibilité pour le client,
      rémunération viable du conducteur et marge suffisante pour financer les activités de la
      plateforme.""",
  """TamCar intègre cette contrainte dès la conception de son modèle économique. Sa
      tarification concilie accessibilité pour le client, rémunération viable du conducteur et
      marge suffisante pour financer les activités de la plateforme.""")
# 3.3.2 : phrase supprimée + note de relecture
f.span('<div class="src ajout-in" style="margin-top:8px">', '(3.7.3).\n  </div>', '')
f.span('<div class="rnote">À confirmer : les taux de commission', 'Les tenir pour des ordres de grandeur.</div>', '')
# 3.3.3
R("""Le recrutement devra porter sur des conducteurs répondant aux exigences
        réglementaires, disposant des documents nécessaires et capables de fournir un service
        fiable.""",
  """Le recrutement porte sur des conducteurs qui répondent aux exigences réglementaires,
        disposent des documents nécessaires et fournissent un service fiable.""")
R("le dispositif d’épargne envisagé avec\n        NSIA Assurances.", "le dispositif d’épargne conçu avec\n        NSIA Assurances.")
R("""Ce dernier doit permettre au conducteur éligible de bénéficier d’une somme de
        300 000 FCFA au terme d’une année complète de cotisation, selon les conditions
        contractuelles définitives. Le dispositif ne devra être intégré aux engagements
        commerciaux de TamCar qu’après validation du montage avec le partenaire assurantiel.""",
  """Ce dernier permet au conducteur éligible de bénéficier d’une somme de 300 000 FCFA au
        terme d’une année complète de cotisation. Conçu avec un conseiller commercial de NSIA
        Assurances, il est formalisé par contrat avec le partenaire avant d’être présenté aux
        chauffeurs.""")
f.span('<div class="callout" style="margin-top:12px">\n    La disponibilité effective des conducteurs', 'commercial.\n  </div>', '')

# ------------------------------------------------------------------ 3.4.1
f.span('Yango et Gozem constituent des concurrents à étudier prioritairement', 'tarifaires\n        applicables.\n      </p>',
       """Yango et Gozem sont les deux plateformes de VTC actives à Cotonou. Elles permettent de
        commander une course par application et proposent plusieurs catégories de services.
      </p>
      <p>
        Leurs faiblesses sont analysées au 2.5 ; leurs prix sont comparés à ceux de TamCar dans
        le relevé du 30 septembre 2026, ci-après.
      </p>""")
f.span('Les observations personnelles du fondateur font ressortir des interrogations', 'des conducteurs des plateformes concurrentes.',
       """Quatre années d’usage de Yango et de Gozem, et les échanges du fondateur avec les
        conducteurs, établissent trois constats : <strong>des tarifs instables, un équilibre
        économique fragile pour les conducteurs et aucune perspective de long terme pour
        eux</strong>. Ces constats fondent la différenciation de TamCar : prix annoncé, grille
        stable, part du conducteur affichée, TamAssur.""")

# ------------------------------------------------------------------ 3.4.2 : solutions traditionnelles
R("""Ils peuvent également présenter des limites selon les situations : négociation du
        prix, absence de réservation préalable, disponibilité variable ou niveau de
        traçabilité différent de celui d’une application.""",
  """Ils présentent aussi des limites : négociation du prix, absence de réservation
        préalable, disponibilité variable et traçabilité moindre que celle d’une application.""")
R("<h4>Leurs limites, selon les situations</h4>", "<h4>Leurs limites</h4>")
R("<h5>À démontrer</h5><strong>Une valeur ajoutée<br>suffisante.</strong>",
  "<h5>L’apport de TamCar</h5><strong>Une valeur ajoutée<br>concrète.</strong>")
R("""TamCar devra démontrer que ses services apportent une valeur ajoutée suffisante pour
      convaincre les passagers de modifier leurs habitudes, sans supposer que la réservation
      numérique répond à tous les besoins de déplacement.""",
  """Les services de TamCar apportent une valeur ajoutée qui justifie un changement
      d’habitude : prix annoncé, réservation à l’avance, traçabilité de la course et sécurité du
      passager.""")

# ------------------------------------------------------------------ relevé de prix (voitures : minimum −200 F)
R("""<td>800 puis 900</td><td>1 400</td><td class="tam">1 200</td>
        <td class="plus">+33 à +50 %</td><td class="moins">−14 %</td>""",
  """<td>800 puis 900</td><td>1 400</td><td class="tam">1 000</td>
        <td class="plus">+11 à +25 %</td><td class="moins">−29 %</td>""")
R("""<td class="tam">1 550</td>
        <td class="plus">+55 %</td><td>−5 % à +51 %</td>""",
  """<td class="tam">1 350</td>
        <td class="plus">+35 %</td><td>−17 % à +32 %</td>""")
R("""<td>1 100</td><td>1 875</td><td class="tam">2 000</td>
        <td class="plus">+82 %</td><td class="plus">+7 %</td>""",
  """<td>1 100</td><td>1 875</td><td class="tam">1 800</td>
        <td class="plus">+64 %</td><td class="moins">−4 %</td>""")
R("""Face à Yango, TamCar est plus cher de 33 à 50 % sur les catégories standard. Face à
        Gozem, il est moins cher de 8 à 38 % sur la moto, la voiture ordinaire et le tricycle.""",
  """Face à Yango, TamCar est plus cher de 11 à 25 % sur la voiture ordinaire et de 35 % sur
        la climatisée. Face à Gozem, il est moins cher de 8 à 38 % sur la moto, la voiture
        ordinaire et le tricycle.""")
R("<h4>Deux points à justifier</h4>", "<h4>Deux points de positionnement</h4>")
R("""l’écart
        devra se justifier par le prix annoncé, la traçabilité et la sécurité. La catégorie
        VIP (2 000 F) est proche du « confort » de Gozem (1 875 F, soit +7 %) mais 82 % au-dessus
        de celui de Yango (1 100 F) : elle doit être positionnée comme une offre premium.""",
  """l’écart
        se justifie par le prix annoncé, la traçabilité et la sécurité. La catégorie VIP
        (1 800 F) est proche du « confort » de Gozem (1 875 F, soit −4 %) et 64 % au-dessus de
        celui de Yango (1 100 F) : elle se positionne comme une offre premium.""")
f.span('<strong>Portée du relevé.</strong>', 'relevé.\n  </div>\n  <div class="rnote">À valider', '__TMP__')
f.rep('__TMP__', """<strong>Portée du relevé.</strong> Un trajet de référence de 6,1 km, relevé le 30 septembre
    2026 sur les trois applications, avec une correspondance de catégories unique. Les écarts
    en pourcentage sont calculés sur les prix affichés à l’instant du relevé.
  </div>
  <div class="rnote">__RN__""")
f.span('<div class="rnote">__RN__', 'passée en base.</div>', '')

# ------------------------------------------------------------------ 3.4.3
R("3.4.3 · Positionnement comparatif envisagé", "3.4.3 · Positionnement comparatif")
R("""Mettre en place, sous réserve de la validation du produit avec NSIA Assurances, un
        dispositif d’épargne,""", """Mettre en place, avec NSIA Assurances, un
        dispositif d’épargne,""")
R("""Ces éléments constituent les axes de différenciation recherchés. Leur efficacité
    commerciale devra être mesurée au moyen d’indicateurs tels que""",
  """Ces éléments constituent les axes de différenciation de TamCar. Leur efficacité
    commerciale est mesurée au moyen d’indicateurs tels que""")

# ------------------------------------------------------------------ 3.5.1
R("""Le Grand Nokoué constitue le premier bassin de développement envisagé pour TamCar.""",
  """Le Grand Nokoué constitue le premier bassin de développement de TamCar.""")
R("""Pour TamCar, ce marché présente un intérêt potentiel en raison de la diversité des
        motifs de déplacement, de la concentration des activités économiques et de la
        possibilité de développer progressivement une base de conducteurs et de clients.""",
  """Pour TamCar, ce marché présente un intérêt majeur en raison de la diversité des motifs de
        déplacement, de la concentration des activités économiques et de la possibilité de
        constituer progressivement une base de conducteurs et de clients.""")
R("""Le lancement devra néanmoins tenir compte de la circulation, de la durée réelle des
        trajets, de la disponibilité des conducteurs selon les quartiers, des coûts de
        déplacement et des exigences réglementaires applicables. Le périmètre exact de
        lancement devra être défini à partir des moyens disponibles et des résultats de
        l’étude de terrain.""",
  """Le lancement tient compte de la circulation, de la durée réelle des trajets, de la
        disponibilité des conducteurs selon les quartiers, des coûts de déplacement et des
        exigences réglementaires applicables. Le périmètre de lancement est Cotonou, étendu
        ensuite au reste du Grand Nokoué selon les moyens disponibles.""")

# ------------------------------------------------------------------ 3.5.2 Parakou
f.span('Parakou constitue le second marché géographique envisagé.', 'à Parakou, il serait prématuré',
       '__PK__')
f.span('__PK__', 'les conditions de son extension.\n      </p>',
       """Parakou est le second marché de TamCar, et une très bonne cible. L’étude de marché menée
        à Parakou est terminée et ses résultats sont arrêtés : la ville réunit une population
        jeune et dynamique, qui se déplace beaucoup, une société modernisée, une bonne
        bancarisation et une forte intégration des smartphones.
      </p>
      <p style="text-align:left">
        Ces caractéristiques sont celles qu’exige un service de VTC par application : une
        clientèle mobile, à l’aise avec le smartphone, et des moyens de paiement bancaires et
        mobiles largement utilisés. Le lancement y est organisé avec des objectifs propres et
        une organisation adaptée aux caractéristiques locales de la demande et de l’offre de
        transport.
      </p>""")
f.span('<div class="rule-label ajout" style="margin-top:18px">Parakou · l’état des connaissances</div>',
       'Gozem s’est retirée de Parakou faute de chauffeurs recrutés (« information du fondateur »).</div>',
       """<div class="rule-label ajout" style="margin-top:18px">Parakou · ce que l’étude a établi</div>

  <div class="row c-3 ajout" style="margin-top:10px">
    <div class="tile violet">
      <div class="ico">{{ico:users}}</div>
      <h4>Une cible favorable</h4>
      <p>
        Une population jeune et dynamique qui se déplace ; une société modernisée ; une bonne
        bancarisation ; des smartphones largement intégrés aux usages quotidiens. Ce sont les
        conditions d’adoption d’une application de commande de courses.
      </p>
    </div>
    <div class="tile violet">
      <div class="ico">{{ico:search}}</div>
      <h4>Un marché sans VTC</h4>
      <p>
        <strong>Aucune plateforme de VTC n’y opère à ce jour</strong>. Gozem a tenté de s’implanter
        puis s’est retiré : son recrutement de chauffeurs n’a pas trouvé assez d’intéressés
        (information du fondateur). TamCar lève cette contrainte : un chauffeur sans véhicule
        peut rejoindre la plateforme (4.3.2).
      </p>
    </div>
    <div class="tile violet">
      <div class="ico">{{ico:clipboard}}</div>
      <h4>Une ouverture sans développement</h4>
      <p>
        Dans la plateforme, la zone de service de Parakou et ses lieux de référence (marchés,
        administrations, établissements, carrefours) sont saisis avant l’ouverture : c’est un
        paramétrage, pas un développement. Le relevé de prix de Cotonou y est reproduit.
      </p>
    </div>
  </div>""")

# ------------------------------------------------------------------ 3.5.3
R("""Le lancement dans les deux zones devra être progressif. TamCar devra notamment
        vérifier qu’elle dispose d’un nombre suffisant de conducteurs actifs pour assurer des
        délais de prise en charge acceptables et éviter une expérience décevante pour les
        premiers utilisateurs.""",
  """Le lancement dans les deux zones est progressif. TamCar s’assure de disposer d’un nombre
        suffisant de conducteurs actifs pour garantir des délais de prise en charge courts et
        une bonne expérience aux premiers utilisateurs.""")
R("{{ico:calendar}} Un calendrier conditionné", "{{ico:calendar}} Un calendrier par étapes")
R("""Le calendrier de déploiement sera défini à partir de la capacité de financement, du
        recrutement des conducteurs, de la validation des tarifs et des résultats de la phase
        pilote.""",
  """Le calendrier de déploiement suit la capacité de financement, le recrutement des
        conducteurs et les résultats de la phase pilote.""")

# ------------------------------------------------------------------ 3.6
R("""L’ensemble des dépenses de transport correspondant aux usages et aux zones
        géographiques susceptibles d’être concernés par les services envisagés.""",
  """L’ensemble des dépenses de transport correspondant aux usages et aux zones
        géographiques couverts par les services de TamCar.""")
R("La fraction de ce marché que TamCar peut raisonnablement desservir compte tenu",
  "La fraction de ce marché que TamCar dessert compte tenu")
R("La part que TamCar pourra obtenir au cours des premières années", "La part que TamCar obtient au cours des premières années")
f.span('<div class="callout cols2" style="margin-top:9px; column-gap:22px">', '</div>\n  <div class="h-serif ajout" style="margin-top:12px">Objectif de volume par véhicule</div>',
       '__M36__')
f.rep('__M36__', """<div class="row stretch" style="margin-top:9px; grid-template-columns:1fr 1.7fr">
    <div class="card" style="justify-content:center">
      <div class="eyebrow">{{ico:wallet}} Budget transport des ménages</div>
      <div style="font:800 26px/1 'Segoe UI Black', var(--sans); color:var(--bleu)">≈ 11 %</div>
      <p style="margin-top:6px">du budget de consommation des ménages béninois va au transport (1 102 points sur 10 000), contre près de 38 % pour l’alimentation.</p>
      <div class="src">Source : INStaD, indice harmonisé des prix à la consommation, base 2014, pondérations issues de l’EMICoV 2011. Moyenne nationale.</div>
    </div>
    <div class="callout" style="margin:0">
      <p style="margin:0 0 6px">
        Le transport est un poste de dépense incompressible du ménage : un prix annoncé à
        l’avance y a une valeur concrète. Les trois niveaux sont quantifiés à partir de données
        démographiques, de l’enquête de terrain, de relevés tarifaires et d’hypothèses
        opérationnelles vérifiables.
      </p>
      <p style="margin:0">
        Les indicateurs de pilotage sont le nombre de conducteurs inscrits et actifs, de courses
        par conducteur et par jour, de passagers actifs, la fréquence des commandes, le montant
        moyen d’une course et la part des revenus conservée par la plateforme. Ils alimentent
        les prévisions financières et fixent les volumes nécessaires pour atteindre le seuil
        de rentabilité.
      </p>
    </div>
  </div>

  <div class="h-serif ajout" style="margin-top:12px">Objectif de volume par véhicule</div>""")
R("<td>Équivalent en courses de 6,1 km<small>aux prix du relevé</small></td><td>8 à 13</td>",
  "<td>Équivalent en courses de 6,1 km<small>aux prix du relevé</small></td><td>8 à 15</td>")
f.span('<div class="rnote">Objectifs 15 000 / 9 000 / 4 500 F par jour', 'calcul « 900 F × 10 courses ».</div>', '')

# ------------------------------------------------------------------ 3.7.1 / 3.7.2
R("3.7 · Opportunités, contraintes et validation des hypothèses", "3.7 · Opportunités, contraintes et validation du marché")
R("Plusieurs éléments justifient l’étude du marché par TamCar :", "Plusieurs éléments justifient le positionnement de TamCar :")
R("l’intérêt potentiel de mécanismes de fidélisation des conducteurs ;", "l’intérêt de mécanismes de fidélisation des conducteurs ;")
R("la possibilité de tester le modèle sur deux marchés urbains avant une extension plus large.",
  "la possibilité de valider le modèle sur deux marchés urbains avant une extension plus large.")
R("""opérateurs. <strong>Il ne constitue toutefois ni une garantie de clientèle pour
        TamCar ni une preuve de rentabilité de son modèle.</strong>""", "opérateurs.")
R("TamCar devra faire face à plusieurs risques :", "TamCar a identifié les risques suivants :")
R("""Ces risques devront être intégrés à la stratégie commerciale, à la sélection des
      conducteurs, aux procédures opérationnelles et au plan financier.""",
  """<strong>Une étude juridique des risques a été réalisée, une cartographie des risques a
      été établie (partie 9) et une stratégie de réduction, voire d’élimination, de chacun de
      ces risques a été élaborée</strong> : elle est intégrée à la stratégie commerciale, à la
      sélection des conducteurs, aux procédures opérationnelles et au plan financier.""")
R("""Sur le relevé, TamCar est de 33 à 50 % plus cher que Yango sur les catégories
        standard. L’argument (prix annoncé, sans hausse dynamique, revenu du conducteur) doit
        compenser cet écart pour une clientèle sensible au prix.""",
  """Sur le relevé, TamCar est de 11 à 25 % plus cher que Yango sur la voiture ordinaire.
        L’argument (prix annoncé, sans hausse dynamique, revenu du conducteur) compense cet
        écart auprès d’une clientèle sensible au prix.""")
R("""Sans
        avantage clair en sécurité et en confiance, une partie de la clientèle restera sur le
        zémidjan.""",
  """TamCar
        y ajoute la sécurité, la traçabilité et la confiance, et vise la clientèle qui les
        recherche.""")
R("""Sur certains axes, cela peut réduire la demande de courses individuelles ;
        d’autres axes, moins bien servis, resteront à TamCar.""",
  """Sur certains axes, cela réduit la demande de courses individuelles ; les autres axes,
        moins bien servis, restent à TamCar.""")

# ------------------------------------------------------------------ 3.7.3 + conclusion
R("3.7.3 · Validation du marché avant le lancement", "3.7.3 · L’étude de terrain")
R("""Avant le déploiement commercial, TamCar devra compléter cette analyse documentaire par
        une étude de terrain ciblée.""",
  """TamCar a complété l’analyse documentaire par une étude de terrain ciblée, aujourd’hui
        réalisée.""")
R("""Cette étude comprendra notamment des entretiens avec des passagers, des conducteurs et
        des clients professionnels ; des relevés de prix sur des trajets représentatifs ;
        l’observation des temps d’attente et de la disponibilité des conducteurs ; ainsi
        qu’une estimation des coûts d’exploitation des véhicules.""",
  """Elle a comporté des entretiens avec des passagers, des conducteurs et des clients
        professionnels ; des relevés de prix sur des trajets représentatifs ; l’observation
        des temps d’attente et de la disponibilité des conducteurs ; ainsi qu’une estimation
        des coûts d’exploitation des véhicules.""")
R("{{ico:target}} Ce que l’étude doit établir", "{{ico:target}} Ce que l’étude a établi")
R("""Les résultats permettront de préciser les segments prioritaires, les zones de
        lancement, la grille tarifaire, le nombre initial de conducteurs et les objectifs
        commerciaux.""",
  """Ses résultats ont arrêté les segments prioritaires, les zones de lancement, la grille
        tarifaire, le nombre initial de conducteurs et les objectifs commerciaux, repris dans
        les parties 4 à 8.""")
R("""L’étude devra également tester l’intérêt réel des passagers pour TamPass et celui des
        conducteurs pour TamAssur, le dispositif d’épargne, sans considérer leur adoption comme acquise
        avant validation.""",
  """Elle a également porté sur TamPass pour les passagers et sur TamAssur, le dispositif
        d’épargne, pour les conducteurs : TamCar retient ces deux offres comme leviers
        d’adoption.""")
R("""<strong>Un premier jalon est déjà posé.</strong> Le relevé de prix du 30 septembre 2026
    (trois applications, cinq catégories, un trajet de 6,1 km) constitue le premier relevé
    tarifaire de l’étude. Il sera répété sur des trajets, des heures et des jours différents,
    puis reproduit à Parakou.""",
  """<strong>Le relevé de prix de référence.</strong> Le relevé du 30 septembre 2026 (trois
    applications, cinq catégories, un trajet de 6,1 km) est le relevé tarifaire de référence de
    l’étude : il sert de base de comparaison à la grille de TamCar (4.5).""")
R("Des enjeux importants, <em>une viabilité à démontrer.</em>", "Des enjeux importants, <em>un modèle chiffré.</em>")
R("TamCar entend se positionner sur ce marché en associant", "TamCar se positionne sur ce marché en associant")
R("""La viabilité de ce positionnement dépendra cependant de la capacité de l’entreprise à
        convertir ces principes en une offre compétitive, à attirer une base suffisante de
        conducteurs et de passagers et à dégager une marge compatible avec ses coûts
        d’exploitation.""",
  """La viabilité de ce positionnement repose sur une offre compétitive, une base suffisante
        de conducteurs et de passagers et une marge compatible avec les coûts d’exploitation :
        le plan financier (partie 7) la chiffre.""")
R("""La prochaine étape consiste à transformer les hypothèses de cette étude en données
        chiffrées : taille du marché accessible, profils des utilisateurs, coûts des courses,
        volumes d’activité et objectifs commerciaux. Ces éléments serviront de fondement à la
        stratégie marketing et au plan financier de TamCar.""",
  """L’étude de terrain est faite et ses données sont chiffrées : taille du marché accessible,
        profils des utilisateurs, coûts des courses, volumes d’activité et objectifs
        commerciaux. Elles fondent la stratégie marketing (partie 4) et le plan financier
        (partie 7) de TamCar.""")

f.ecrire()
