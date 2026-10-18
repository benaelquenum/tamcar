from _patchlib import Fichier

f = Fichier('partie4.html')
R = f.rep

# ------------------------------------------------------------------ 4.1
R("TamAssur (épargne chauffeur) côté application, à formaliser avec NSIA.",
  "TamAssur (épargne chauffeur, conçue avec NSIA) côté application.")
f.span('<div class="rnote">Fonctions vérifiées dans le code au 30/09.', 'dites-moi où il en est.</div>', '')

# ------------------------------------------------------------------ 4.2
R("""Cotonou et son agglomération constituent le premier marché envisagé pour le lancement.
        Cette zone permettra de tester l’application dans un environnement urbain où les""",
  """Cotonou et son agglomération constituent le premier marché de lancement. Cette zone
        permet de valider l’application dans un environnement urbain où les""")
R("Le lancement devra tenir compte de la couverture réelle des chauffeurs,", "Le lancement tient compte de la couverture réelle des chauffeurs,")
R("""L’approche initiale consistera à concentrer les efforts sur des zones où les chauffeurs
        peuvent être mobilisés et où la demande peut être activement recherchée. Il ne serait pas
        pertinent d’annoncer une disponibilité généralisée avant de disposer d’une offre
        suffisante.""",
  """L’approche initiale consiste à concentrer les efforts sur des zones où les chauffeurs
        sont mobilisés et où la demande est activement recherchée. TamCar n’annonce pas de
        disponibilité généralisée avant de disposer d’une offre suffisante.""")
R("Les premiers résultats permettront d’évaluer notamment le délai d’affectation d’un", "Les premiers résultats mesurent notamment le délai d’affectation d’un")
R("Parakou constitue le second marché envisagé dans le plan de développement de TamCar.",
  "Parakou est le second marché du plan de développement de TamCar, une cible favorable : population jeune et dynamique, société modernisée, bonne bancarisation, smartphones répandus (3.5.2).")
R("""Son ouverture interviendra après une première phase de validation opérationnelle. Elle
        nécessitera une préparation spécifique, notamment pour identifier les chauffeurs,
        comprendre les habitudes locales de déplacement, adapter les actions commerciales et
        évaluer les coûts d’exploitation.""",
  """Son ouverture intervient après une première phase de validation opérationnelle. Elle
        comporte une préparation spécifique : identification des chauffeurs, habitudes locales
        de déplacement, actions commerciales adaptées et coûts d’exploitation, documentés par
        l’étude de marché menée à Parakou.""")
R("""L’extension à Parakou ne sera donc pas considérée comme une simple duplication
        technique de l’application. Elle devra faire l’objet d’un lancement commercial
        organisé, avec des objectifs propres et un suivi distinct des résultats.""",
  """L’extension à Parakou n’est donc pas une simple duplication technique de l’application.
        Elle fait l’objet d’un lancement commercial organisé, avec des objectifs propres et un
        suivi distinct des résultats.""")
R("""Le calendrier précis de cette extension sera arrêté en fonction des résultats obtenus
        sur le premier marché et des ressources financières disponibles.""",
  """Le plan de trésorerie place l’ouverture de Parakou au mois 7, une fois les résultats de
        Cotonou mesurés.""")
R("<strong>Un précédent à analyser.</strong>", "<strong>Un précédent maîtrisé.</strong>")
R("""son recrutement de chauffeurs n’aurait pas trouvé assez d’intéressés
      (information du fondateur). Aucune plateforme""",
  """son recrutement de chauffeurs n’a pas trouvé assez d’intéressés
      (information du fondateur). Aucune plateforme""")
R("À réunir avant l’ouverture (seuils à fixer au plan opérationnel) :", "À réunir avant l’ouverture, selon les seuils du plan opérationnel :")
f.span('<div class="rnote">Info reçue de vous : Gozem s’est retirée', 'information du fondateur »).</div>', '')

