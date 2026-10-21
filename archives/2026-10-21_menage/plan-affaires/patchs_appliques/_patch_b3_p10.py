from _patchlib import Fichier

f = Fichier('gen_partie10.py')
R = f.rep

# ------------------------------------------------------------------ 10.1
R("afin de maîtriser les dépenses, de tester les\n        hypothèses opérationnelles et d’adapter", "afin de maîtriser les dépenses, de valider les\n        hypothèses opérationnelles et d’adapter")
R("""Cette première phase doit permettre d’évaluer le fonctionnement du dispositif dans <span class="modif">deux pôles urbains</span>,
        d’apprécier la capacité de mobilisation des conducteurs et de mesurer la viabilité économique de l’exploitation.""",
  """Cette première phase évalue le fonctionnement du dispositif dans <span class="modif">deux pôles urbains</span>,
        la capacité de mobilisation des conducteurs et la viabilité économique de l’exploitation.""")
R("""Le calendrier initial du projet ayant été établi pour 2026-2029, les échéances déjà engagées ou dépassées
    devront être confirmées avant validation définitive du présent plan.<span class="modif"> Le lancement est fixé à {date(1)} (mois 1 du modèle) ; le calendrier est actualisé en conséquence (10.6).</span>""",
  """Le calendrier initial du projet couvrait 2026-2029.<span class="modif"> Le lancement est fixé à {date(1)} (mois 1 du modèle) ; le calendrier est actualisé en conséquence (10.6).</span>""")
f.span('<div class="rnote">Votre texte parle de quinze tricycles', 'dans toute la partie.</div>', '')

# ------------------------------------------------------------------ 10.2
R("""Cette phase doit permettre de réunir les conditions
    juridiques, financières, matérielles et techniques nécessaires au lancement de TamCar. Les principales actions prévues sont les suivantes :""",
  """Cette phase réunit les conditions
    juridiques, financières, matérielles et techniques nécessaires au lancement de TamCar. Les principales actions prévues sont les suivantes :""")
R("le second lot est commandé au mois {M_LOT2 - 1}</span>, sous réserve de la sécurisation du financement ;",
  "le second lot est commandé au mois {M_LOT2 - 1}</span>, une fois le financement sécurisé ;")
R("""<li>mettre en service le paiement automatique par Mobile Money (FeexPay) avant le lancement.</li>""",
  """<li>mettre en service le paiement automatique par Mobile Money (FeexPay) avant le lancement ;</li>
      <li>intégrer la commande d’un véhicule de bout en bout par WhatsApp (11.10).</li>""")
R("""La constitution de la société, l’apport de la plateforme et la commande des véhicules devront être coordonnés afin d’éviter que TamCar
    ne supporte des engagements financiers importants avant d’avoir sécurisé les ressources nécessaires.""",
  """La constitution de la société, l’apport de la plateforme et la commande des véhicules sont coordonnés : TamCar
    ne supporte aucun engagement financier important avant d’avoir sécurisé les ressources nécessaires.""")
f.span('<div class="rnote">Modifié pour coller au plan :', 'deux lots de véhicules (7.4).</div>', '')

# ------------------------------------------------------------------ 10.3
R("""<li>faire le bilan du test des motos au mois 3 (cas B), sans arrêt automatique (8.8).</li>""",
  """<li>faire le bilan du test des motos au mois 3 (cas B), sans arrêt automatique (8.8) ;</li>
      <li>ouvrir la commande par WhatsApp : tout le processus de commande, du lieu de départ au suivi de la course, passe par la messagerie que la population connectée utilise déjà (11.10).</li>""")
R("""Le lancement de TamPass devra être subordonné à la disponibilité effective des
      fonctionnalités correspondantes et à la validation de leurs modalités opérationnelles.<span class="modif"> TamPass existe déjà dans l’application (4.6) ; ses conditions commerciales restent à valider.</span>""",
  """Le déploiement de TamPass suit la disponibilité des
      fonctionnalités correspondantes.<span class="modif"> TamPass existe déjà dans l’application (4.6) ; ses conditions commerciales sont arrêtées au lancement.</span>""")
