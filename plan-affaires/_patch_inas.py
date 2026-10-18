"""Ajoute INAS Travel au plan d'affaires : 2.5 (encadré), 3.4.1 (renvoi), nouvelle page 3.4.4, 9.6 (point de départ)."""
from _patchlib import Fichier

# ------------------------------------------------------------------ partie 3
p3 = Fichier('partie3.html')

# 3.4.1 : INAS dans la liste des plateformes
p3.rep(
    """<p>
        Yango et Gozem sont les deux plateformes de VTC actives à Cotonou. Elles permettent de
        commander une course par application et proposent plusieurs catégories de services.
      </p>
      <p>
        Leurs faiblesses sont analysées au 2.5 ; leurs prix sont comparés à ceux de TamCar dans
        le relevé du 30 septembre 2026, ci-après.
      </p>""",
    """<p>
        Yango et Gozem sont les deux plateformes de VTC établies à Cotonou ; <span class="modif">INAS Travel,
        lancée en juin 2026, est un troisième acteur (3.4.4)</span>. Elles permettent de
        commander une course par application et proposent plusieurs catégories de services.
      </p>
      <p>
        Leurs faiblesses sont analysées au 2.5 ; leurs prix sont comparés à ceux de TamCar dans
        le relevé du 30 septembre 2026 <span class="modif">et, pour INAS, dans le relevé de début octobre 2026</span>, ci-après.
      </p>""")

# Nouvelle page 3.4.4, insérée avant la page « 3.4.2 + 3.4.3 »
page_inas = """<!-- ============================================================ 03 · 3.4.4 · INAS -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">03</span><h1>Étude de marché <small>(suite)</small></h1></div>

  <div class="h-serif ajout" style="margin-top:14px">3.4.4 · Un troisième acteur : INAS Travel</div>

  <div class="row c-6-4 stretch">
    <div class="card ajout">
      <div class="eyebrow">{{ico:search}} Ce que l’on sait d’INAS</div>
      <p>
        INAS Travel est une application éditée par Masters Services Formation, publiée sur l’App Store le
        <strong>15 juin 2026</strong>. Elle couvre Cotonou et plusieurs destinations du Bénin (Ouidah, Ganvié,
        Grand-Popo, Pendjari) et réunit <strong>cinq services</strong> : la course (à la demande ou programmée), la
        location de voiture (<strong>35 000 F par jour avec chauffeur</strong>, 30 000 F sans), la livraison de
        colis, le tourisme et l’hébergement. Le paiement se fait en espèces, par portefeuille intégré ou en
        Mobile Money. À la date de consultation, la fiche de l’application ne comporte aucun avis.
      </p>
      <p class="src">Sources : fiche de l’application INAS Travel (App Store), consultée le 2 octobre 2026 ; relevé de prix du fondateur.</p>
    </div>
    <div class="callout violet ajout" style="align-self:stretch; display:flex; align-items:center">
      <p style="margin:0; font-size:10px; text-align:left">
        <strong>Sa politique tarifaire.</strong> Un prix <strong>calculé au kilomètre</strong>, présenté comme
        transparent, sur <strong>trois catégories</strong> de course : Basique, Confort (climatisé) et Tricycle ;
        une livraison à prix fixe selon la distance ; une location à la journée. Aucune grille n’est
        publiée : le prix se découvre dans l’application.
      </p>
    </div>
  </div>

  <div class="h-serif ajout" style="margin-top:14px">Relevé complémentaire · course courte</div>
  <p class="intro ajout-in" style="margin-bottom:8px">
    Même trajet court sur les deux applications · début octobre 2026 · prix en FCFA. Le prix TamCar relevé est celui
    de la course minimale (500 F en voiture ordinaire, 700 F en climatisée).
  </p>

  <table class="tbl ajout">
    <colgroup><col style="width:30%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:14%"></colgroup>
    <thead>
      <tr>
        <th>Catégorie</th><th>INAS</th><th class="tam">TamCar</th><th>TamCar<br>vs INAS</th>
        <th>Courses pour<br>l’objectif · INAS</th><th>Courses pour<br>l’objectif · TamCar</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Voiture ordinaire<small>INAS : Basique · TamCar : Essentiel</small></td>
        <td>925</td><td class="tam">500</td><td class="moins">−46 %</td><td>17</td><td>30</td>
      </tr>
      <tr>
        <td>Voiture climatisée<small>INAS et TamCar : Confort</small></td>
        <td>1 300</td><td class="tam">700</td><td class="moins">−46 %</td><td>12</td><td>22</td>
      </tr>
      <tr>
        <td>Tricycle<small>objectif de 9 000 F par jour</small></td>
        <td>400</td><td class="tam">400</td><td>0 %</td><td>23</td><td>23</td>
      </tr>
    </tbody>
  </table>
  <p class="intro ajout-in" style="margin-top:6px; font-size:9px">
    Les deux dernières colonnes donnent le nombre de courses à ce prix pour atteindre l’objectif de volume du jour
    (15 000 F par voiture, 9 000 F par tricycle ; 4.5.2). Ce relevé porte sur une distance différente de celui du
    30 septembre 2026 : les deux ne se comparent pas entre eux.
  </p>

  <div class="rule-label ajout" style="margin-top:14px">Les conséquences pour TamCar</div>
  <div class="row c-1-1 ajout" style="margin-top:8px">
    <div class="tile">
      <div class="ico">{{ico:target}}</div>
      <h4>L’entrée de gamme devient un argument de conquête</h4>
      <p>
        Sur une course courte, TamCar est <strong>46 % moins cher qu’INAS</strong> en voiture et à parité en
        tricycle. « À partir de 500 F » est l’accroche de la première course, avec la promotion de première
        course : un client qui compare deux applications côte à côte voit l’écart tout de suite.
      </p>
    </div>
    <div class="tile violet">
      <div class="ico">{{ico:coins}}</div>
      <h4>Aucune baisse de prix en réponse</h4>
      <p>
        La grille de TamCar est déjà la plus basse du relevé : descendre encore augmenterait le nombre de courses
        nécessaires à l’objectif du jour (30 courses à 500 F, 15 à 1 000 F) et réduirait la part conservée par le
        conducteur (200 F sur une course à 500 F). TamCar <strong>maintient sa grille</strong> et défend ses
        volumes par le service (9.6).
      </p>
    </div>
    <div class="tile vert">
      <div class="ico">{{ico:car}}</div>
      <h4>Le tricycle ne se vend pas sur le prix</h4>
      <p>
        À 400 F, TamCar et INAS sont à parité, et l’écart avec la voiture ordinaire n’est que de 100 F à courte
        distance (150 F sur 6,1 km). Le conducteur de tricycle atteint son objectif par la distance (11 courses de
        6,1 km à 850 F) plutôt que par la course minimale (23 courses à 400 F) : l’argument du tricycle est la
        traçabilité, TamAssur et TamPass.
      </p>
    </div>
    <div class="tile or">
      <div class="ico">{{ico:shield}}</div>
      <h4>La transparence ne suffit plus à se distinguer</h4>
      <p>
        INAS annonce des prix transparents au kilomètre. TamCar se distingue sur ce qu’INAS n’annonce pas : une
        <strong>grille publiée et stable</strong>, sans majoration dynamique ; la <strong>part du conducteur
        affichée</strong> avant l’acceptation ; <strong>TamAssur</strong> et la voie vers la propriété du véhicule ;
        une catégorie <strong>VIP</strong>, sans équivalent relevé chez INAS.
      </p>
    </div>
  </div>

  <div class="lecture ajout" style="margin-top:12px">
    <div><h5>Suivi</h5><strong>Un relevé tarifaire<br>chaque trimestre.</strong></div>
    <p>
      TamCar relève chaque trimestre les prix des trois concurrents sur trois trajets : une course courte, 6 km et
      le corridor Cotonou — Porto-Novo. Les décisions de prix s’appuient sur l’écart mesuré et sur ses effets sur
      les marges, jamais sur une réaction immédiate à une offre nouvelle.
    </p>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>

"""
p3.rep(
    "<!-- ============================================================ 03 · p.6 · 3.4.2 + 3.4.3 -->",
    page_inas + "<!-- ============================================================ 03 · p.6 · 3.4.2 + 3.4.3 -->",
)
p3.ecrire()