# ------------------------------------------------------------------ 4.3.1 (avec l'image du chauffeur)
f.span('<div class="card" style="margin-top:12px">\n    <div class="eyebrow">{{ico:car}} 4.3.1 · Une approche commerciale centrée sur le chauffeur</div>',
       'les mécanismes de fidélisation envisagés pour les chauffeurs partenaires.</li>\n    </ul>\n  </div>',
       """<div class="card" style="margin-top:12px">
    <div class="eyebrow">{{ico:car}} 4.3.1 · Une approche commerciale centrée sur le chauffeur</div>
    <div class="profil" style="grid-template-columns:42mm 1fr; gap:16px">
      <figure class="portrait">
        <img src="assets/chauffeur-tricycle.jpg" alt="Chauffeur de tricycle TamCar" style="width:42mm; height:50.4mm">
        <figcaption>Un chauffeur aux couleurs de TamCar<span>casque, gilet et capote personnalisés</span></figcaption>
      </figure>
      <div class="profil-texte">
        <p>
          Les chauffeurs constituent une composante essentielle de la proposition de valeur de
          TamCar. Sans une offre suffisamment disponible et fiable, l’application ne peut pas
          répondre efficacement aux demandes des passagers.
        </p>
        <p>
          La stratégie d’acquisition présente TamCar comme un outil qui donne accès à des
          opportunités de courses, dans un cadre de fonctionnement transparent. Chaque chauffeur
          porte les couleurs de la marque, avec des éléments de branding personnalisés : il est
          identifiable, et TamCar est visible à chaque course.
        </p>
        <p style="margin:10px 0 6px">Les arguments commerciaux portent notamment sur :</p>
        <ul class="liste" style="margin-top:0">
          <li>la lisibilité des tarifs et des conditions applicables aux courses ;</li>
          <li>la clarté des commissions et des sommes revenant au chauffeur ;</li>
          <li>la possibilité d’accéder à une clientèle supplémentaire ;</li>
          <li>la qualité de l’assistance en cas de difficulté ;</li>
          <li>les mécanismes de fidélisation des chauffeurs partenaires.</li>
        </ul>
      </div>
    </div>
  </div>""")
R("""Ces arguments devront être accompagnés de conditions commerciales précises. <strong>TamCar
    évitera de promettre un revenu minimum ou un volume de courses garanti</strong> tant que ces
    engagements ne pourront pas être financièrement soutenus.""",
  """Ces arguments s’accompagnent de conditions commerciales précises. <strong>TamCar
    évitera de promettre un revenu minimum ou un volume de courses garanti</strong> : le
    chauffeur est rémunéré à la course, sur des prix annoncés.""")
R("""TamAssur, l’épargne chauffeur (côté application), et bonus de volume pour les chauffeurs en formule de cession ; à formaliser avec NSIA pour l’épargne (4.3.3).""",
  """TamAssur, l’épargne chauffeur (côté application, conçue avec NSIA), et bonus de volume pour les chauffeurs en formule de cession (4.3.3).""")
f.span('<div class="rnote">« Bonus de volume » :', 'comme canal de recrutement ?</div>', '')

# ------------------------------------------------------------------ 4.3.2 / 4.3.3
R("""Le recrutement initial reposera sur une prospection directe et des partenariats locaux
        à développer.""", """Le recrutement initial repose sur une prospection directe et des partenariats locaux.""")
R("Les actions envisagées comprennent :", "Les actions menées comprennent :")
R("la collaboration éventuelle avec des acteurs locaux du transport, sous réserve d’accords formalisés.",
  "la collaboration avec des acteurs locaux du transport, dans le cadre d’accords formalisés.")
R("""Les critères d’admission devront être définis afin de préserver la qualité du service,
        la sécurité des utilisateurs et le respect des exigences applicables au transport de
        personnes.""",
  """Les critères d’admission préservent la qualité du service, la sécurité des utilisateurs et
        le respect des exigences applicables au transport de personnes.""")
