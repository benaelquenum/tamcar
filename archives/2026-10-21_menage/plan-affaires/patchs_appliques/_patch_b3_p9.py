from _patchlib import Fichier

f = Fichier('gen_partie9.py')
R = f.rep

R("""conséquences et à préserver la continuité de l’activité. Ces mesures devront être traduites
        en procédures opérationnelles, en clauses contractuelles et en indicateurs de suivi.""",
  """conséquences et à préserver la continuité de l’activité. Une étude juridique des risques
        a été réalisée, une cartographie des risques établie (ci-dessous), et une stratégie de réduction,
        voire d’élimination, de chaque risque élaborée : ces mesures sont traduites en procédures
        opérationnelles, en clauses contractuelles et en indicateurs de suivi.""")
R("""Les réponses présentées ci-dessus reprennent les risques et mesures envisagés <span class="modif">dès la conception du projet</span>.
    Leur efficacité devra être vérifiée en exploitation ; elles ne constituent pas une garantie d’absence de pertes ou d’incidents.""",
  """Ces réponses reprennent les risques et mesures retenus <span class="modif">dès la conception du projet</span>.
    Leur efficacité est mesurée en exploitation par les indicateurs du 9.8.""")
f.span('<div class="rnote">« Business plan initial » remplacé', 'conditions d’ouverture de Parakou (4.2.2).</div>', '')

R("9.2 · Quatre risques que le texte ne traite pas", "9.2 (suite) · Quatre risques complémentaires")
R("""Certains facteurs cités en 9.1 n’ont pas leur ligne dans le tableau, en particulier la fiabilité des outils numériques. Le financement et le test des motos découlent des parties 7 et 8.""",
  """Quatre autres risques complètent le tableau : le financement, le test des motos, la fiabilité des outils numériques et la dépendance à une équipe restreinte. Les deux premiers découlent des parties 7 et 8.""")
R("procédures et code documentés, à mettre en place avant l’arrivée du développeur.", "procédures et code documentés avant l’arrivée du développeur.")

R("""Le déploiement à Parakou constitue une expérimentation géographique distincte du lancement dans le
        Sud. Le plan prévoit""", """Le déploiement à Parakou est un lancement distinct de celui du Sud, en phase pilote. Le plan prévoit""")
R("""Cette approche limite l’exposition initiale, mais suppose de définir à l’avance les critères qui
        déclencheront le maintien, l’ajustement ou l’arrêt du pilote. Ces critères devront notamment porter
        sur le nombre de courses réalisées, le taux d’utilisation des véhicules, les recettes générées et la
        capacité à recruter puis fidéliser les chauffeurs.""",
  """Cette approche limite l’exposition initiale. Des critères définis à l’avance déclenchent le
        maintien, l’ajustement ou l’arrêt du pilote ; ils portent sur le nombre de courses réalisées, le
        taux d’utilisation des véhicules, les recettes générées et la capacité à recruter puis fidéliser les
        chauffeurs.""")
R("Cette possibilité devra être examinée au regard des", "Cette possibilité est examinée au regard des")
R("Seuils à fixer avant l’ouverture, à partir des premiers résultats du Sud", "Seuils arrêtés au plan opérationnel, d’après les premiers résultats du Sud")
f.span('<div class="rnote">Le second lot est livré au mois 7', 'je n’ai pas de base pour les inventer.</div>', '')

R("""Ce seuil doit être compris comme une hypothèse contractuelle et opérationnelle du business plan,
        et non comme une recette garantie. La demande peut varier selon les jours, les zones et les périodes.""",
  """Ce seuil est l’objectif contractuel et opérationnel du business plan ; la demande varie selon les
        jours, les zones et les périodes.""")
R("""Le suivi devra donc distinguer les difficultés temporaires, les problèmes d’affectation
        géographique et les insuffisances persistantes d’activité. Avant toute réaffectation, TamCar devra
        appliquer une procédure""", """Le suivi distingue donc les difficultés temporaires, les problèmes d’affectation
        géographique et les insuffisances persistantes d’activité. Avant toute réaffectation, TamCar
        applique une procédure""")
R("""Les abonnements TamPass sont envisagés comme un moyen de contribuer à la récurrence des trajets.
        Leur effet réel dépendra toutefois du nombre d’abonnés, de la fréquence des déplacements et des
        conditions commerciales effectivement mises en place.""",
  """Les abonnements TamPass contribuent à la récurrence des trajets ; leur effet tient au nombre
        d’abonnés, à la fréquence des déplacements et aux conditions commerciales mises en place.""")

R("Le bon fonctionnement de ce mécanisme devra être testé et contrôlé régulièrement,", "Le bon fonctionnement de ce mécanisme est contrôlé régulièrement,")
R("""doivent permettre de réduire les risques de détournement, de dommages et
        d’immobilisation prolongée. La réserve de propriété <span class="modif">prévue en 6.4</span> devra être formalisée dans les
        contrats et sécurisée juridiquement jusqu’à la réalisation de la cession.""",
  """réduisent les risques de détournement, de dommages et
        d’immobilisation prolongée. La réserve de propriété <span class="modif">prévue en 6.4</span> est formalisée dans les
        contrats et sécurisée juridiquement jusqu’à la réalisation de la cession.""")