# ------------------------------------------------------------------ 2.5 (source.html)
src = Fichier('source.html')
src.rep(
    """<div class="callout" style="margin-top:10px">
    <strong>Le point de départ de l’offre de TamCar.</strong>""",
    """<div class="callout rouille ajout" style="margin-top:8px">
    <strong>INAS Travel</strong>, application lancée en juin 2026 : des prix de course courte <strong>supérieurs de 85 %
    à ceux de TamCar</strong> (925 F contre 500 F en voiture ordinaire, 1 300 F contre 700 F en climatisée), une
    application généraliste (course, location, livraison, tourisme, hébergement) et <strong>aucune offre d’épargne ni de
    propriété du véhicule</strong> annoncée pour le conducteur (3.4.4).
  </div>

  <div class="callout" style="margin-top:10px">
    <strong>Le point de départ de l’offre de TamCar.</strong>""")
src.ecrire()

# ------------------------------------------------------------------ 9.6 (gen_partie9.py)
g9 = Fichier('gen_partie9.py')
g9.rep(
    """Sur le relevé du 30 septembre 2026, TamCar est de 11 à 25 % plus cher
      que Yango sur la voiture ordinaire et moins cher que Gozem (3.4).""",
    """Sur le relevé du 30 septembre 2026, TamCar est de 11 à 25 % plus cher
      que Yango sur la voiture ordinaire et moins cher que Gozem ; sur une course courte, il est de 46 % moins cher
      qu’INAS en voiture (3.4).""")
g9.ecrire()
