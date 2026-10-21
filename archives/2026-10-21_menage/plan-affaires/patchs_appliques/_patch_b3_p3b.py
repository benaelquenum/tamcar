from _patchlib import Fichier

f = Fichier('partie3.html')
f.rep("""d’habitude : prix annoncé, réservation à l’avance, traçabilité de la course et sécurité du
      passager.
    </p>
  </div>""",
      """d’habitude : prix annoncé, réservation à l’avance, traçabilité de la course et sécurité du
      passager.
    </p>
  </div>

  <div class="rule-label" style="margin-top:20px">Ce que le relevé du 30 septembre 2026 montre (tableau page suivante)</div>
  <div class="row c-3" style="margin-top:10px">
    <div class="kpi"><b>−8 à −38 %</b><span>face à Gozem</span><small>moto, voiture ordinaire, tricycle</small></div>
    <div class="kpi"><b>+11 à +25 %</b><span>face à Yango</span><small>voiture ordinaire (800 puis 900 F)</small></div>
    <div class="kpi"><b>0</b><span>majoration dynamique</span><small>une grille connue : base, kilomètres, minutes</small></div>
  </div>""")
f.ecrire()
