"""Ajoute inDrive au plan d'affaires : page 3.4.5, renvois en 2.5, 3.4.1 et 9.6."""
from _patchlib import Fichier

p3 = Fichier('partie3.html')

# 3.4.1 : les deux nouveaux acteurs
p3.rep(
    """<span class="modif">INAS Travel,
        lancée en juin 2026, est un troisième acteur (3.4.4)</span>""",
    """<span class="modif">INAS Travel,
        lancée en juin 2026, et inDrive, dont le prix est proposé par le client, sont deux acteurs de plus (3.4.4, 3.4.5)</span>""")

page = """<!-- ============================================================ 03 · 3.4.5 · inDrive -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">03</span><h1>Étude de marché <small>(suite)</small></h1></div>

  <div class="h-serif ajout" style="margin-top:14px">3.4.5 · Un quatrième acteur : inDrive, le prix proposé par le client</div>

  <div class="row c-6-4 stretch">
    <div class="card ajout">
      <div class="eyebrow">{{ico:search}} Le modèle d’inDrive</div>
      <p>
        inDrive est une plateforme internationale, présente dans plusieurs pays d’Afrique (Nigéria, Kenya, Ghana,
        Tanzanie, Afrique du Sud…). Le <strong>client fixe son itinéraire et son prix</strong> et lance la recherche :
        les chauffeurs de la zone consultent la commande et celui dont le prix est aligné est apparié. Chaque chauffeur
        peut <strong>accepter, contre-proposer ou refuser</strong> sans pénalité. La plateforme annonce zéro commission
        pendant six mois dans une nouvelle ville, puis une commission de 10 % au plus. À Cotonou, l’essai du fondateur
        (octobre 2026) montre que <strong>seule la moto est proposée</strong> à ce jour.
      </p>
      <p class="src">Sources : communiqués d’inDrive repris par Daba Finance (21 octobre 2024) et Brand Spur (30 octobre 2023) ; essai de l’application par le fondateur.</p>
    </div>
    <div class="callout violet ajout" style="align-self:stretch; display:flex; align-items:center">
      <p style="margin:0; font-size:10px; text-align:left">
        <strong>Sa politique tarifaire.</strong> Aucune grille : le prix résulte d’une <strong>offre du passager</strong>
        et de la réponse du chauffeur, course par course. Le chauffeur arbitre selon ses coûts ; le passager ne connaît
        pas le prix avant d’avoir trouvé un chauffeur.
      </p>
    </div>
  </div>

  <div class="h-serif ajout" style="margin-top:14px">Les politiques tarifaires comparées</div>
  <table class="tbl ajout" style="margin-top:8px">
    <colgroup><col style="width:14%"><col style="width:31%"><col style="width:25%"><col style="width:30%"></colgroup>
    <thead>
      <tr><th>Plateforme</th><th>Qui fixe le prix</th><th>Où le prix se lit</th><th>Part du conducteur</th></tr>
    </thead>
    <tbody>
      <tr><td>Yango</td><td>La plateforme ; prix variable (800 puis 900 F pour le même trajet)</td><td>Dans l’application, à la commande</td><td>Commission d’environ 40 % en voiture, 13 % en moto</td></tr>
      <tr><td>Gozem</td><td>La plateforme</td><td>Dans l’application, à la commande</td><td>Non relevée</td></tr>
      <tr><td>INAS</td><td>La plateforme, au kilomètre</td><td>Dans l’application, à la commande</td><td>Non communiquée</td></tr>
      <tr><td>inDrive</td><td>Le passager propose, le chauffeur accepte, contre-propose ou refuse</td><td>À l’issue de l’offre</td><td>Commission de 10 % au plus, après six mois sans commission</td></tr>
      <tr><td class="tam">TamCar</td><td>La grille de la plateforme (base, kilomètres, minutes), sans majoration dynamique</td><td>Avant la commande : grille publiée</td><td>Affichée avant l’acceptation ; commission de 20 % pour un conducteur propriétaire</td></tr>
    </tbody>
  </table>

  <div class="rule-label ajout" style="margin-top:14px">Les conséquences pour TamCar</div>
  <div class="row c-3 ajout" style="margin-top:8px">
    <div class="tile">
      <div class="ico">{{ico:target}}</div>
      <h4>Sur la moto, le prix se joue contre le zémidjan</h4>
      <p>
        inDrive rend numérique le marchandage du zémidjan, dont le prix de référence reste de 300 à 400 F (relevé du
        30 septembre 2026) ; la moto TamCar est à 450 F sur 6,1 km. TamCar <strong>ne négocie pas</strong> : la moto se
        vend sur le prix annoncé, la traçabilité, TamAssur et l’accès à la propriété. Le bilan du test moto à trois
        mois (cas B) mesure cette sensibilité.
      </p>
    </div>
    <div class="tile violet">
      <div class="ico">{{ico:coins}}</div>
      <h4>La commission d’inDrive fixe un repère</h4>
      <p>
        Une commission de 10 % au plus est inférieure aux 20 % de TamCar pour un conducteur propriétaire. TamCar ne
        s’aligne pas : sa part finance ce que le conducteur ne trouve pas chez inDrive, la
        <strong>part affichée avant l’acceptation</strong>, <strong>TamAssur</strong>, la voie vers la propriété du
        véhicule et une demande régulière (TamPass, réservations).
      </p>
    </div>
    <div class="tile vert">
      <div class="ico">{{ico:car}}</div>
      <h4>Pas de concurrence directe en voiture ni en tricycle</h4>
      <p>
        inDrive n’est présent qu’en moto à Cotonou : l’Essentiel, le Confort, le VIP et le tricycle de TamCar ne sont
        pas touchés aujourd’hui. Un modèle d’offre reporte l’incertitude sur le passager (attente de réponses) et sur
        le conducteur (revenu variable) : TamCar garde un <strong>prix annoncé</strong> et suit l’extension d’inDrive
        dans son relevé trimestriel.
      </p>
    </div>
  </div>

  <div class="lecture ajout" style="margin-top:12px">
    <div><h5>Ce qui distingue TamCar</h5><strong>Seul le prix annoncé<br>et la part affichée.</strong></div>
    <p>
      Parmi les cinq plateformes, TamCar est la seule à publier sa grille avant la commande et à afficher la part du
      conducteur avant l’acceptation. C’est l’axe de différenciation que le positionnement de TamCar retient (3.4.3).
    </p>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>

"""
p3.rep(
    "<!-- ============================================================ 03 · p.6 · 3.4.2 + 3.4.3 -->",
    page + "<!-- ============================================================ 03 · p.6 · 3.4.2 + 3.4.3 -->",
)
p3.ecrire()

# 2.5 : encadré INAS + inDrive, resserré
src = Fichier('source.html')
src.span(
    '<div class="callout rouille ajout" style="margin-top:8px">\n    <strong>INAS Travel</strong>',
    '(3.4.4).\n  </div>',
    """<div class="callout rouille ajout" style="margin-top:8px">
    <strong>INAS Travel</strong> (juin 2026) : des prix de course courte <strong>supérieurs de 85 % à ceux de TamCar</strong>
    (925 F contre 500 F en voiture ordinaire), une application généraliste et <strong>aucune offre d’épargne ni de propriété
    du véhicule</strong> annoncée pour le conducteur (3.4.4). <strong>inDrive</strong> : un prix proposé par le client et
    négocié course par course, donc jamais annoncé à l’avance, limité à la moto à Cotonou (3.4.5).
  </div>""")
src.ecrire()

# 9.6
g9 = Fichier('gen_partie9.py')
g9.rep(
    """sur une course courte, il est de 46 % moins cher
      qu’INAS en voiture (3.4).""",
    """sur une course courte, il est de 46 % moins cher
      qu’INAS en voiture (3.4) ; inDrive, limité à la moto, fonctionne sur un prix proposé par le client (3.4.5).""")
g9.ecrire()
