"""Ajoute 4U (For You) au plan d'affaires : page 3.4.6, ligne dans le tableau 3.4.5, renvois en 2.5, 3.4.1 et 9.6.

Faits : fiches Google Play et App Store, site 4u-foryou.com (21 octobre 2026) ; relevé en application du fondateur
(21 octobre 2026, 16 h 14, 5,6 km / 14 min) ; prix TamCar = fonction compute_price de la production sur ce trajet,
de jour, sans climatisation (moto 400, tricycle 800, Essentiel 950, Confort 1 250, VIP 1 700).
Écarts TamCar vs 4U : 400/478 = −16 %, 800/867 = −8 %, 950/1 267 = −25 %, 1 250/1 837 = −32 %, 1 700/2 900 = −41 % ;
4U vs TamCar : +20 %, +8 %, +33 %, +47 %, +71 %.
"""
from _patchlib import Fichier

p3 = Fichier('partie3.html')

# 3.4.1 : les trois nouveaux acteurs
p3.rep(
    """<span class="modif">INAS Travel,
        lancée en juin 2026, et inDrive, dont le prix est proposé par le client, sont deux acteurs de plus (3.4.4, 3.4.5)</span>""",
    """<span class="modif">INAS Travel,
        lancée en juin 2026, inDrive, dont le prix est proposé par le client, et 4U (For You), application basée à Cotonou,
        sont trois acteurs de plus (3.4.4, 3.4.5, 3.4.6)</span>""")
p3.rep(
    """<span class="modif">et, pour INAS, dans le relevé de début octobre 2026</span>""",
    """<span class="modif">et, pour INAS, dans le relevé de début octobre 2026 ; pour 4U, dans le relevé en application du 21 octobre 2026 (3.4.6)</span>""")

# 3.4.5 : tableau des politiques tarifaires, une ligne de plus
p3.rep(
    """<tr><td class="tam">TamCar</td><td>La grille de la plateforme (base, kilomètres, minutes), sans majoration dynamique</td>""",
    """<tr class="ajout"><td>4U</td><td>La plateforme ; prix affiché sans arrondi pour chaque catégorie</td><td>Dans l’application, à la commande ; la grille du site diffère</td><td>« Jusqu’à 80 % » annoncé sur le site</td></tr>
      <tr><td class="tam">TamCar</td><td>La grille de la plateforme (base, kilomètres, minutes), sans majoration dynamique</td>""")

# 3.4.5 : la phrase de synthèse compte désormais six plateformes
p3.rep(
    """Parmi les cinq plateformes, TamCar est la seule à publier sa grille avant la commande et à afficher la part du
      conducteur avant l’acceptation.""",
    """<span class="modif">Parmi les six plateformes, TamCar est la seule à publier avant la commande une grille identique à celle
      de l’application et à afficher la part du conducteur avant l’acceptation.</span>""")

