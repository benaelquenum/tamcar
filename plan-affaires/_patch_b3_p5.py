from _patchlib import Fichier

f = Fichier('partie5.html')
R = f.rep

R("""Cette organisation doit permettre à TamCar de <strong>maîtriser une partie de son offre de
        transport</strong>""", """Cette organisation permet à TamCar de <strong>maîtriser une partie de son offre de
        transport</strong>""")
R("Elle devra néanmoins assurer la\n    continuité du service,", "Elle assure néanmoins la\n    continuité du service,")
R("(30 % du prix dans le calcul actuel de la plateforme).", "(30 % du prix).")
f.span('<div class="rnote">Avance : par véhicule ou par concessionnaire ?', 'pas encore dans le code).</div>', '')

R("""avec un suivi renforcé destiné à mesurer la
        demande et à apprécier les conditions d’une implantation durable.""",
  """avec un suivi renforcé qui mesure la demande
        et établit les conditions d’une implantation durable.""")

# Responsable Opérations
R("<div><h6>Statut</h6><b>À définir</b><small>selon la réalité de sa relation avec TamCar ; peut aussi être chauffeur</small></div>",
  "<div><h6>Statut</h6><b>Selon sa situation</b><small>défini selon la réalité de sa relation avec TamCar ; peut aussi être chauffeur</small></div>")
R("""Le Responsable Opérations devra disposer de bonnes capacités d’organisation, d’une
        connaissance du terrain et d’une aptitude à encadrer des chauffeurs. Une expérience dans
        le transport, la distribution, la gestion d’équipe ou le développement commercial
        constituera un avantage.""",
  """Le Responsable Opérations dispose de bonnes capacités d’organisation, d’une
        connaissance du terrain et d’une aptitude à encadrer des chauffeurs. Une expérience dans
        le transport, la distribution, la gestion d’équipe ou le développement commercial
        constitue un avantage.""")
R("""Le modèle de TamCar prévoit que le responsable puisse également être chauffeur, sous
        réserve de la compatibilité de cette activité avec ses obligations de supervision.""",
  """Le responsable peut également être chauffeur, dès lors que cette activité reste
        compatible avec ses obligations de supervision.""")
R("""Les modalités contractuelles devront préciser l’assiette exacte du calcul, le traitement des
    annulations et remboursements, la périodicité du paiement et les modalités de contrôle. Le
    statut juridique de chaque responsable devra également être défini en fonction de la réalité
    de sa relation avec TamCar.""",
  """Le contrat de chaque responsable précise l’assiette du calcul (le volume de courses
    réalisées), le traitement des annulations et remboursements, la périodicité du paiement et
    les modalités de contrôle. Son statut juridique est défini selon la réalité de sa relation
    avec TamCar.""")

# Secrétaire-comptable
R("<div><h6>Statut</h6><b>Salariat envisagé</b><small>périmètre comptable à préciser</small></div>",
  "<div><h6>Statut</h6><b>Salariat</b><small>comptabilité formelle confiée à un professionnel externe</small></div>")
R("<div><h6>Rémunération prévue</h6><b>100 000 F par mois</b><small>hypothèse budgétaire de départ</small></div>",
  "<div><h6>Rémunération prévue</h6><b>100 000 F par mois</b><small>montant brut budgété</small></div>")
R("""La Secrétaire-comptable devra être organisée, discrète, à l’aise avec les outils
        bureautiques et capable de tenir des documents de suivi fiables. Une formation en
        secrétariat comptable, comptabilité ou gestion administrative sera recherchée.""",
  """La Secrétaire-comptable est organisée, discrète, à l’aise avec les outils bureautiques et
        capable de tenir des documents de suivi fiables. Une formation en secrétariat
        comptable, comptabilité ou gestion administrative est recherchée.""")
R("""resteront confiés à un professionnel qualifié
        lorsque cela sera nécessaire.""", """sont confiés à un professionnel qualifié.""")
R("""Le poste est actuellement décrit comme
        couvrant l’accueil, l’administration, l’appui au support et au recouvrement.""",
  """Le poste couvre l’accueil, l’administration, l’appui au support et au recouvrement.""")
R("""L’intitulé « Secrétaire-comptable » élargit les responsabilités initialement décrites. Le
        montant de 100 000 FCFA peut donc être conservé comme hypothèse budgétaire de départ, à
        condition que les tâches comptables restent principalement administratives et que la
        comptabilité formelle soit confiée à un professionnel externe.""",
  """Les tâches comptables du poste restent principalement administratives : la comptabilité
        formelle est confiée à un professionnel externe, ce qui justifie le montant de
        100 000 FCFA par mois.""")
R("""Si la salariée doit assurer de façon autonome une comptabilité complète, la préparation
        des états financiers ou des responsabilités financières plus étendues, le niveau de
        rémunération devra être réexaminé avant le recrutement.""",
  """Une comptabilité complète tenue de façon autonome, la préparation des états financiers
        et les responsabilités financières plus étendues relèvent du professionnel externe,
        non de la secrétaire.""")

# Développeur
R("<div><h6>Modalité</h6><b>À arbitrer</b><small>prestation externalisée ou recrutement dédié</small></div>",
  "<div><h6>Modalité</h6><b>Prestation ou recrutement</b><small>selon la charge, à partir du mois 13</small></div>")
R("La fonction technique devra donc assurer la maintenance du produit et", "La fonction technique assure donc la maintenance du produit et")
R("""Le Développeur devra posséder les compétences techniques
    correspondant à l’architecture effectivement utilisée par TamCar. La connaissance de la
    maintenance d’applications mobiles, des services backend, des bases de données, des API et
    des outils de suivi des erreurs constituera un avantage.""".replace("\n    des outils", " des outils"),
  """Le Développeur possède les compétences techniques correspondant à
    l’architecture effectivement utilisée par TamCar. La connaissance de la maintenance
    d’applications mobiles, des services backend, des bases de données, des API et des outils
    de suivi des erreurs constitue un avantage.""")