R("Il perçoit une part de chaque course (30 % du prix dans le calcul actuel)", "Il perçoit une part de chaque course (30 % du prix)")
R("""lorsqu’ils sont dus et disponibilité de l’assistance.""", """et disponibilité de l’assistance.""")
R("""TamCar envisage également un mécanisme d’épargne, <strong>TamAssur</strong>, destiné aux chauffeurs partenaires. Le
        concept pré-élaboré avec un conseiller commercial de NSIA Assurances prévoit une
        contribution de <strong>1 000 FCFA par jour travaillé</strong>, du lundi au samedi, et un avantage annuel
        envisagé de 300 000 FCFA sous certaines conditions.""",
  """TamCar propose également un mécanisme d’épargne, <strong>TamAssur</strong>, destiné aux chauffeurs partenaires. Le
        concept, conçu avec un conseiller commercial de NSIA Assurances, prévoit une
        contribution de <strong>1 000 FCFA par jour travaillé</strong>, du lundi au samedi, et une somme de
        300 000 FCFA au terme d’une année complète de cotisation, selon des conditions d’éligibilité précises.""")
R("""Ce mécanisme demeure un projet à formaliser. Sa mise en œuvre dépendra notamment de la
        validation de NSIA, de la définition des conditions contractuelles, du traitement des
        fonds, des modalités de sortie et du cadre juridique applicable.""",
  """La formalisation avec NSIA couvre les conditions contractuelles, le traitement des fonds,
        les modalités de sortie et le cadre juridique applicable.""")
R("""Il ne sera donc présenté aux chauffeurs comme un avantage acquis qu’après approbation
    définitive et formalisation des engagements nécessaires.""",
  """TamAssur est présenté aux chauffeurs dès la formalisation des engagements avec NSIA.""")

# ------------------------------------------------------------------ 4.4.1 + prix d'entrée (voitures : −200 F)
R("TamCar cherchera à répondre à plusieurs attentes :", "TamCar répond à plusieurs attentes :")
R("""La communication commerciale devra correspondre aux fonctionnalités effectivement
    disponibles. Les engagements relatifs à la disponibilité, à la sécurité, au prix ou au délai
    de prise en charge seront formulés avec prudence et vérifiés pendant la phase pilote.""",
  """La communication commerciale correspond aux fonctionnalités effectivement disponibles :
    prix annoncé avant la course, chauffeur identifié, suivi du trajet. Les engagements de
    disponibilité et de délai de prise en charge sont mesurés pendant la phase pilote avant
    d’être affichés.""")
R('<b style="font-size:19px">700 F</b><span>Voiture Essentiel</span>', '<b style="font-size:19px">500 F</b><span>Voiture Essentiel</span>')
R('<b style="font-size:19px">900 F</b><span>Voiture Confort</span>', '<b style="font-size:19px">700 F</b><span>Voiture Confort</span>')
R('<b style="font-size:19px">1 150 F</b><span>Voiture VIP</span>', '<b style="font-size:19px">950 F</b><span>Voiture VIP</span>')

# ------------------------------------------------------------------ 4.4.2
R("Ce segment pourra être approché au moyen d’actions de communication ciblées, à condition que les tarifs et la disponibilité du service correspondent effectivement à leurs besoins.",
  "Ce segment est approché par des actions de communication ciblées, avec des tarifs et une disponibilité du service adaptés à leurs besoins.")
R("peuvent constituer une occasion de développer des usages récurrents.", "sont l’occasion de développer des usages récurrents.")
R("TamCar cherchera également à répondre aux déplacements ponctuels", "TamCar répond également aux déplacements ponctuels")
R("À moyen terme, TamCar pourra étudier des offres destinées aux entreprises ayant des besoins réguliers de déplacement pour leurs collaborateurs ou leurs visiteurs.",
  "À moyen terme, TamCar propose des offres destinées aux entreprises ayant des besoins réguliers de déplacement pour leurs collaborateurs ou leurs visiteurs.")
R("""Ces segments constituent des cibles commerciales à tester. Leur importance relative et leur
    potentiel de conversion devront être mesurés au cours du lancement.""",
  """Ces segments sont les cibles commerciales retenues par l’étude de terrain. Leur importance
    relative et leur taux de conversion sont suivis dès le lancement.""")

