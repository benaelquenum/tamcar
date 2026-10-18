"""Partie 5 : alignement sur le modèle v6 (flotte de départ de 15 véhicules, plus de lots, plus de cas A/B, plus d'avance concessionnaire)."""
import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _patchlib import Fichier
import modele_v6 as M

n = M.n
F = Fichier('partie5.html')
M.MOIS_PLAFOND_OPS = next(i for i, v in enumerate(M.ligne(33)) if v >= 150000)

# 5.1 : flotte
F.rep("""<span class="modif">10 tricycles neufs, livrés en deux lots de cinq : le premier à
        Cotonou, le second à Parakou (cas A). Dans le cas B, cinq motos neuves s’y ajoutent à
        Cotonou, en test.</span>""",
      """<span class="modif">quinze véhicules à Cotonou dès le premier mois : un tricycle thermique et cinq
        motos électriques achetés par TamCar, et neuf voitures (six Essentiel, trois Confort) mises à
        disposition par Afrik Group Consulting, associé de TamCar.</span>""")
F.rep("""relation durable avec les chauffeurs grâce au mécanisme de <strong>cession échelonnée prévu sur
        36 mois</strong>.""",
      """relation durable avec les chauffeurs grâce à la <strong>cession échelonnée du véhicule</strong>
        (12 mois pour une moto, 36 mois pour un tricycle ou une voiture Essentiel, 48 mois pour une Confort).""")

F.rep("""<strong>Deux cas de référence.</strong> La suite du document présente deux cas : le <strong>cas A</strong>
    (10 tricycles) et le <strong>cas B</strong> (cas A et 5 motos à Cotonou, avec un bilan à 3 mois). Les
    motos sont cédées au chauffeur après 24 mois, les tricycles après 36 mois. Carburant, entretien et
    réparations sont à la charge du conducteur ; TamCar ne répond que des défauts couverts par la garantie
    du fournisseur.""",
      """<strong>Un seul scénario de référence.</strong> La suite du document chiffre la <strong>flotte de départ</strong>
    (15 véhicules) et la <strong>flotte recrutée</strong> (au moins six voitures de tiers en plus, trois Essentiel et trois Confort,
    arrivées du mois 4 au mois 12). Les motos sont cédées au conducteur après 12 mois, les tricycles et les
    Essentiel après 36 mois, les Confort après 48 mois. Carburant, entretien et réparations sont à la charge du
    conducteur ; TamCar ne répond que des défauts couverts par la garantie du fournisseur.""")

F.rep("""véhicules (moto, tricycle, voiture) qui les mettent à disposition de chauffeurs recrutés
        et suivis avec TamCar. Le concessionnaire reste propriétaire du véhicule jusqu’à sa
        cession échelonnée au chauffeur, et perçoit une part de chaque course réalisée avec son
        véhicule (30 % du prix).""",
      """véhicules (moto, tricycle, voiture) qui les mettent à disposition de chauffeurs recrutés
        et suivis avec TamCar. Le propriétaire reste propriétaire du véhicule jusqu’à sa
        cession échelonnée au chauffeur, et perçoit 30 % de chaque course réalisée avec son
        véhicule, plus 5 % versés au fonds de cession (35 % du prix en tout).""")
F.rep("""Les véhicules des concessionnaires font grandir l’offre sans que TamCar en finance
        l’achat, et permettent à un chauffeur sans véhicule de rejoindre la plateforme. La
        flotte propre reste l’outil de test et de contrôle. Les comptes concessionnaires et la
        répartition de leur part sont déjà gérés par la plateforme.""",
      """Les véhicules de tiers font grandir l’offre sans que TamCar en finance l’achat, et
        permettent à un chauffeur sans véhicule de rejoindre la plateforme. Le plan en compte au
        minimum six. Les comptes propriétaires et la répartition de leur part sont déjà gérés
        par la plateforme.""")
F.rep("""<strong>Avance de démarrage remboursable.</strong> Chaque concessionnaire verse à TamCar une
    avance de démarrage selon le type de véhicule : <strong>50 000 F pour une moto, 75 000 F
    pour un tricycle, 100 000 F pour une voiture</strong>. Elle est remboursée sans intérêt,
    douze mois après la mise en service du premier véhicule. Ce n’est ni un apport au capital, ni
    une caution : elle est comptée comme une dette de TamCar envers le concessionnaire.""",
      f"""<strong>Pas d’avance, des frais d’entrée.</strong> Le propriétaire ne verse aucune avance à TamCar.
    TamCar avance les <strong>{n(M.FRAIS_ENTREE)} F de frais d’entrée par véhicule</strong> (inspection, habillage, kit chauffeur) ; assurance, tracker
    GPS et entretien d’une voiture restent à la charge de son propriétaire. Ces frais d’entrée sont comptés dans
    les charges de TamCar (8.3).""")