f.span('<div class="rnote">Le second lot (Parakou) arrive au mois', 'reste à faire (11.5).</div>', '')

# ------------------------------------------------------------------ 10.4
R("Après le lancement, TamCar devra privilégier la consolidation de son modèle avant d’engager une", "Après le lancement, TamCar privilégie la consolidation de son modèle avant d’engager une")
R("""Une attention particulière sera accordée à Parakou, où le projet prévoit une phase pilote. Le maintien du dispositif dans cette ville devra être
      apprécié à partir des résultats réellement observés. Si l’activité demeure insuffisante malgré les mesures correctives, une réaffectation de
      certains véhicules vers les villes présentant une demande plus soutenue pourra être étudiée.""",
  """Une attention particulière est accordée à Parakou, où le projet prévoit une phase pilote. Le maintien du dispositif dans cette ville est
      apprécié à partir des résultats réellement observés. Si l’activité demeure insuffisante malgré les mesures correctives, certains véhicules
      sont réaffectés vers les villes présentant une demande plus soutenue.""")
R("""la préparation d’un éventuel deuxième cycle d’investissement.
      Cette nouvelle phase ne devra être engagée qu’après examen des résultats du premier cycle, de la trésorerie disponible et des engagements
      financiers restant à honorer.""",
  """la préparation d’un deuxième cycle d’investissement.
      Cette nouvelle phase est engagée après examen des résultats du premier cycle, de la trésorerie disponible et des engagements
      financiers restant à honorer.""")

# ------------------------------------------------------------------ 10.5
R("avec une échéance indicative de trente-six mois", "avec une échéance de trente-six mois")
R("Cette évolution doit permettre aux conducteurs concernés d’accéder progressivement", "Cette évolution permet aux conducteurs concernés d’accéder progressivement")
R("La mise en œuvre de cette phase supposera notamment :", "La mise en œuvre de cette phase comprend notamment :")
R("d’étudier l’opportunité d’un deuxième cycle de déploiement, portant initialement sur quinze à vingt véhicules, avec la possibilité d’intégrer des voitures selon la demande et les moyens disponibles.",
  "de préparer un deuxième cycle de déploiement, portant initialement sur quinze à vingt véhicules, avec des voitures selon la demande et les moyens disponibles.")
R("""L’extension de la flotte devra rester progressive. Elle dépendra de la demande observée, de la disponibilité des conducteurs, de la performance
      économique des véhicules et de la capacité de TamCar à financer cette croissance sans fragiliser sa trésorerie.""",
  """L’extension de la flotte reste progressive : elle suit la demande observée, la disponibilité des conducteurs, la performance
      économique des véhicules et la capacité de TamCar à financer cette croissance sans fragiliser sa trésorerie.""")
R("durable, susceptible de soutenir de nouveaux investissements.", "durable, qui soutient de nouveaux investissements.")
f.span('<div class="rnote">Phase 4 re-datée :', 'ne tenait que pour les motos.</div>', '')

# ------------------------------------------------------------------ 10.7 / 10.8
R("""Le calendrier constitue une trajectoire prévisionnelle et non un engagement irrévocable. Le passage à chaque phase devra être conditionné par
      l’atteinte de critères vérifiables.""",
  """Le calendrier est la trajectoire prévisionnelle du plan. Le passage à chaque phase est conditionné par
      l’atteinte de critères vérifiables.""")
R("""Avant le lancement commercial, TamCar devra notamment avoir sécurisé son financement, vérifié la conformité de son dispositif réglementaire,
      confirmé la disponibilité des véhicules et testé les fonctionnalités indispensables à l’exploitation.""",
  """Avant le lancement commercial, TamCar sécurise son financement, vérifie la conformité de son dispositif réglementaire,
      confirme la disponibilité des véhicules et teste les fonctionnalités indispensables à l’exploitation.""")
