"""source.html (couverture, 2.1, 2.7, TamAssur, 3.x) et partie4 (4.2.2, 4.7) : un seul pôle compté, Parakou en extension."""
import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _patchlib import Fichier

# ---------------------------------------------------------------- partie 4
F = Fichier('partie4.html')
F.rep("""Le plan de trésorerie place l’ouverture de Parakou au mois 7, une fois les résultats de
        Cotonou mesurés.""",
      """<span class="modif">Les projections de base ne comptent pas Parakou. Son ouverture serait décidée au plus tôt
        au mois 13, sur les critères du 9.3, une fois les résultats de Cotonou mesurés.</span>""")
F.rep("""L’extension vers d’autres zones, notamment Parakou (mois 7), suit les résultats de
          Cotonou et les ressources disponibles.""",
      """L’extension vers d’autres zones, notamment Parakou (au plus tôt au mois 13), suit les résultats de
          Cotonou et les ressources disponibles.""")
F.ecrire()

# ---------------------------------------------------------------- source.html
F = Fichier('source.html')
F.rep("""<b>2 pôles</b>
        <strong>Cotonou &amp; Grand Nokoué, Parakou</strong>
        <small>lancement progressif</small>""",
      """<b>1 pôle</b>
        <strong>Cotonou &amp; Grand Nokoué</strong>
        <small>Parakou en extension</small>""")
F.rep("""Document établi le 30 septembre 2026.""", """Document établi le 18 octobre 2026 (version 6).""")
F.rep("""Le lancement se fait dans deux pôles urbains : Cotonou et le Grand Nokoué, au sud du
        pays, ainsi que Parakou, dans le nord. Ce choix permet d’aborder progressivement deux
        marchés aux caractéristiques territoriales différentes, avant une extension
        géographique fondée sur les résultats obtenus.""",
      """Le lancement se fait à Cotonou et dans le Grand Nokoué, au sud du pays. Parakou,
        dans le nord, est un second marché étudié, ouvert en extension si les résultats de
        Cotonou le justifient (9.3) : il n’entre pas dans les projections de base.""")
F.rep("""<div class="callout violet"><strong>Nord</strong> — Parakou</div>""",
      """<div class="callout violet"><strong>Nord</strong> — Parakou, en extension</div>""")
F.rep("""<div class="kpi"><b>2</b><span>pôles urbains</span><small>Cotonou &amp; Grand Nokoué · Parakou</small></div>""",
      """<div class="kpi"><b>1 + 1</b><span>pôle de lancement, une extension</span><small>Cotonou &amp; Grand Nokoué · Parakou ensuite</small></div>""")
F.rep("""Le lancement de TamCar se fait dans deux zones géographiques complémentaires.
        <strong>Cotonou et le Grand Nokoué constituent le premier marché</strong>""",
      """Le lancement de TamCar se fait à Cotonou et dans le Grand Nokoué.
        <strong>Cotonou et le Grand Nokoué constituent le premier marché</strong>""")
F.rep("""<strong>Parakou constitue le second marché</strong>. Son rôle de pôle urbain dans le nord du
        Bénin permet de valider les conditions de déploiement de la plateforme en dehors de
        l’agglomération économique du sud.""",
      """<strong>Parakou constitue le second marché, en extension</strong>. Son rôle de pôle urbain dans le nord du
        Bénin permet de valider les conditions de déploiement de la plateforme en dehors de
        l’agglomération économique du sud ; son ouverture n’est pas comptée dans les projections de base.""")
F.rep("""L’ouverture effective de chaque marché est adaptée aux ressources disponibles, à la
      capacité de recrutement des conducteurs et aux résultats des premières opérations.""",
      """L’ouverture de Parakou est conditionnée aux résultats de Cotonou, à la capacité de
      recrutement des conducteurs et aux ressources disponibles.""")

# TamAssur
F.rep("""<b style="font-size:17px; color:#fff">300 000 F</b><span style="color:#fff; font-size:9px">après 1 an complet</span>""",
      """<b style="font-size:17px; color:#fff">250 000 F</b><span style="color:#fff; font-size:9px">garantis par an de cotisation</span>""")
F.rep("""Le conducteur éligible perçoit une somme de <strong>300 000 FCFA</strong> au terme d’une année
        complète de cotisation, dans le respect des conditions contractuelles.""",
      """TamCar garantit au conducteur éligible <strong>250 000 FCFA</strong> par année complète de cotisation
        (834 F épargnés chaque jour travaillé), dans le respect des conditions contractuelles.""")
F.rep("""le conducteur éligible peut percevoir <strong>300 000 F</strong>
        après une année complète.""",
      """TamCar lui garantit <strong>250 000 F</strong>
        par année complète de cotisation.""")
F.ecrire()
