import pathlib
p = pathlib.Path('source.html')
s = p.read_text(encoding='utf-8')


def rep(old, new, cnt=1):
    global s
    assert old in s, old[:100]
    s = s.replace(old, new, cnt)


# 2.6 hero TamAssur
rep('<span class="pill">Dispositif d’épargne · conducteurs</span>', '<span class="pill">TamAssur · épargne des conducteurs</span>')
rep("""        TamCar prévoit de mettre en place, en partenariat avec NSIA Assurances, un
        dispositif destiné à encourager la régularité des conducteurs et à leur permettre de
        bénéficier d’un avantage financier au terme d’une année de cotisation.""", """        TamCar prévoit de mettre en place, en partenariat avec NSIA Assurances, un
        dispositif, <strong>TamAssur</strong>, destiné à encourager la régularité des conducteurs et à leur permettre de
        bénéficier d’un avantage financier au terme d’une année de cotisation.""")
rep('{{ico:coins}} Le mécanisme envisagé</div>', '{{ico:coins}} Le mécanisme envisagé : TamAssur</div>')
rep("""        Le mécanisme envisagé repose sur un prélèvement de 1 000 FCFA sur le TamWallet du
        conducteur pour chaque jour de travail comptabilisé,""", """        Le mécanisme envisagé repose sur un prélèvement de <strong>1 000 FCFA</strong> sur le TamWallet du
        conducteur pour chaque jour de travail comptabilisé,""")
rep("""        percevoir une somme de 300 000 FCFA au terme d’une année complète de cotisation.""", """        percevoir une somme de <strong>300 000 FCFA</strong> au terme d’une année complète de cotisation.""")

# TamPass : période de pluie
rep("""        déplacements et améliorer la prévisibilité de l’activité des conducteurs.
      </p>
    </div>
  </div>
""", """        déplacements et améliorer la prévisibilité de l’activité des conducteurs.
      </p>
      <p>
        Il peut aussi apporter une solution à la <strong>difficulté de trouver un conducteur en période
        de pluie</strong>, une difficulté très ressentie par les populations, surtout lorsqu’il faut se
        rendre au travail ou à un rendez-vous très important.
      </p>
    </div>
  </div>
""")

# Commande à l'avance
avance = '''  <div class="hero" style="margin-top:14px">
    <span class="pill">Commande à l’avance</span>
    <h2 style="font-size:22px">Réserver son transport, <em>sans abonnement.</em></h2>
    <div style="column-count:2; column-gap:24px">
      <p style="margin-top:0">
        TamCar permet aussi de <strong>commander un transport à l’avance</strong> : le passager choisit
        le trajet, la date et l’heure, et son conducteur est recherché dès la réservation.
      </p>
      <p>
        C’est la réponse aux déplacements qui <strong>ne supportent pas l’incertitude</strong> : se rendre
        au travail, à un rendez-vous important ou à un lieu précis à une heure précise, notamment
        <strong>en période de pluie</strong>, quand les conducteurs se font rares.
      </p>
    </div>
    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:12px 0 2px">
      <div class="kpi" style="padding:11px 6px 9px; background:rgba(255,255,255,.1); border-color:rgba(255,255,255,.22)">
        <b style="font-size:17px; color:#fff">30 min</b><span style="color:#fff; font-size:9px">de délai minimal</span></div>
      <div class="kpi" style="padding:11px 6px 9px; background:rgba(255,255,255,.1); border-color:rgba(255,255,255,.22)">
        <b style="font-size:17px; color:#fff">12 km</b><span style="color:#fff; font-size:9px">de recherche dès la réservation</span></div>
      <div class="kpi" style="padding:11px 6px 9px; background:rgba(255,255,255,.1); border-color:rgba(255,255,255,.22)">
        <b style="font-size:17px; color:#fff">4 rappels</b><span style="color:#fff; font-size:9px">aux deux parties</span></div>
    </div>
  </div>

  <div class="row c-1-1 stretch" style="margin-top:12px">
    <div class="callout">
      <strong>Un conducteur trouvé, ou une alternative.</strong> La recherche démarre dès la
      réservation. Si personne n’accepte rapidement, le passager peut continuer d’attendre,
      choisir une alternative avec son nouveau prix, ou annuler.
    </div>
    <div class="callout violet">
      <strong>Annulation gratuite jusqu’à 10 minutes avant le départ.</strong> Au-delà, une
      pénalité de 200 F est prélevée sur celui qui annule, passager ou conducteur. Des rappels sont
      envoyés aux deux parties à 30, 20, 10 et 5 minutes du départ.
    </div>
  </div>
'''
rep('@@AVANCE@@\n', avance)

