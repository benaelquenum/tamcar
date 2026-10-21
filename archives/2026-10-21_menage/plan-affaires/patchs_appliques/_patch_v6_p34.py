"""Parties 3 et 4 + source : alignement sur le modèle v6 (planchers de recettes, TamAssur garantie, plus de cas B)."""
import math
import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _patchlib import Fichier
import modele_v6 as M

n = M.n
VT, VM, J = M.VOL_TRI, M.VOL_MOTO, M.JOURS          # 8 333, 4 167, 26
E, C = M.PLANCHER_ESS, M.PLANCHER_CONF               # 12 000, 15 000
# courses nécessaires (relevé 6,1 km : Essentiel 1 000, Confort 1 350, tricycle 850, moto 450)
c = lambda vol, prix: math.ceil(vol / prix)

# ---------------------------------------------------------------- partie 3
F = Fichier('partie3.html')

F.rep("""L’objectif de volume de TamCar pour
    une moto (4 500 F par jour, voir 3.6) est de même nature : un montant brut, avant carburant
    et avant la part de TamCar.""",
      f"""Le plancher de recettes de TamCar pour
    une moto ({n(VM)} F par jour, voir 3.6) est de même nature : un montant brut, avant carburant
    et avant la part de TamCar.""")

F.rep("""Ce dernier permet au conducteur éligible de bénéficier d’une somme de 300 000 FCFA au
        terme d’une année complète de cotisation.""",
      """Ce dernier est financé par une cotisation de 1 000 FCFA par jour travaillé, et TamCar garantit au
        conducteur éligible 250 000 FCFA par année complète de cotisation.""")

F.rep("""<td>Voiture ordinaire<small>INAS : Basique · TamCar : Essentiel</small></td>
        <td>925</td><td class="tam">500</td><td class="moins">−46 %</td><td>17</td><td>30</td>""",
      f"""<td>Voiture ordinaire<small>INAS : Basique · TamCar : Essentiel</small></td>
        <td>925</td><td class="tam">500</td><td class="moins">−46 %</td><td>{c(E, 925)}</td><td>{c(E, 500)}</td>""")
F.rep("""<td>1 300</td><td class="tam">700</td><td class="moins">−46 %</td><td>12</td><td>22</td>""",
      f"""<td>1 300</td><td class="tam">700</td><td class="moins">−46 %</td><td>{c(C, 1300)}</td><td>{c(C, 700)}</td>""")
F.rep("""<td>Tricycle<small>objectif de 9 000 F par jour</small></td>
        <td>400</td><td class="tam">400</td><td>0 %</td><td>23</td><td>23</td>""",
      f"""<td>Tricycle<small>plancher de {n(VT)} F par jour</small></td>
        <td>400</td><td class="tam">400</td><td>0 %</td><td>{c(VT, 400)}</td><td>{c(VT, 400)}</td>""")
F.rep("""<th>Courses pour<br>l’objectif · INAS</th><th>Courses pour<br>l’objectif · TamCar</th>""",
      """<th>Courses pour<br>le plancher · INAS</th><th>Courses pour<br>le plancher · TamCar</th>""")
F.rep("""Courses nécessaires, à ce prix, pour atteindre l’objectif de volume du jour : 15 000 F par voiture, 9 000 F par
    tricycle (4.5.2).""",
      f"""Courses nécessaires, à ce prix, pour atteindre le plancher de recettes du jour : {n(E)} F par Essentiel, {n(C)} F par Confort,
    {n(VT)} F par tricycle (4.5.2).""")
F.rep("""Descendre encore ferait passer l’objectif du jour de
        15 à 30 courses (500 F au lieu de 1 000 F)""",
      f"""Descendre encore ferait passer le plancher du jour d’une Essentiel de
        {c(E, 1000)} à {c(E, 500)} courses (500 F au lieu de 1 000 F)""")
F.rep("""Le conducteur
        atteint son objectif par la distance (11 courses de 6,1 km à 850 F), non par la course minimale (23 courses
        à 400 F)""",
      f"""Le conducteur
        atteint son plancher par la distance ({c(VT, 850)} courses de 6,1 km à 850 F), non par la course minimale ({c(VT, 400)} courses
        à 400 F)""")
F.rep("""Le bilan du test moto à trois
        mois (cas B) mesure cette sensibilité.""",
      """Les cinq motos de la flotte de départ
        mesurent cette sensibilité dès les premiers mois.""")