# ------------------------------------------------------------------ 4.4.3
R("Les canaux numériques comprendront les réseaux sociaux", "Les canaux numériques comprennent les réseaux sociaux")
R("Les actions de proximité pourront inclure des démonstrations", "Les actions de proximité comprennent des démonstrations")
f.span('<div class="callout rouille ajout" style="margin-top:10px">\n    <strong>Budget de lancement.</strong>',
       'en suivant son coût par course réalisée.\n  </div>',
       """<div class="callout rouille ajout" style="margin-top:10px">
    <strong>Budget de lancement.</strong> Les actions de communication sont inscrites au budget :
    1 000 000 F de marketing de lancement (photo, vidéo, sponsoring) et 150 000 F de graphisme au
    mois 0, puis un budget plafonné de promotions de lancement sur les six premiers mois. Les
    canaux numériques sont alimentés par l’équipe ; la publicité payante s’y ajoute à mesure que la
    trésorerie le permet, en suivant son coût par course réalisée.
  </div>

  <div class="callout vert" style="margin-top:10px">
    <strong>La commande par WhatsApp.</strong> Toute la population connectée du Bénin utilise
    WhatsApp : commander un transport depuis une messagerie que l’on pratique déjà est hyper
    simple pour quiconque, qu’il soit ou non à l’aise avec les nouvelles applications. Tout le
    processus de commande se fera par WhatsApp ; c’est l’une des étapes à réaliser avant le
    lancement (2.9, 10.2).
  </div>""")

# ------------------------------------------------------------------ 4.5.1 / 4.5.2
R("TamCar souhaite développer une politique tarifaire claire et stable, conciliant", "TamCar applique une politique tarifaire claire et stable, conciliant")
R("""La grille tarifaire devra être construite à partir de simulations et de tests. Elle
        précisera, selon le modèle retenu, les règles de calcul des courses, les commissions
        applicables, les éventuels frais additionnels et les conditions d’application des
        promotions.""",
  """La grille tarifaire est construite à partir de simulations. Elle précise les règles de
        calcul des courses (base, kilomètres, minutes), les commissions applicables, les frais
        additionnels (climatisation) et les conditions d’application des promotions.""")
R("La politique tarifaire devra satisfaire trois objectifs complémentaires :", "La politique tarifaire satisfait trois objectifs complémentaires :")
R("""Avant le lancement, plusieurs scénarios de prix devront être simulés pour mesurer leur
        effet sur le revenu du chauffeur, la commission de TamCar et le coût supporté par le
        passager.""",
  """Plusieurs scénarios de prix ont été simulés pour mesurer leur effet sur le revenu du
        chauffeur, la commission de TamCar et le coût supporté par le passager. La grille
        ci-dessous en est le résultat.""")
R("""La plateforme devra notamment vérifier qu’une réduction tarifaire accordée au client ne
        fragilise pas excessivement la rémunération du chauffeur ou la marge de TamCar.""",
  """Ces simulations ont vérifié qu’une réduction tarifaire accordée au client ne fragilise
        ni la rémunération du chauffeur ni la marge de TamCar. Le minimum des voitures a été
        abaissé de 200 F dans chaque catégorie.""")
R("Les tarifs définitifs ne seront arrêtés qu’après cette analyse et les tests commerciaux nécessaires.",
  "La grille est arrêtée : ce sont les tarifs appliqués au lancement.")
R("Première simulation, avec la grille actuelle", "Simulation de la grille retenue")
R("""<tr><td>Voiture Essentiel</td><td>700</td><td>900</td><td class="tam">1 200</td><td>2 150</td></tr>""",
  """<tr><td>Voiture Essentiel</td><td>500</td><td>700</td><td class="tam">1 000</td><td>1 950</td></tr>""")
R("""<tr><td>Voiture Confort<small>climatisée</small></td><td>900</td><td>1 150</td><td class="tam">1 550</td><td>2 800</td></tr>""",
  """<tr><td>Voiture Confort<small>climatisée</small></td><td>700</td><td>950</td><td class="tam">1 350</td><td>2 600</td></tr>""")
R("""<tr><td>Voiture VIP</td><td>1 150</td><td>1 450</td><td class="tam">2 000</td><td>3 600</td></tr>""",
  """<tr><td>Voiture VIP</td><td>950</td><td>1 250</td><td class="tam">1 800</td><td>3 400</td></tr>""")
