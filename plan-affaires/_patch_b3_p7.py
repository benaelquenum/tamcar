from _patchlib import Fichier

f = Fichier('gen_partie7.py')
R = f.rep

# ------------------------------------------------------------------ 7.1 / 7.2
R("""Les projections financières de TamCar visent à apprécier la capacité du modèle
        économique à financer""", """Les projections financières de TamCar chiffrent la capacité du modèle
        économique à financer""")
R("""Ces projections demeurent conditionnées à la mise en service effective des véhicules, au
    recrutement des chauffeurs, à la disponibilité de la plateforme, à la demande de transport et
    au respect des conditions financières négociées avec <span class="modif">le fournisseur</span>.""",
  """Ces projections reposent sur la mise en service des véhicules, le recrutement des
    chauffeurs, la disponibilité de la plateforme, la demande de transport et les conditions
    financières convenues avec <span class="modif">le fournisseur</span>.""")

# ------------------------------------------------------------------ 7.3
R("""Il correspond à une montée en charge plus lente, notamment si le déploiement dans certaines villes prend plus de temps que prévu. Il permet de vérifier si le projet conserve une marge de sécurité suffisante malgré des recettes inférieures à l’objectif central.""",
  """Il correspond à une montée en charge plus lente, par exemple lorsque le déploiement dans certaines villes prend plus de temps. Il mesure la marge de sécurité du projet face à des recettes inférieures à l’objectif central.""")
R("""Ces montants doivent être lus comme des estimations dépendant des hypothèses du modèle. Ils
    ne constituent ni des revenus garantis ni une promesse de rendement pour les investisseurs.""",
  """Ces montants sont les résultats du modèle, à hypothèses données. Ils ne sont ni des
    revenus garantis ni une promesse de rendement pour les investisseurs.""")

# ------------------------------------------------------------------ 7.4
R("Le montage financier envisagé prévoit une avance de", "Le montage financier prévoit une avance de")
R("""Elle couvrirait
        donc <span class="modif">la mensualité de {n(MENS_A)} FCFA, l’excédent estimé à
        {n(part_proprio('A', 'base') - MENS_A)} FCFA restant à la plateforme.</span>""",
  """Elle couvre
        donc <span class="modif">la mensualité de {n(MENS_A)} FCFA, l’excédent de
        {n(part_proprio('A', 'base') - MENS_A)} FCFA restant à la plateforme.</span>""")
R("""La faisabilité du montage dépend également de la confirmation des conditions accordées par
    <span class="modif">le fournisseur</span>, notamment le calendrier de livraison, le maintien
    des prix et les modalités de paiement.""",
  """Le montage repose sur les conditions convenues avec <span class="modif">le fournisseur</span> :
    modalités de paiement, prix et calendrier de livraison.""")

# ------------------------------------------------------------------ 7.5
R("""Dans le scénario de base, <span class="modif">le modèle de trésorerie de TamCar</span> estime
    les revenus""", """Dans le scénario de base, <span class="modif">le modèle de trésorerie de TamCar</span> chiffre
    les revenus""")
R("""Ces agrégats sont ceux du scénario de base <span class="modif">du modèle</span>. Leur
      interprétation doit rester liée au périmètre exact de chaque poste : les recettes générées
      par la flotte, les remboursements du financement, les charges d’exploitation et les sommes
      affectées au rachat des véhicules ne doivent pas être confondus.""",
  """Ces agrégats sont ceux du scénario de base <span class="modif">du modèle</span>. Chaque
      poste a son périmètre exact : les recettes générées par la flotte, les remboursements du
      financement, les charges d’exploitation et les sommes affectées au rachat des véhicules
      sont suivis séparément.""")
R("""Ces indicateurs devront être recalculés si le montant du financement initial, les salaires,
      les loyers, les frais techniques ou les autres charges évoluent.""",
  """Le modèle recalcule ces indicateurs dès que le montant du financement initial, les
      salaires, les loyers, les frais techniques ou les autres charges évoluent.""")

# ------------------------------------------------------------------ 7.6
R("""Cette situation justifie la constitution d’une réserve de trésorerie suffisante, un suivi
        rapproché des encaissements et un déploiement progressif des dépenses non indispensables.
        Elle invite également à établir des seuils d’alerte permettant de réagir rapidement si le
        volume de courses reste inférieur aux prévisions.""",
  """Cette situation justifie une réserve de trésorerie, un suivi rapproché des encaissements
        et un déploiement progressif des dépenses non indispensables. Des seuils d’alerte (7.4)
        déclenchent une réaction rapide si le volume de courses reste inférieur aux prévisions.""")
R("""Le suivi financier devra notamment comparer chaque mois les recettes réelles aux
        objectifs,""", """Le suivi financier compare chaque mois les recettes réelles aux
        objectifs,""")

