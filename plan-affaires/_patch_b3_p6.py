from _patchlib import Fichier

f = Fichier('partie6.html')
R = f.rep

R("TamPass et d’autres services. Ce sont des revenus possibles, pas acquis : ils dépendent de l’adoption par les clients (6.5).",
  "TamPass et d’autres services : des revenus additionnels, qui s’ajoutent à la base et ne figurent pas dans le plan de trésorerie (6.5).")
R("""Elle devra être
        intégrée aux règles de calcul de la plateforme et présentée de manière compréhensible
        aux chauffeurs et aux partenaires.""",
  """Elle est
        intégrée aux règles de calcul de la plateforme et présentée de manière compréhensible
        aux chauffeurs et aux partenaires.""")
R("""Le traitement du fonds de rachat et la part effectivement conservée par TamCar doivent
        être distingués.""", """Le traitement du fonds de rachat et la part effectivement conservée par TamCar sont
        distingués.""")
R("""Ces
        prélèvements doivent être correctement retracés afin d’éviter toute confusion entre les""",
  """Ces
        prélèvements sont retracés ligne par ligne afin d’éviter toute confusion entre les""")
R("""Plus l’activité progresse, plus les commissions potentielles augmentent, sous
        réserve du respect de la clé de répartition et de l’encaissement effectif des sommes dues.""",
  """Plus l’activité progresse, plus les commissions augmentent, selon la clé de
        répartition et l’encaissement effectif des sommes dues.""")
R("""Cette facilité doit être
        accompagnée d’un suivi des soldes, de règles de recouvrement et de contrôles permettant
        de limiter les impayés.""",
  """Cette facilité s’accompagne
        d’un suivi des soldes, de règles de recouvrement et de contrôles qui limitent les
        impayés.""")
R("pour un investissement total estimé à 15 000 000 FCFA</span>", "pour un investissement total de 15 000 000 FCFA</span>")
R("Dans le modèle envisagé, le propriétaire du véhicule reçoit", "Dans le modèle, le propriétaire du véhicule reçoit")
R("Cette activité doit être suivie séparément des commissions ordinaires de la plateforme :", "Cette activité est suivie séparément des commissions ordinaires de la plateforme :")
R("""ne constituent pas nécessairement des revenus disponibles
        pour TamCar</strong>""", """ne constituent pas, en totalité, des revenus disponibles
        pour TamCar</strong>""")
R("services complémentaires susceptibles de diversifier\n        ses revenus,", "services complémentaires qui diversifient\n        ses revenus,")
R("""TamPass vise à proposer aux utilisateurs une formule adaptée aux déplacements récurrents.
        Son intérêt économique dépendra du niveau d’adoption, de la fréquence d’utilisation, du
        tarif retenu et du coût des avantages accordés aux abonnés.""",
  """TamPass propose aux utilisateurs une formule adaptée aux déplacements récurrents. Son
        intérêt économique tient au niveau d’adoption, à la fréquence d’utilisation, au tarif et
        au coût des avantages accordés aux abonnés.""")
R("""Les revenus issus de ces services ne doivent toutefois pas être considérés comme acquis
        avant la mise en place effective des offres commerciales et la validation de leurs
        conditions d’utilisation.""",
  """Le plan de trésorerie ne compte aucun revenu issu de ces services : ils s’ajoutent aux
        revenus du plan.""")
R("""De même, TamAssur et les partenariats financiers envisagés devront faire
        l’objet d’accords formalisés et, le cas échéant, des vérifications juridiques et
        réglementaires nécessaires avant d’être intégrés aux prévisions de revenus.""",
  """De même, TamAssur et les partenariats financiers font l’objet d’accords formalisés et des
        vérifications juridiques et réglementaires nécessaires ; ils ne figurent pas dans les
        prévisions de revenus.""")
R("La rentabilité de TamCar dépendra principalement de plusieurs facteurs :", "La rentabilité de TamCar repose principalement sur six facteurs :")
R("""Le suivi de ces indicateurs permettra d’ajuster progressivement la stratégie commerciale, le
    déploiement de la flotte et les dépenses de fonctionnement.""",
  """Le suivi de ces indicateurs ajuste progressivement la stratégie commerciale, le
    déploiement de la flotte et les dépenses de fonctionnement.""")
R("""tandis que la
        flotte doit favoriser le recrutement des chauffeurs et soutenir le développement de
        l’activité.""",
  """tandis que la
        flotte favorise le recrutement des chauffeurs et soutient le développement de
        l’activité.""")
R("""Les hypothèses de revenus, les besoins de financement et les projections de trésorerie
        seront examinés dans les parties financières du présent business plan.""",
  """Les hypothèses de revenus, les besoins de financement et les projections de trésorerie
        sont présentés dans les parties financières du présent business plan (parties 7 et 8).""")

f.ecrire()