# 5.2.1 : un pôle
F.rep("""<span class="modif">Le dispositif initial prévoit deux pôles opérationnels, avec un
      Responsable Opérations dans chaque ville :</span>""",
      """<span class="modif">Le dispositif initial prévoit un seul pôle opérationnel, à Cotonou, avec un
      Responsable Opérations. Parakou est une extension ultérieure, hors des projections de base (9.3) :</span>""")
F.rep("""<h4>Cotonou · premier lot</h4>""", """<h4>Cotonou et Grand Nokoué · flotte de départ</h4>""")
F.rep("""Exploitation de cinq tricycles <span class="modif">(et, dans le cas B, de cinq motos)</span>, recrutement et suivi des chauffeurs, animation commerciale et supervision des courses.""",
      """Exploitation du tricycle, des cinq motos et des neuf voitures, recrutement et suivi des chauffeurs, animation commerciale et supervision des courses.""")
F.rep("""<h4>Parakou · second lot</h4>""", """<h4>Parakou · extension, hors projections</h4>""")
F.rep("""Exploitation pilote de cinq tricycles, avec un suivi renforcé qui mesure la demande
        et établit les conditions d’une implantation durable.
        <span class="modif">Le second lot est livré après la validation du premier marché.</span>""",
      """Ouverture décidée sur les résultats de Cotonou, selon des critères arrêtés d’avance (9.3), et financée par
        les recettes ou par une nouvelle levée. Elle n’est pas comptée dans les chiffres du plan.""")
F.rep("""Deux bureaux de proximité sont prévus, <span class="modif">à Cotonou et à Parakou</span>,
      avec un loyer budgété de <strong>50 000 FCFA par mois chacun</strong>. Ces locaux serviront notamment à l’accueil,
      au dépôt et à la vérification des dossiers, ainsi qu’aux échanges avec les chauffeurs.""",
      """Un bureau de proximité est prévu <span class="modif">à Cotonou</span>,
      avec un loyer budgété de <strong>50 000 FCFA par mois</strong>. Ce local servira notamment à l’accueil,
      au dépôt et à la vérification des dossiers, ainsi qu’aux échanges avec les chauffeurs.""")
F.rep("""<span class="modif">À Parakou, le bureau reste proportionné à la taille du pilote de cinq
      tricycles. Il ouvre avec le second lot.</span>""",
      """<span class="modif">Un bureau à Parakou ne serait ouvert qu’avec l’extension, proportionné à
      sa taille.</span>""")
F.rep("""<strong>Parakou : l’offre de chauffeurs d’abord.</strong> Gozem s’y est retiré faute de
    chauffeurs recrutés (information du fondateur). Le suivi renforcé du pilote portera donc en
    premier sur le nombre de chauffeurs engagés et actifs, avant la demande des passagers.""",
      """<strong>Parakou : l’offre de chauffeurs d’abord.</strong> Gozem s’y est retiré faute de
    chauffeurs recrutés (information du fondateur). L’ouverture dépendra donc en premier du
    nombre de chauffeurs engagés et actifs, avant la demande des passagers.""")

# lots → composition de la flotte
F.span("""<div class="h-serif ajout" style="margin-top:20px">Les deux lots de la flotte propre</div>""",
       """Détail au 6.4.
  </div>""",
       f"""<div class="h-serif ajout" style="margin-top:20px">La flotte de départ et son financement</div>
  <table class="tbl txt ajout" style="margin-top:10px">
    <colgroup><col style="width:20%"><col style="width:10%"><col style="width:26%"><col style="width:44%"></colgroup>
    <thead><tr><th>Véhicule</th><th>Nombre</th><th>Propriétaire</th><th>Financement</th></tr></thead>
    <tbody>
      <tr><td>Tricycle thermique</td><td>1</td><td>TamCar, puis le conducteur</td><td>Acompte de 30 % ({n(M.PRIX_TRICYCLE * M.ACOMPTE_PCT)} F) à la commande, solde sur {M.MENS_TRICYCLE} mois sans intérêt.</td></tr>
      <tr><td>Motos électriques</td><td>{M.N_MOTO}</td><td>TamCar, puis le conducteur</td><td>Achat comptant ({n(M.PRIX_MOTO)} F l’unité).</td></tr>
      <tr><td>Voitures Essentiel</td><td>{M.N_ESS}</td><td>Afrik Group Consulting</td><td>Aucun capital de TamCar ; {n(M.FRAIS_ENTREE)} F d’entrée par véhicule.</td></tr>
      <tr><td>Voitures Confort</td><td>{M.N_CONF}</td><td>Afrik Group Consulting</td><td>Aucun capital de TamCar ; {n(M.FRAIS_ENTREE)} F d’entrée par véhicule.</td></tr>
    </tbody>
  </table>
  <div class="src ajout-in">
    Le détail du financement du tricycle et des motos est au 6.4 ; les conditions des voitures au 7.2.
  </div>""")