# ------------------------------------------------------------------ 7.7 / 7.8
R("7.7 · Situation envisagée à l’issue des 36 mois", "7.7 · Situation à l’issue des 36 mois")
R("""À l’issue de la période prévue, le business plan envisage que les
        <span class="modif">véhicules</span> aient été intégralement financés et que les
        chauffeurs puissent en devenir propriétaires conformément aux contrats de cession.""",
  """À l’issue de la période prévue, le business plan prévoit que les
        <span class="modif">véhicules</span> sont intégralement financés et que les
        chauffeurs en deviennent propriétaires conformément aux contrats de cession.""")
R("les 10 tricycles pourraient continuer à générer environ", "les 10 tricycles continuent de générer environ")
R("""Cette étape est importante pour la stratégie de développement : elle permettrait à TamCar
        de conserver""", """Cette étape est importante pour la stratégie de développement : elle permet à TamCar
        de conserver""")
R("""Le lancement d’un second cycle de flotte, envisagé à moyen terme, devra néanmoins
        dépendre des résultats effectivement obtenus, de la trésorerie disponible et de la
        capacité de l’entreprise à financer cette expansion sans fragiliser son exploitation
        courante.""",
  """Le lancement d’un second cycle de flotte, à moyen terme, est décidé sur les résultats
        obtenus, la trésorerie disponible et la capacité de l’entreprise à financer cette
        expansion sans fragiliser son exploitation courante.""")
R("""La réalisation de ces objectifs dépendra cependant du niveau réel d’activité, du respect
        de l’échéancier du <span class="modif">fournisseur</span>, du recouvrement des commissions
        et de la maîtrise des charges. Les scénarios doivent donc être considérés comme des
        outils de pilotage et non comme des résultats acquis.""",
  """La réalisation de ces objectifs repose sur le niveau réel d’activité, l’échéancier du
        <span class="modif">fournisseur</span>, le recouvrement des commissions et la maîtrise des
        charges : les scénarios sont les outils de pilotage de ces quatre points.""")
R("""Avant la validation définitive du plan financier, il conviendra d’harmoniser le montant de
        financement recherché avec le besoin de trésorerie initial, de vérifier l’ensemble des
        postes de charges et de confirmer les hypothèses contractuelles liées à l’acquisition et
        à la cession des véhicules.""",
  """Le financement recherché de 15 000 000 FCFA couvre le besoin initial (investissements de
        démarrage et avances sur les véhicules, 7.9) ; tous les postes de charges sont intégrés
        au modèle, et les hypothèses d’acquisition et de cession des véhicules sont celles de la
        partie 6.""")
R("L’intégration de nouveaux véhicules hors flotte TamCar, ceux de concessionnaires, peut absorber les trous de trésorerie.",
  "L’intégration de nouveaux véhicules hors flotte TamCar, ceux de concessionnaires, absorbe les trous de trésorerie.")
R("{C.mots_tri(K_PRUDENT)} dès le mois 1 suffiraient.", "{C.mots_tri(K_PRUDENT)} dès le mois 1 suffisent.")
f.span('<div class="rnote">Scénarios construits par moi :', 'À valider ou à corriger.</div>', '')