R("""Avant de préparer un deuxième cycle d’investissement, la société devra disposer de données suffisamment fiables sur le volume de courses, les
      commissions encaissées, les charges réelles, les incidents opérationnels et la trésorerie. Les projections financières ne devront pas être
      assimilées à des résultats déjà obtenus.""",
  """Avant de préparer un deuxième cycle d’investissement, la société dispose de données fiables sur le volume de courses, les
      commissions encaissées, les charges réelles, les incidents opérationnels et la trésorerie.""")
R("""les formalités de transfert devront être
      vérifiées individuellement.""", """les formalités de transfert sont
      vérifiées individuellement.""")
R("10.8 · Point de vigilance sur le calendrier", "10.8 · État d’avancement et calendrier retenu")
R("""Le calendrier initial situe la formalisation et la préparation du projet au troisième trimestre 2026, puis le lancement au quatrième
        trimestre de la même année. Au 30 septembre 2026, il est donc nécessaire de confirmer l’état d’avancement réel de chaque action.""",
  """Le calendrier initial situait la formalisation et la préparation du projet au troisième trimestre 2026, puis le lancement au quatrième
        trimestre de la même année. Au 30 septembre 2026, l’état d’avancement de chaque action est établi ci-dessous et le lancement est
        fixé à janvier 2027.""")
R("""Les étapes déjà réalisées devront être identifiées comme telles. Celles qui ne le sont pas devront être reprogrammées en fonction du
        financement disponible, des délais de constitution de la société, de la commande des véhicules et de la préparation technique. Cette
        actualisation permettra de conserver un calendrier crédible et cohérent avec les moyens effectivement mobilisables par TamCar.""",
  """Les étapes déjà réalisées sont identifiées comme telles ; les autres sont reprogrammées en fonction du financement disponible, des
        délais de constitution de la société, de la commande des véhicules et de la préparation technique. Cette actualisation donne un
        calendrier cohérent avec les moyens mobilisables par TamCar.""")
R("""<li>Mettre en service le paiement automatique par Mobile Money (FeexPay).</li>""",
  """<li>Mettre en service le paiement automatique par Mobile Money (FeexPay).</li>
        <li>Intégrer la commande d’un véhicule de bout en bout par WhatsApp (11.10).</li>""")
f.span('<div class="rnote">Je ne connais pas l’avancement réel', 'cette liste est à corriger.</div>', '')

# ------------------------------------------------------------------ 10.9
R("la perte réelle serait plus faible.", "la perte réelle est plus faible.")
f.span('<div class="rnote">Hypothèses de ma part : part de TamCar 23 %', 'ne sont pas dans les cas A et B.</div>', '')

f.ecrire()

g = Fichier('gen_partie11.py')
g.rep("""la conformité à la réglementation béninoise sur les données personnelles et une revue de sécurité indépendante restent à réaliser avant le passage à l’échelle.""",
      """la conformité à la réglementation béninoise sur les données personnelles et une revue de sécurité indépendante sont réalisées avant le passage à l’échelle.""")
g.rep("""<p><strong>Trackers GPS</strong> : pose sur les véhicules de TamCar et suivi de leur renouvellement annuel.</p>""",
      """<p><strong>Commande par WhatsApp</strong> : tout le processus de commande, du départ au suivi de la course, passe par WhatsApp ; configuration chez Meta (numéro, modèles, webhook), puis essais.</p>
      <p><strong>Trackers GPS</strong> : pose sur les véhicules de TamCar et suivi de leur renouvellement annuel.</p>""")
g.rep("""      <p><strong>WhatsApp</strong> : activer le bot Tamy après la configuration chez Meta (numéro, modèles de message, webhook).</p>
""", "")
g.ecrire()