R("<td>8 à 13</td><td>11</td><td>10</td>", "<td>8 à 15</td><td>11</td><td>10</td>")
R("""L’argument auprès des conducteurs de moto devra donc reposer sur le prix annoncé,
      la clientèle supplémentaire, l’épargne et l’assurance.""",
  """L’argument auprès des conducteurs de moto repose donc sur le prix annoncé, la clientèle
      supplémentaire, l’épargne et l’assurance.""")
f.span('<div class="rnote">Objectifs 15 000 / 9 000 / 4 500 F par jour : vos chiffres. Le plan', 'la migration SQL passée.</div>', '')

# ------------------------------------------------------------------ 4.5.3
R("""Des promotions pourront être proposées pour faciliter l’adoption initiale du service :
        réduction sur une première course, crédit promotionnel ou avantage accordé après
        plusieurs courses.""",
  """Les promotions de lancement facilitent l’adoption initiale du service : une réduction
        sur la première course, rien de plus.""")
R("Ces mesures devront rester limitées dans leur durée et leur coût. Chaque campagne sera", "Ces mesures sont limitées dans leur durée et leur coût. Chaque campagne est")
R("""Une croissance du nombre
        de courses obtenue uniquement par des réductions importantes ne constituerait pas, à
        elle seule, la preuve d’un modèle économique viable.""",
  """TamCar ne fonde pas sa
        croissance sur des réductions importantes : elle repose sur la valeur du service.""")
R("""La restriction à la
      première course et le suivi du budget consommé sont à ajouter avant le lancement.""",
  """La restriction à la
      première course et le suivi du budget consommé sont ajoutés avant le lancement.""")
f.span('<div class="rnote">Aucun montant n’est indiqué, comme demandé.', 'avant la campagne.</div>', '')

# ------------------------------------------------------------------ 4.6
R("""TamPass est envisagé comme une offre destinée à faciliter l’organisation de
        déplacements réguliers et à renforcer la relation entre les passagers et les chauffeurs.""",
  """TamPass est une offre destinée à faciliter l’organisation de déplacements réguliers et à
        renforcer la relation entre les passagers et les chauffeurs.""")
R("""Le service pourrait notamment permettre de structurer des besoins récurrents, par
        exemple pour les trajets domicile-travail ou certains déplacements professionnels
        planifiés.""",
  """Le service permet de structurer des besoins récurrents, par exemple les trajets
        domicile-travail ou certains déplacements professionnels planifiés.""")
R("""Avant son déploiement, TamCar devra préciser les fonctionnalités couvertes, les
        modalités de réservation, les conditions de disponibilité, les règles d’annulation et le
        modèle de rémunération applicable.""",
  """Les conditions de TamPass précisent les fonctionnalités couvertes, les modalités de
        réservation, les conditions de disponibilité, les règles d’annulation et le modèle de
        rémunération applicable.""")
R("""<strong>TamPass ne sera pas considéré comme une source de revenus récurrents déjà
    acquise.</strong> Sa viabilité dépendra de la demande observée, de la capacité à honorer les
    trajets planifiés et de l’équilibre économique de l’offre.""",
  """<strong>TamPass renforce la récurrence des courses.</strong> Le plan de trésorerie ne compte
    aucun revenu propre à TamPass : il n’est pas un revenu acquis, mais un levier de fidélité des
    passagers et de visibilité pour les chauffeurs.""")
R("""(souscription, planification, notifications). Restent à arrêter les conditions
    commerciales listées ci-dessus, en particulier la rémunération et les règles d’annulation.""",
  """(souscription, planification, notifications).""")

# ------------------------------------------------------------------ 4.7
R("La communication de TamCar cherchera à construire l’image d’une plateforme de transport", "La communication de TamCar construit l’image d’une plateforme de transport")
R("Le discours commercial devra être concret et centré", "Le discours commercial est concret et centré")
R("""TamCar évitera les affirmations absolues sur sa fiabilité, sa sécurité ou sa
        supériorité par rapport aux autres plateformes sans éléments permettant de les
        justifier.""",
  """TamCar n’avance que des affirmations qu’il peut justifier sur sa fiabilité, sa sécurité
        ou sa différence avec les autres plateformes.""")