R("""Une clause de réserve de propriété doit être convenue par
      écrit et, pour valoir contre les tiers, publiée au RCCM (Acte uniforme OHADA sur les sûretés, art. 72 et suivants).
      Le conseil juridique le confirmera au moment de rédiger les contrats.""",
  """Une clause de réserve de propriété est convenue par
      écrit et, pour valoir contre les tiers, publiée au RCCM (Acte uniforme OHADA sur les sûretés, art. 72 et suivants).
      Elle est rédigée dans les contrats de cession.""")
f.span('<div class="rnote">« Décrit dans le business plan »', 'le lecteur lit le plan lui-même.</div>', '')

R("TamCar prévoit de se différencier par un prix annoncé", "TamCar se différencie par un prix annoncé")
R("""Cette stratégie ne supprime pas le risque concurrentiel. Une baisse de prix d’un concurrent, une
        évolution des habitudes des utilisateurs ou une offre de rémunération plus attractive pour les
        chauffeurs pourrait affecter les volumes de courses.""",
  """Cette stratégie ne supprime pas le risque concurrentiel : une baisse de prix d’un concurrent, une
        évolution des habitudes des utilisateurs ou une offre de rémunération plus attractive pour les
        chauffeurs affecte les volumes de courses.""")
R("""TamCar devra donc suivre régulièrement ses tarifs, les délais de prise en charge, les annulations,
        la satisfaction des clients, la fidélité des chauffeurs et la rentabilité par ville. Toute réponse
        concurrentielle devra être évaluée à partir de ses effets""",
  """TamCar suit donc régulièrement ses tarifs, les délais de prise en charge, les annulations,
        la satisfaction des clients, la fidélité des chauffeurs et la rentabilité par ville. Toute réponse
        concurrentielle est évaluée à partir de ses effets""")
R("""<strong>Le point de départ est mesuré.</strong> Sur le relevé du 30 septembre 2026, TamCar est de 33 à 50 % plus cher
      que Yango sur les catégories standard et moins cher que Gozem (3.4). Le risque ne vient donc pas d’un prix déjà plus
      haut : il vient d’un écart que le prix annoncé, sans hausse dynamique, doit continuer à justifier.""",
  """<strong>Le point de départ est mesuré.</strong> Sur le relevé du 30 septembre 2026, TamCar est de 11 à 25 % plus cher
      que Yango sur la voiture ordinaire et moins cher que Gozem (3.4). Le risque tient à cet écart avec Yango, que le prix
      annoncé, sans hausse dynamique, justifie.""")
R("<strong>Ce qu’une baisse de prix coûterait.</strong>", "<strong>Ce que coûte une baisse de prix.</strong>")

R("""Le lancement de TamCar nécessite de vérifier les autorisations liées à l’activité de transport,
        les obligations administratives""", """TamCar vérifie les autorisations liées à l’activité de transport,
        les obligations administratives""")
R("""Ces éléments devront être
        confirmés auprès des autorités compétentes et des conseils concernés avant le lancement.""",
  """Ces éléments sont
        confirmés auprès des autorités compétentes et des conseils concernés avant le lancement.""")
R("""Le régime fiscal <span class="modif">envisagé</span> devra également faire l’objet d’une vérification spécifique au regard de la
        situation effective de la société et des textes applicables à la date de son immatriculation.
        Aucune exonération ou facilité fiscale ne devra être considérée comme acquise avant confirmation.""",
  """Le régime fiscal <span class="modif">retenu</span> est vérifié au regard de la
        situation effective de la société et des textes applicables à la date de son immatriculation.
        Aucune exonération ou facilité fiscale n’est comptée dans le plan avant sa confirmation.""")
f.span('<div class="rnote">« Redevance ANaTT » remplacé', 'à confirmer avec l’ANATT.</div>', '')
R("""La gestion des risques ne doit pas se limiter à leur identification initiale. TamCar devra mettre en
      place un suivi régulier fondé sur des données vérifiables. Les indicateurs prioritaires pourront comprendre :""",
  """La gestion des risques ne se limite pas à leur identification initiale. TamCar met en
      place un suivi régulier fondé sur des données vérifiables. Les indicateurs prioritaires comprennent :""")
R("""Un tableau de bord mensuel permettra de repérer les écarts par rapport aux prévisions et de décider
      des actions correctives. Les seuils d’alerte devront être définis avant le lancement, puis ajustés
      en fonction des premières données réelles.""",
  """Un tableau de bord mensuel repère les écarts par rapport aux prévisions et décide
      des actions correctives. Les seuils d’alerte ci-dessous sont tirés du modèle, puis ajustés
      sur les données réelles.""")
R("""La prochaine étape consiste à transformer ces mesures en procédures concrètes, en engagements
        contractuels vérifiés et en indicateurs de contrôle. Cette formalisation permettra de mieux
        maîtriser les risques sans présenter comme certaines des performances qui restent, à ce stade,
        prévisionnelles.""",
  """Ces mesures sont traduites en procédures concrètes, en engagements contractuels et en
        indicateurs de contrôle ; les performances présentées sont les projections du modèle.""")

f.ecrire()