R("""Il convient donc de distinguer le besoin opérationnel de la décision de recrutement. La
        maintenance technique est indispensable, mais elle ne nécessite pas nécessairement
        l’embauche immédiate d’un développeur à temps plein.""",
  """La maintenance technique est indispensable, mais elle ne nécessite pas l’embauche
        immédiate d’un développeur à temps plein : le fondateur l’assure la première année.""")
R("Pour la première phase, TamCar pourra retenir l’une des deux modalités suivantes :",
  "À partir du mois 13, la fonction technique prend l’une des deux modalités suivantes :")
R("""Le choix sera arrêté en fonction du niveau de disponibilité technique nécessaire, du budget et
      de la répartition des responsabilités entre le fondateur et le prestataire ou salarié.""",
  """Le choix se fait selon le niveau de disponibilité technique nécessaire, le budget et la
      répartition des responsabilités entre le fondateur et le prestataire ou salarié ; le
      budget de 200 000 FCFA par mois s’applique dans les deux cas.""")
R("Pour établir un budget complet, TamCar devra donc distinguer :", "Le budget technique distingue :")
R("<li>la rémunération éventuelle d’un développeur ou d’un prestataire.</li>", "<li>la rémunération d’un développeur ou d’un prestataire, dès le mois 13.</li>")
R("""Le montant de 200 000 FCFA par mois constitue l’hypothèse budgétaire du
    poste. La modalité d’intervention (prestation ou recrutement) reste à arrêter et pourra le
    faire évoluer ; le budget définitif sera intégré au plan de trésorerie.""",
  """Le montant de 200 000 FCFA par mois est le budget du poste, quelle que soit la modalité
    d’intervention (prestation ou recrutement) ; il est intégré au plan de trésorerie.""")
f.span('<div class="rnote">Le classeur budget 24 mois compte', 'À harmoniser aux parties 10-11.</div>', '')

# Fondateur
R("""Cette absence de rémunération initiale devra être prise en compte dans le prévisionnel
        financier. Les conditions d’une éventuelle rémunération future seront réexaminées lorsque
        l’activité et la trésorerie permettront de la soutenir.""",
  """Cette absence de rémunération initiale est prise en compte dans le prévisionnel
        financier. Les conditions d’une rémunération future sont arrêtées lorsque l’activité et
        la trésorerie permettent de la soutenir.""")

# 5.6
R("""Le tableau ci-dessous distingue les rémunérations <span class="modif">déjà prévues</span> des
    hypothèses qui restent à arbitrer.""",
  """Le tableau ci-dessous présente les <span class="modif">rémunérations prévues</span> pour
    chaque fonction.""")
R("<th>Statut ou mode de rémunération envisagé</th>", "<th>Statut ou mode de rémunération</th>")
R("<td>Salariat envisagé ; périmètre comptable à préciser</td>", "<td>Salariat ; comptabilité formelle confiée à un professionnel externe</td>")
R("<td>Prestation externalisée ou recrutement à arbitrer</td>", "<td>Prestation externalisée ou recrutement, au même budget</td>")
R("hors éventuelles charges patronales et frais de personnel.", "en montants bruts, hors charges patronales et frais de personnel.")
R("""Ce dispositif de suivi permettra d’adapter progressivement les moyens humains et techniques à
    l’activité réelle, sans créer prématurément une structure de coûts fixes trop lourde.""",
  """Ce dispositif de suivi adapte progressivement les moyens humains et techniques à
    l’activité réelle, sans structure de coûts fixes trop lourde.""")

# 5.8 / 5.9
R("""TamCar devra désigner les responsables de terrain, finaliser le recrutement administratif et arrêter l’organisation de la maintenance technique. Les procédures d’intégration des chauffeurs et de suivi des véhicules devront également être prêtes.""",
  """TamCar désigne les responsables de terrain, finalise le recrutement administratif et arrête l’organisation de la maintenance technique. Les procédures d’intégration des chauffeurs et de suivi des véhicules sont prêtes.""")
R("La direction pourra ajuster les responsabilités,", "La direction ajuste les responsabilités,")
R("""L’ouverture d’un nouveau marché ou l’augmentation du nombre de véhicules ne devra pas
    entraîner automatiquement une hausse des effectifs. Elle sera précédée d’une évaluation des
    besoins de supervision, de l’assistance et de la capacité financière de l’entreprise.""",
  """L’ouverture d’un nouveau marché ou l’augmentation du nombre de véhicules n’entraîne pas
    automatiquement une hausse des effectifs : elle est précédée d’une évaluation des besoins
    de supervision, de l’assistance et de la capacité financière de l’entreprise.""")
R("""La fonction technique doit assurer
        la continuité de la plateforme, selon un mode d’intervention qui reste à préciser.""",
  """La fonction technique assure
        la continuité de la plateforme, en prestation ou en recrutement dédié.""")
R("""La prochaine étape consistera à arrêter les profils définitifs, les conditions
        contractuelles et les budgets correspondants, puis à les intégrer au plan de trésorerie
        afin de vérifier leur compatibilité avec le financement de lancement.""",
  """Les budgets correspondants sont intégrés au plan de trésorerie (partie 7), qui vérifie
        leur compatibilité avec le financement de lancement ; les contrats sont établis avec
        chaque titulaire au moment du recrutement.""")

f.ecrire()
