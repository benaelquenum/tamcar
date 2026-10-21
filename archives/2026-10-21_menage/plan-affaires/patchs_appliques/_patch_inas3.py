"""Version resserrée de la page 3.4.4 (INAS) : tient sur une page."""
from _patchlib import Fichier

p3 = Fichier('partie3.html')
debut = '<!-- ============================================================ 03 · 3.4.4 · INAS -->'
fin = '<div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>\n</section>'

page = """<!-- ============================================================ 03 · 3.4.4 · INAS -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">03</span><h1>Étude de marché <small>(suite)</small></h1></div>

  <div class="h-serif ajout" style="margin-top:14px">3.4.4 · Un troisième acteur : INAS Travel</div>

  <div class="row c-6-4 stretch">
    <div class="card ajout">
      <div class="eyebrow">{{ico:search}} Ce que l’on sait d’INAS</div>
      <p>
        INAS Travel est une application éditée par Masters Services Formation, publiée sur l’App Store le
        <strong>15 juin 2026</strong>. Elle couvre Cotonou et plusieurs destinations du Bénin et réunit
        <strong>cinq services</strong> : la course, la location de voiture (<strong>35 000 F par jour avec
        chauffeur</strong>, 30 000 F sans), la livraison, le tourisme et l’hébergement. Paiement en espèces, par
        portefeuille ou en Mobile Money. Aucun avis n’était publié à la date de consultation.
      </p>
      <p class="src">Sources : fiche de l’application INAS Travel (App Store), consultée le 2 octobre 2026 ; relevé de prix du fondateur.</p>
    </div>
    <div class="callout violet ajout" style="align-self:stretch; display:flex; align-items:center">
      <p style="margin:0; font-size:10px; text-align:left">
        <strong>Sa politique tarifaire.</strong> Un prix <strong>calculé au kilomètre</strong>, présenté comme
        transparent, sur <strong>trois catégories</strong> : Basique, Confort (climatisé) et Tricycle ; une livraison
        à prix fixe ; une location à la journée. Aucune grille n’est publiée.
      </p>
    </div>
  </div>

  <div class="h-serif ajout" style="margin-top:14px">Relevé complémentaire · course courte</div>
  <p class="intro ajout-in" style="margin-bottom:8px">
    Même trajet court sur les deux applications · début octobre 2026 · prix en FCFA. Le prix TamCar est celui de la course minimale.
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
        <td>Voiture climatisée<small>Confort chez les deux</small></td>
        <td>1 300</td><td class="tam">700</td><td class="moins">−46 %</td><td>12</td><td>22</td>
      </tr>
      <tr>
        <td>Tricycle<small>objectif de 9 000 F par jour</small></td>
        <td>400</td><td class="tam">400</td><td>0 %</td><td>23</td><td>23</td>
      </tr>
    </tbody>
  </table>
  <p class="intro ajout-in" style="margin-top:6px; font-size:9px">
    Courses nécessaires, à ce prix, pour atteindre l’objectif de volume du jour : 15 000 F par voiture, 9 000 F par
    tricycle (4.5.2). Ce relevé et celui du 30 septembre 2026 portent sur des distances différentes : ils ne se
    comparent pas entre eux.
  </p>

  <div class="rule-label ajout" style="margin-top:12px">Les conséquences pour TamCar</div>
  <div class="row c-1-1 ajout" style="margin-top:8px">
    <div class="tile">
      <div class="ico">{{ico:target}}</div>
      <h4>L’entrée de gamme devient un argument de conquête</h4>
      <p>
        Sur une course courte, TamCar est <strong>46 % moins cher qu’INAS</strong> en voiture et à parité en
        tricycle. « À partir de 500 F » devient l’accroche de la première course, avec la promotion de première
        course.
      </p>
    </div>
    <div class="tile violet">
      <div class="ico">{{ico:coins}}</div>
      <h4>Aucune baisse de prix en réponse</h4>
      <p>
        La grille de TamCar est déjà la plus basse du relevé. Descendre encore ferait passer l’objectif du jour de
        15 à 30 courses (500 F au lieu de 1 000 F) et réduirait la part du conducteur (200 F sur 500 F). TamCar
        <strong>maintient sa grille</strong>, relève les prix des concurrents chaque trimestre et défend ses volumes
        par le service (9.6).
      </p>
    </div>
    <div class="tile vert">
      <div class="ico">{{ico:car}}</div>
      <h4>Le tricycle ne se vend pas sur le prix</h4>
      <p>
        À 400 F, TamCar et INAS sont à parité, et la voiture ordinaire ne coûte que 100 F de plus. Le conducteur
        atteint son objectif par la distance (11 courses de 6,1 km à 850 F), non par la course minimale (23 courses
        à 400 F) : l’argument du tricycle est la traçabilité, TamAssur et TamPass.
      </p>
    </div>
    <div class="tile or">
      <div class="ico">{{ico:shield}}</div>
      <h4>La transparence ne suffit plus à se distinguer</h4>
      <p>
        INAS annonce des prix transparents au kilomètre. TamCar se distingue par ce qu’INAS n’annonce pas : une
        <strong>grille publiée et stable</strong>, sans majoration dynamique, la <strong>part du conducteur
        affichée</strong>, <strong>TamAssur</strong>, la voie vers la propriété du véhicule et la catégorie
        <strong>VIP</strong>, sans équivalent relevé chez INAS.
      </p>
    </div>
  </div>

  """

p3.span(debut, fin, page + fin)
p3.ecrire()