page_4u = """<!-- ============================================================ 03 · 3.4.6 · 4U (For You) -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">03</span><h1>Étude de marché <small>(suite)</small></h1></div>

  <div class="h-serif ajout" style="margin-top:14px">3.4.6 · Un cinquième acteur : 4U (For You), une application basée à Cotonou</div>

  <div class="row c-6-4 stretch">
    <div class="card ajout">
      <div class="eyebrow">{{ico:search}} Ce que l’on sait de 4U</div>
      <p>
        4U, nommée aussi For You ou Move4U, est éditée par CIL&amp;ASSOCIÉS, basée à Zogbo (Cotonou). Sa foire aux
        questions annonce <strong>deux villes</strong> : Cotonou et Abomey-Calavi. L’application propose
        <strong>six services</strong> (moto, tricycle, voiture Standard, Confort et VIP, livraison) et accepte espèces,
        Mobile Money, carte et portefeuille intégré. Le conducteur doit posséder son véhicule : « jusqu’à 80 % » annoncé,
        <strong>aucune offre de véhicule</strong>.
      </p>
      <p>
        Audience modeste : <strong>plus de 1 000 installations</strong> sur Google Play pour chaque application (client,
        conducteur), <strong>12 avis</strong> au total. Mises à jour le 12 octobre 2026 : messagerie avec le conducteur,
        réservation à l’avance, suivi en direct, espace « influenceur ».
      </p>
      <p class="src">Sources : fiches Google Play et App Store, site 4u-foryou.com (21 octobre 2026) ; relevé en
        application du fondateur (21 octobre 2026, 16 h 14).</p>
    </div>
    <div class="callout violet ajout" style="align-self:stretch; display:flex; align-items:center">
      <p style="margin:0; font-size:10px; text-align:left">
        <strong>Sa politique tarifaire.</strong> Un prix <strong>calculé par la plateforme</strong>, affiché pour chaque
        catégorie avant la commande, <strong>sans arrondi</strong> (1 267 F, 1 837 F…), et 900 F de réduction sur les
        trois premières courses. La grille du site (moto à 200 F les deux premiers kilomètres, voiture à 300 F au
        minimum) <strong>ne correspond pas</strong> aux prix de l’application.
      </p>
    </div>
  </div>

  <div class="h-serif ajout" style="margin-top:12px">Relevé en application · course de 5,6 km, 14 minutes</div>
  <p class="intro ajout-in" style="margin-bottom:6px">
    21 octobre 2026, 16 h 14 · prix en FCFA. TamCar : grille de jour, sans climatisation, sur la distance et la durée
    relevées dans l’application de 4U.
  </p>

  <table class="tbl ajout">
    <colgroup><col style="width:40%"><col style="width:20%"><col style="width:20%"><col style="width:20%"></colgroup>
    <thead>
      <tr><th>Catégorie</th><th>4U</th><th class="tam">TamCar</th><th>TamCar<br>vs 4U</th></tr>
    </thead>
    <tbody>
      <tr><td>Moto</td><td>478</td><td class="tam">400</td><td class="moins">−16 %</td></tr>
      <tr><td>Tricycle</td><td>867</td><td class="tam">800</td><td class="moins">−8 %</td></tr>
      <tr><td>Voiture ordinaire<small>4U : Standard · TamCar : Essentiel</small></td><td>1 267</td><td class="tam">950</td><td class="moins">−25 %</td></tr>
      <tr><td>Voiture confort</td><td>1 837</td><td class="tam">1 250</td><td class="moins">−32 %</td></tr>
      <tr><td>VIP</td><td>2 900</td><td class="tam">1 700</td><td class="moins">−41 %</td></tr>
    </tbody>
  </table>
  <p class="intro ajout-in" style="margin-top:5px; font-size:9px">
    Un seul trajet, un seul moment : ce relevé ne se compare pas à ceux du 30 septembre et du début d’octobre 2026.
  </p>

  <div class="rule-label ajout" style="margin-top:10px">Les conséquences pour TamCar</div>
  <div class="row c-3 ajout" style="margin-top:6px">
    <div class="tile">
      <div class="ico">{{ico:target}}</div>
      <h4>Un concurrent plus cher</h4>
      <p>
        Sur le trajet relevé, TamCar est <strong>de 8 à 41 % moins cher</strong> que 4U, de 8 % en tricycle à 41 % en
        VIP. TamCar <strong>maintient sa grille</strong>, qui est celle de l’application.
      </p>
    </div>
    <div class="tile violet">
      <div class="ico">{{ico:coins}}</div>
      <h4>Le point à suivre : les conducteurs</h4>
      <p>
        4U recrute des conducteurs déjà propriétaires, avec « jusqu’à 80 % » annoncé, comme la part du conducteur
        propriétaire de TamCar. Lors de l’essai du fondateur, aucun chauffeur n’était disponible pour une moto : un essai
        isolé, que le relevé trimestriel répétera.
      </p>
    </div>
    <div class="tile vert">
      <div class="ico">{{ico:car}}</div>
      <h4>Ni Porto-Novo ni le corridor</h4>
      <p>
        Porto-Novo et le corridor Cotonou — Porto-Novo ne figurent pas parmi les zones annoncées par 4U. TamCar suit son
        extension dans son relevé trimestriel.
      </p>
    </div>
  </div>

  <div class="lecture ajout" style="margin-top:10px">
    <div><h5>Ce que 4U ne propose pas</h5><strong>Ni véhicule, ni voie<br>vers la propriété.</strong></div>
    <p>
      À notre connaissance (fiches et site consultés le 21 octobre 2026), 4U n’annonce ni véhicule, ni épargne, ni accès
      à la propriété pour le conducteur : c’est l’axe que retient le positionnement de TamCar (3.4.3).
    </p>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>

"""
p3.rep(
    "<!-- ============================================================ 03 · p.6 · 3.4.2 + 3.4.3 -->",
    page_4u + "<!-- ============================================================ 03 · p.6 · 3.4.2 + 3.4.3 -->",
)
p3.ecrire()

# ------------------------------------------------------------------ 2.5 (source.html)
src = Fichier('source.html')
src.rep(
    """négocié course par course, donc jamais annoncé à l’avance, limité à la moto à Cotonou (3.4.5).
  </div>""",
    """négocié course par course, donc jamais annoncé à l’avance, limité à la moto à Cotonou (3.4.5).
    <strong>4U (For You)</strong> : prix <strong>supérieurs de 8 à 71 % à ceux de TamCar</strong> sur 5,6 km, audience
    modeste (1 000 installations, 12 avis), <strong>aucun véhicule ni voie vers la propriété</strong> du conducteur (3.4.6).
  </div>""")
# la page 2.5 était pleine : une ligne de plus, deux marges resserrées pour que le bandeau reste au-dessus du numéro de page
src.rep("""<div class="callout rouille ajout" style="margin-top:8px">
    <strong>INAS Travel</strong>""", """<div class="callout rouille ajout" style="margin-top:6px">
    <strong>INAS Travel</strong>""")
src.rep("""<div class="callout" style="margin-top:10px">
    <strong>Le point de départ de l’offre de TamCar.</strong>""", """<div class="callout" style="margin-top:6px">
    <strong>Le point de départ de l’offre de TamCar.</strong>""")
src.rep("""<div class="rule-label rouille" style="margin-top:14px">Les faiblesses des acteurs en place</div>""",
        """<div class="rule-label rouille" style="margin-top:10px">Les faiblesses des acteurs en place</div>""")
src.rep("""<div class="lecture" style="margin-top:12px">
    <div><h5>Le besoin</h5>""", """<div class="lecture" style="margin-top:8px">
    <div><h5>Le besoin</h5>""")
src.ecrire()

# ------------------------------------------------------------------ 9.6 (gen_partie9.py)
g9 = Fichier('gen_partie9.py')
g9.rep(
    """inDrive, limité à la moto, fonctionne sur un prix proposé par le client (3.4.5). Le risque""",
    """inDrive, limité à la moto, fonctionne sur un prix proposé par le client (3.4.5) ; 4U, basée à Cotonou, est de 8 à 71 % plus
      chère que TamCar sur un trajet de 5,6 km (3.4.6). Le risque""")
g9.ecrire()