# 3.6 : tableau des planchers
F.span("""<div class="h-serif ajout" style="margin-top:12px">Objectif de volume par véhicule</div>""",
       """</tbody>
  </table>""",
       f"""<div class="h-serif ajout" style="margin-top:12px">Plancher de recettes par véhicule</div>
  <p class="intro ajout-in">
    Le plancher de recettes de TamCar est exprimé <strong>en montant de courses réalisées par véhicule et
    par jour, et non en nombre de courses</strong>. Le conducteur en verse 60 %.
  </p>
  <table class="tbl serre ajout" style="margin-top:10px">
    <colgroup><col style="width:36%"><col style="width:16%"><col style="width:16%"><col style="width:16%"><col style="width:16%"></colgroup>
    <thead><tr><th>Par véhicule</th><th>Essentiel</th><th>Confort</th><th>Tricycle</th><th>Moto</th></tr></thead>
    <tbody>
      <tr><td>Plancher par jour</td><td>{n(E)}</td><td>{n(C)}</td><td>{n(VT)}</td><td>{n(VM)}</td></tr>
      <tr><td>Par mois ({J} jours)</td><td>{n(E * J)}</td><td>{n(C * J)}</td><td>{n(VT * J)}</td><td>{n(VM * J)}</td></tr>
      <tr><td>Équivalent en courses de 6,1 km<small>aux prix du relevé</small></td><td>{c(E, 1000)}</td><td>{c(C, 1350)}</td><td>{c(VT, 850)}</td><td>{c(VM, 450)}</td></tr>
    </tbody>
  </table>""")
F.ecrire()

# ---------------------------------------------------------------- partie 4
F = Fichier('partie4.html')
F.rep("""contribution de <strong>1 000 FCFA par jour travaillé</strong>, du lundi au samedi, et une somme de
        300 000 FCFA au terme d’une année complète de cotisation, selon des conditions d’éligibilité précises.""",
      """contribution de <strong>1 000 FCFA par jour travaillé</strong>, du lundi au samedi, et une épargne
        <strong>garantie par TamCar à hauteur de 250 000 FCFA</strong> par année complète de cotisation, selon des conditions d’éligibilité précises.""")

F.span("""<div class="h-serif ajout" style="margin-top:20px">Objectif de volume par véhicule</div>""",
       """</tbody>
  </table>""",
       f"""<div class="h-serif ajout" style="margin-top:20px">Plancher de recettes par véhicule</div>
  <p class="intro ajout-in">
    Le plancher commercial est exprimé en montant de courses réalisées par véhicule et par jour,
    et non en nombre de courses. Il fixe aussi le versement du conducteur (60 %).
  </p>
  <table class="tbl ajout" style="margin-top:10px">
    <colgroup><col style="width:36%"><col style="width:16%"><col style="width:16%"><col style="width:16%"><col style="width:16%"></colgroup>
    <thead><tr><th>Par véhicule</th><th>Essentiel</th><th>Confort</th><th>Tricycle</th><th>Moto</th></tr></thead>
    <tbody>
      <tr><td>Plancher par jour</td><td>{n(E)}</td><td>{n(C)}</td><td>{n(VT)}</td><td>{n(VM)}</td></tr>
      <tr><td>Versement du conducteur par jour</td><td>{n(M.VERS_ESS)}</td><td>{n(M.VERS_CONF)}</td><td>{n(M.VERS_TRI)}</td><td>{n(M.VERS_MOTO)}</td></tr>
      <tr><td>Par mois ({J} jours)</td><td>{n(E * J)}</td><td>{n(C * J)}</td><td>{n(VT * J)}</td><td>{n(VM * J)}</td></tr>
      <tr><td>Repère : équivalent en courses de 6,1 km<small>aux prix du relevé</small></td><td>{c(E, 1000)}</td><td>{c(C, 1350)}</td><td>{c(VT, 850)}</td><td>{c(VM, 450)}</td></tr>
    </tbody>
  </table>""")
F.rep("""<strong>Moto.</strong> L’objectif de 4 500 F par jour est du même ordre""",
      f"""<strong>Moto.</strong> Le plancher de {n(VM)} F par jour (3 500 F à verser, cotisation TamAssur comprise) est du même ordre""")
F.rep("""<strong>Voitures et tricycles.</strong> 15 000 F et 9 000 F par jour de volume facturé,
      avant commission, carburant et charges du véhicule. La part du chauffeur dépend de sa
      formule (véhicule personnel ou véhicule d’un partenaire).""",
      f"""<strong>Voitures et tricycles.</strong> {n(E)} F (Essentiel), {n(C)} F (Confort) et {n(VT)} F (tricycle) par jour de volume facturé,
      avant commission, carburant et charges du véhicule. Le conducteur verse 60 % au propriétaire et à TamCar ;
      le reste lui appartient.""")
F.rep("""Les objectifs chiffrés sont fixés dans le prévisionnel financier (partie 7) : 9 000 F par
      jour et par tricycle, 4 500 F par moto, 15 000 F par voiture (4.5.2).""",
      f"""Les planchers de recettes sont fixés dans le prévisionnel financier (partie 7) : {n(VT)} F par
      jour et par tricycle, {n(VM)} F par moto, {n(E)} F par Essentiel, {n(C)} F par Confort (4.5.2).""")
F.rep("""L’objectif de 4 500 F par jour en moto est du même ordre""",
      f"""Le plancher de {n(VM)} F par jour en moto est du même ordre""")
F.ecrire()