# 2.7
rep("""    <p style="margin:0 0 6px">
      Le lancement dans ces deux zones devra être précédé d’une analyse de la demande, de
      l’offre de conducteurs, des coûts de déplacement, de la concurrence, de l’accès aux
      moyens de paiement numériques et des exigences réglementaires applicables.
    </p>""", """    <p style="margin:0 0 6px">
      <strong>Cette analyse a déjà été menée dans les deux zones</strong> : demande, offre de
      conducteurs, coûts de déplacement, concurrence, accès aux moyens de paiement numériques et
      exigences réglementaires. <strong>Ses résultats ont renforcé l’intérêt d’une implantation</strong>
      à Cotonou et dans le Grand Nokoué comme à Parakou.
    </p>""")

# 2.8 tile
rep("""        Le dispositif d’épargne et le service TamPass constituent deux leviers de
        différenciation envisagés.""", """        <strong>TamAssur</strong> et <strong>TamPass</strong> constituent deux leviers de
        différenciation envisagés.""")

# sous-section sociale, après les 3 tuiles de 2.8
old_pied = '''        durable entre les différentes parties prenantes.
      </p>
    </div>
  </div>

  <div class="pn">'''
assert old_pied in s
social = '''        durable entre les différentes parties prenantes.
      </p>
    </div>
  </div>

  <div class="h-serif" style="margin-top:20px">Activité économique, oui… mais aussi sociale</div>
  <div class="card" style="margin-top:10px">
    <p>
      TamCar n’est pas seulement une activité économique : c’est aussi un projet à
      <strong>portée sociale</strong>. Pour un conducteur, le revenu dépend de chaque journée de
      travail, et mettre de l’argent de côté n’a rien d’évident. <strong>L’épargne</strong>, <strong>l’accès à
      la propriété du véhicule</strong> et <strong>l’entrée dans le métier sans capital</strong> sont au
      cœur du projet.
    </p>
  </div>
  <div class="row c-3 stretch">
    <div class="tile">
      <div class="ico">{{ico:coins}}</div>
      <h4>Épargner</h4>
      <p>
        Avec TamAssur, <strong>1 000 F</strong> par jour de travail, dans la limite de 26 jours par mois,
        sont mis de côté avec NSIA Assurances. Au terme d’une année complète de cotisation, le
        conducteur éligible peut percevoir <strong>300 000 F</strong>.
      </p>
    </div>
    <div class="tile violet">
      <div class="ico">{{ico:car}}</div>
      <h4>Devenir propriétaire</h4>
      <p>
        Une part de chaque course alimente un <strong>fonds de rachat</strong> : au terme de la période de
        cession (24 mois pour une moto, 36 mois pour un tricycle), le conducteur peut accéder à la
        <strong>propriété de son véhicule</strong>.
      </p>
    </div>
    <div class="tile vert">
      <div class="ico">{{ico:users}}</div>
      <h4>Entrer sans capital</h4>
      <p>
        Grâce aux véhicules des <strong>concessionnaires partenaires</strong>, un conducteur qui n’a pas
        de véhicule peut rejoindre la plateforme : le véhicule cesse d’être une condition d’entrée.
      </p>
    </div>
  </div>
  <div class="callout" style="margin-top:12px">
    <strong>Un revenu plus stable, une relation plus durable.</strong> Ces mécanismes s’ajoutent à un
    prix connu d’avance et à une part du conducteur affichée avant l’acceptation de chaque course.
  </div>

  <div class="pn">'''
s = s.replace(old_pied, social, 1)

# 2.9 tile épargne
rep("""      <h4>Épargne pré-élaborée</h4>
      <p>
        Le concept du dispositif d’épargne destiné aux conducteurs a fait l’objet d’une""", """      <h4>TamAssur pré-élaboré</h4>
      <p>
        Le concept de <strong>TamAssur</strong>, le dispositif d’épargne destiné aux conducteurs, a fait l’objet d’une""")
p.write_text(s, encoding='utf-8')
print('ok')