R("Les supports de communication à préparer comprendront :", "Les supports de communication comprennent :")
R("<li>des supports destinés aux partenaires commerciaux potentiels.</li>",
  "<li>l’équipement de marque des chauffeurs : casque, gilet et habillage du véhicule ;</li>\n        <li>des supports destinés aux partenaires commerciaux.</li>")
R("""Les contenus devront expliquer le service dans un langage accessible, avec des exemples
        concrets d’utilisation. Ils contribueront également à instaurer la confiance avant la
        première course.""",
  """Les contenus expliquent le service dans un langage accessible, avec des exemples concrets
        d’utilisation. Ils instaurent également la confiance avant la première course.""")
R("La réputation de TamCar dépendra largement de l’expérience réelle des premiers", "La réputation de TamCar repose largement sur l’expérience réelle des premiers")
R("Un dispositif de recueil des retours devra être mis en place dès la phase pilote.", "Un dispositif de recueil des retours est en place dès la phase pilote.")
R("""Les avis et témoignages pourront ensuite contribuer à la communication, sous réserve de
        leur authenticité et de l’accord des personnes concernées.""",
  """Les avis et témoignages authentiques, publiés avec l’accord des personnes concernées,
        alimentent ensuite la communication.""")

# ------------------------------------------------------------------ 4.8
R("Cette phase devra permettre d’identifier les dysfonctionnements techniques et", "Cette phase identifie les dysfonctionnements techniques et")
R("""L’extension vers d’autres zones, notamment Parakou, sera conditionnée à des résultats
          suffisants et à la disponibilité des ressources nécessaires.""",
  """L’extension vers d’autres zones, notamment Parakou (mois 7), suit les résultats de
          Cotonou et les ressources disponibles.""")

# ------------------------------------------------------------------ 4.9
R("""Les objectifs chiffrés seront fixés dans le plan opérationnel et le prévisionnel
      financier. Il serait prématuré de présenter des volumes de courses ou des coûts
      d’acquisition comme des résultats attendus fiables sans données pilotes.""",
  """Les objectifs chiffrés sont fixés dans le prévisionnel financier (partie 7) : 9 000 F par
      jour et par tricycle, 4 500 F par moto, 15 000 F par voiture (4.5.2).""")
f.span('<div class="callout vert ajout" style="margin-top:10px">\n    <strong>Deux postes à créer avant le pilote.</strong>', 'suffit à démarrer.\n  </div>', '')

# ------------------------------------------------------------------ 4.10 / 4.11
R("""<td>Elle pourrait provoquer des délais élevés ou l’impossibilité de satisfaire certaines commandes.</td><td>TamCar devra adapter l’intensité de ses campagnes à la disponibilité réelle des chauffeurs.</td>""",
  """<td>Délais d’attente élevés ou impossibilité de satisfaire certaines commandes.</td><td>TamCar adapte l’intensité de ses campagnes à la disponibilité réelle des chauffeurs.</td>""")
R("""<td>Les premières campagnes pourraient générer de l’intérêt sans entraîner suffisamment de courses.</td><td>La phase pilote permettra de tester les messages commerciaux et les canaux d’acquisition avant d’augmenter les dépenses.</td>""",
  """<td>Les premières campagnes génèrent de l’intérêt sans entraîner assez de courses.</td><td>La phase pilote teste les messages commerciaux et les canaux d’acquisition avant toute hausse des dépenses.</td>""")
R("""<td>La concurrence pourrait rendre difficile le maintien d’un équilibre entre accessibilité et rentabilité.</td><td>TamCar devra éviter de fonder son positionnement uniquement sur les prix bas.</td>""",
  """<td>La concurrence rend plus difficile l’équilibre entre accessibilité et rentabilité.</td><td>TamCar ne fonde pas son positionnement uniquement sur les prix bas.</td>""")