# 5.2.2 : fiche
F.rep("""<div><h6>Nombre de postes</h6><b>1 par ville</b><small>Cotonou et Parakou</small></div>""",
      """<div><h6>Nombre de postes</h6><b>1</b><small>Cotonou ; un second à l’ouverture de Parakou</small></div>""")
F.rep("""Chaque ville d’exploitation sera placée sous la supervision d’un Responsable Opérations.""",
      """Chaque ville d’exploitation sera placée sous la supervision d’un Responsable Opérations (un seul au départ, à Cotonou).""")

# 5.2.3 : charge
F.rep("""Au scénario de base <span class="modif">de TamCar (cinq tricycles par ville à l’objectif
        de 9 000 F par jour)</span>, la charge mensuelle estimée pour les
        <span class="modif">deux</span> responsables est d’environ
        <span class="modif">70 200</span> FCFA, soit 35 100 FCFA par ville. <span class="modif">Dans le cas B, les cinq motos portent la charge de Cotonou à 52 650 FCFA, soit 87 750 FCFA pour les deux responsables.</span> Le plafond de
        150 000 FCFA par responsable est atteint lorsque le volume mensuel de courses de sa ville
        atteint cinq millions de FCFA.""",
      f"""<span class="modif">Avec la flotte de départ (15 véhicules) aux planchers d’activité, la charge mensuelle est d’environ
        {n(M.ops_mensuel(1, False))} FCFA au mois 1. Elle monte à mesure que les véhicules arrivent et atteint le plafond de
        150 000 FCFA dès que le volume mensuel de courses de la ville atteint cinq millions de FCFA (mois {M.MOIS_PLAFOND_OPS} avec les voitures de tiers).</span>""")

# 5.6
F.span("""<tr><td>Responsable Opérations — Cotonou</td>""", """<tr><td>Responsable Opérations — Parakou</td><td>Variable : 3 % du volume local, plafonné à 150 000 FCFA</td><td style="text-align:right">35 100 FCFA au scénario de base</td></tr>""",
       f"""<tr><td>Responsable Opérations — Cotonou</td><td>Variable : 3 % du volume local, plafonné à 150 000 FCFA</td><td style="text-align:right">{n(M.ops_mensuel(1, False))} FCFA au mois 1 ; plafond de 150 000 FCFA atteint dès le mois {M.MOIS_PLAFOND_OPS} avec les voitures de tiers</td></tr>""")
TOT13 = M.ligne(33)[13] + M.ligne(23)[13] + M.ligne(25)[13]
F.rep("""Au scénario de base, la rémunération variable des <span class="modif">deux</span>
      responsables représente environ <span class="modif">70 200</span> FCFA par mois. Avec la
      secrétaire <span class="modif">et le développeur</span>, les rémunérations prévues dans le
      document atteignent ainsi environ <strong><span class="modif">370 200</span> FCFA par mois à partir du mois 13</strong>, en montants bruts, hors charges patronales et frais de personnel. <span class="modif">Dans le cas B, ces montants sont de 87 750 et 387 750 FCFA.</span>""",
      f"""<span class="modif">Avec la flotte recrutée, la rémunération variable du responsable atteint son plafond de 150 000 FCFA par mois. Avec la
      secrétaire et le développeur, les rémunérations prévues dans le
      document atteignent ainsi environ <strong>{n(TOT13)} FCFA par mois à partir du mois 13</strong>, en montants bruts, hors charges patronales et frais de personnel.</span>""")

# 5.7 : plancher
F.rep("""Il est exprimé en volume de courses par
    véhicule et par jour : 15 000 F pour une voiture, 9 000 F pour un tricycle, 4 500 F pour une
    moto (4.5.2).""",
      """Il est exprimé en volume de courses par
    véhicule et par jour : 12 000 F pour une Essentiel, 15 000 F pour une Confort, 8 333 F pour un tricycle,
    4 167 F pour une moto (4.5.2). Le conducteur en verse 60 %.""")

F.ecrire()