# ------------------------------------------------------------------ page récapitulative A / B (après 7.6)
RECAP = r'''
# ------------------------------------------------------------------ récapitulatif : pourquoi le cas B
REV_A = A['rec_ops']
REV_B = B['rec_ops'] + B['fonds']
D_REV = REV_B - REV_A
D_FIN = B['fin'] - A['fin']
D_INV = 2_750_000
RENDEMENT = D_FIN / D_INV
D_PRU = BP['mini'] - AP['mini']
RENDEMENT_TXT = f"{RENDEMENT:.1f}".replace('.', ',')

pages.append(f\'\'\'<!-- ============================================================ 07 · récapitulatif : pourquoi le cas B -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">07</span><h1>Scénarios financiers et trésorerie prévisionnelle <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">Le choix : dix tricycles et cinq motos (cas B)</div>

  <div class="hero" style="margin-top:12px; padding:18px 24px 16px">
    <span class="pill">Récapitulatif · la solution la plus rémunératrice</span>
    <h2 style="font-size:21px">Plus de revenus, <em>aucun mois de trésorerie négative.</em></h2>
    <div class="cols2" style="margin-top:6px">
      <p style="text-align:left">
        Le cas B ajoute cinq motos aux dix tricycles du cas A. Pour <strong>{n(D_INV)} FCFA</strong> d’investissement
        supplémentaire, il rapporte <strong>{mm(D_REV, 1, False)} de revenus en plus</strong> sur 36 mois, supprime les
        <strong>{A['tres_neg']} mois de trésorerie négative</strong> du cas A et ramène le seuil de trésorerie positive
        de {pct(SEUIL_A, 0)} à {pct(SEUIL_B, 0)} de l’objectif.
      </p>
      <p style="text-align:left">
        C’est la solution la plus rémunératrice et la plus sûre pour TamCar : chaque franc investi dans les motos
        rapporte <strong>{RENDEMENT_TXT}</strong> F de trésorerie supplémentaire à 36 mois, et le risque qu’elles portent est
        limité par un bilan à trois mois.
      </p>
    </div>
  </div>

  <table class="tbl" style="margin-top:12px">
    <colgroup><col style="width:36%"><col style="width:22%"><col style="width:22%"><col style="width:20%"></colgroup>
    <thead><tr><th>Scénario de base, 36 mois</th><th>Cas A<br>10 tricycles</th><th class="tam">Cas B<br>10 tricycles + 5 motos</th><th>Écart</th></tr></thead>
    <tbody>
      {tr('Flotte achetée (FCFA)', n(15_000_000), n(17_750_000), sg(D_INV))}
      {tr('Revenus de TamCar (FCFA)<small>cas B : courses et fonds de rachat des motos</small>', n(REV_A), n(REV_B), sg(D_REV))}
      {tr('<strong>Trésorerie à 36 mois (FCFA)</strong>', '<strong>' + sg(A['fin']) + '</strong>', '<strong>' + sg(B['fin']) + '</strong>', '<strong>' + sg(D_FIN) + '</strong>')}
      {tr('Point bas de trésorerie', bas((A['mini'], A['mois_mini'])), bas((B['mini'], B['mois_mini'])), mm(B['mini'] - A['mini']))}
      {tr('Mois de trésorerie négative', A['tres_neg'], B['tres_neg'], sg(B['tres_neg'] - A['tres_neg']).replace('+ ', '+').replace('− ', '−'))}
      {tr('Seuil de trésorerie positive<small>part de l’objectif journalier</small>', pct(SEUIL_A, 0), pct(SEUIL_B, 0), '−' + str(round(SEUIL_A - SEUIL_B)) + ' points')}
      {tr('Scénario prudent · point bas', mm(AP['mini']), mm(BP['mini']), mm(D_PRU))}
      {tr('Commissions mensuelles après cession (FCFA)', n(fin_tri_commissions), n(fin_tri_commissions + fin_moto_commissions), sg(fin_moto_commissions))}
    </tbody>
  </table>

  <div class="rule-label" style="margin-top:14px">Pourquoi opter pour le cas B</div>
  <div class="row c-1-1 stretch" style="margin-top:8px">
    <div class="tile vert">
      <div class="ico">{{{{ico:chart}}}}</div>
      <h4>Plus de revenus</h4>
      <p>Les motos ajoutent {mm(D_REV, 1, False)} de revenus sur 36 mois, dont {mm(B['fonds'], 1, False)} de fonds de rachat encaissés à leur cession au mois 25. Après la cession, elles rapportent encore {n(fin_moto_commissions)} F de commissions par mois.</p>
    </div>
    <div class="tile">
      <div class="ico">{{{{ico:check}}}}</div>
      <h4>Un plan sans mois négatif</h4>
      <p>Le cas B garde une trésorerie positive tous les mois : point bas de {mm(B['mini'])} au mois {B['mois_mini']}. Le cas A passe {A['tres_neg']} mois sous zéro, avec un point bas de {mm(A['mini'])} au mois {A['mois_mini']}.</p>
    </div>
  </div>
  <div class="row c-1-1 stretch">
    <div class="tile violet">
      <div class="ico">{{{{ico:target}}}}</div>
      <h4>Une marge de sécurité plus large</h4>
      <p>La trésorerie est positive dès {pct(SEUIL_B, 0)} de l’objectif, contre {pct(SEUIL_A, 0)} dans le cas A. Dans le scénario prudent, les motos réduisent le besoin de financement de {mm(D_PRU, 1, False)}.</p>
    </div>
    <div class="tile or">
      <div class="ico">{{{{ico:users}}}}</div>
      <h4>Un second segment de clientèle</h4>
      <p>Les motos s’adressent à la clientèle du zémidjan à Cotonou (3.4.2), avec une cession au chauffeur en 24 mois, soit plus vite que pour un tricycle (36 mois).</p>
    </div>
  </div>

  <div class="row c-1-1 stretch" style="margin-top:10px">
    <div class="callout rouille">
      <strong>Le risque est borné.</strong> Si les motos ne roulent pas, le point bas atteint {mm(mi0)} (mois {mo0}) et le plan finit à {mm(fi0)}.
      Le bilan à trois mois mesure leurs recettes réelles avant tout engagement supplémentaire (8.8).
    </div>
    <div class="callout vert">
      <strong>Décision.</strong> Le plan retient le cas B pour la levée de 15 000 000 FCFA : 10 tricycles livrés en deux lots (Cotonou au mois 1,
      Parakou au mois 7) et 5 motos à Cotonou dès le mois 1. Si la levée est inférieure, la flotte s’adapte comme au 7.9.
    </div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
\'\'\')
'''.replace("\\'\\'\\'", "'''")

marqueur = "# ------------------------------------------------------------------ 7.7 + 7.8"
assert marqueur in f.s
f.s = f.s.replace(marqueur, RECAP + '\n' + marqueur, 1)

f.ecrire()