R("""<td>Les passagers et les chauffeurs pourraient essayer le service sans l’adopter durablement.</td><td>L’analyse des motifs de départ et des réclamations permettra de prioriser les améliorations.</td>""",
  """<td>Passagers et chauffeurs essaient le service sans l’adopter durablement.</td><td>L’analyse des motifs de départ et des réclamations priorise les améliorations.</td>""")
R("""<td>Des campagnes coûteuses pourraient augmenter les inscriptions sans générer assez de courses rentables.</td><td>Les dépenses devront être suivies en fonction des conversions et de la valeur réelle des utilisateurs acquis.</td>""",
  """<td>Des campagnes coûteuses augmentent les inscriptions sans générer assez de courses rentables.</td><td>Les dépenses sont suivies en fonction des conversions et de la valeur réelle des utilisateurs acquis.</td>""")
R("""<td>Une expansion avant la stabilisation du modèle pourrait disperser les ressources et dégrader la qualité du service.</td><td>Le développement sera donc progressif et conditionné aux résultats.</td>""",
  """<td>Une expansion avant la stabilisation du modèle disperse les ressources et dégrade la qualité du service.</td><td>Le développement est progressif et suit les résultats.</td>""")
R("""<td>Gozem s’est retiré de Parakou : son recrutement de chauffeurs n’aurait pas trouvé assez d’intéressés.</td><td>Conditionner l’ouverture à un nombre suffisant de chauffeurs engagés et aux résultats de Cotonou.</td>""",
  """<td>Gozem s’est retiré de Parakou : son recrutement de chauffeurs n’a pas trouvé assez d’intéressés.</td><td>L’ouverture est conditionnée à un nombre suffisant de chauffeurs engagés et aux résultats de Cotonou.</td>""")
R("""<td>Un même client pourrait ouvrir plusieurs comptes pour obtenir plusieurs remises.</td>""",
  """<td>Un même client ouvre plusieurs comptes pour obtenir plusieurs remises.</td>""")
R("Mesurer le revenu réel au pilote, s’appuyer sur le prix annoncé, la clientèle, l’épargne et l’assurance ; ne promettre aucun revenu minimum.",
  "Le revenu réel est mesuré au pilote ; l’argument repose sur le prix annoncé, la clientèle, l’épargne et l’assurance ; aucun revenu minimum n’est promis.")
R("Une seule remise par client, rattachée au numéro de téléphone ; plafond de remise par client et budget mensuel plafonné.",
  "Une seule remise par client, rattachée au numéro de téléphone ; plafond de remise par client et budget mensuel plafonné.")
R("""Le positionnement recherché associe la transparence tarifaire, la qualité de prise en
        charge, la fidélisation des utilisateurs et la recherche d’un équilibre économique entre
        passagers, chauffeurs et plateforme.""",
  """Le positionnement de TamCar associe la transparence tarifaire, la qualité de prise en
        charge, la fidélisation des utilisateurs et un équilibre économique entre passagers,
        chauffeurs et plateforme.""")
R("""TamPass et TamAssur, le mécanisme d’épargne envisagé pour les chauffeurs, pourront contribuer à
        cette stratégie, mais leur déploiement dépendra de la validation de leurs modalités et
        de leur faisabilité opérationnelle.""",
  """TamPass et TamAssur, le mécanisme d’épargne des chauffeurs, contribuent à cette
        stratégie : TamPass est déjà dans l’application, TamAssur est conçu avec NSIA Assurances
        et formalisé avant son déploiement.""")
R("""Cette approche vise à éviter une croissance fondée uniquement sur la communication ou
        les promotions. Pour TamCar, la réussite commerciale devra se mesurer à sa capacité à
        générer des courses réellement effectuées, à satisfaire ses utilisateurs et à
        construire progressivement une activité économiquement soutenable.""",
  """Cette approche évite une croissance fondée uniquement sur la communication ou les
        promotions. La réussite commerciale de TamCar se mesure à sa capacité à générer des
        courses réellement effectuées, à satisfaire ses utilisateurs et à construire
        progressivement une activité économiquement soutenable.""")

f.ecrire()
