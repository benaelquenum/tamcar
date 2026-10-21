import pathlib, re

# ===================================================================== gen_partie8.py
p = pathlib.Path('gen_partie8.py'); s = p.read_text(encoding='utf-8')


def rep(old, new, count=1):
    global s
    assert old in s, ('gen8', old[:100])
    s = s.replace(old, new, count)


# -- variables
rep("UA, UB = usage_levee('A', SA), usage_levee('B', SB)",
    """UA, UB = usage_levee('A', SA), usage_levee('B', SB)
TA, TB = C.tracker_annuel('A'), C.tracker_annuel('B')
TRI_V, MOTO_V = C.tracker_par_vehicule()
STA, STB = C.sans_tracker('A'), C.sans_tracker('B')
OPTA = C.options_correctives('A')


def seuil_sans(cas):
    lo, hi = 0.4, 1.3
    for _ in range(40):
        mid = (lo + hi) / 2
        if min(l['tresorerie'] for l in M.simuler_cas(cas, mid, C.CESSION_MOTO if cas == 'B' else None, tracker=None)) >= 0: hi = mid
        else: lo = mid
    return 100 * hi


SEUIL_A_SANS, SEUIL_B_SANS = seuil_sans('A'), seuil_sans('B')
MENS_TRACKER = M.TRACKER_ANATT['tri'][0] / 12
mi0_b, mo0_b, fi0_b = C.moto_stress(0.0)""")

# -- 8.1 : liste et renvois
rep("<li>l’assurance, le droit taxi et la visite technique des véhicules, tant qu’elle en est propriétaire ;</li>",
    "<li>l’assurance, le droit taxi, la visite technique et le tracker GPS des véhicules, tant qu’elle en est propriétaire (8.3 et 8.4) ;</li>")
rep("<li>le prix des véhicules : avances puis mensualités (8.5) ;</li>", "<li>le prix des véhicules : avances puis mensualités (8.6) ;</li>") if "<li>le prix des véhicules : avances puis mensualités (8.5) ;</li>" in s else None
s = s.replace("<li>le prix des véhicules : avances puis mensualités (8.5).</li>", "<li>le prix des véhicules : avances puis mensualités (8.6).</li>")
s = s.replace("<li>l’impôt et la patente : non chiffrés à ce stade (8.8).</li>", "<li>l’impôt et la patente : non chiffrés à ce stade (8.9).</li>")

# -- 8.3 : ligne tracker
rep("      {tr('Assurance, droit taxi, visite technique', f'75 000 par an et par tricycle ({n(ASS_TRI_M)} par mois)<br>50 000 par an et par moto ({n(ASS_MOTO_M)} par mois)', 'Fixe', 'Depuis la livraison, jusqu’à la cession du véhicule au chauffeur')}",
    "      {tr('Assurance, droit taxi, visite technique', f'75 000 par an et par tricycle ({n(ASS_TRI_M)} par mois)<br>50 000 par an et par moto ({n(ASS_MOTO_M)} par mois)', 'Fixe', 'Depuis la livraison, jusqu’à la cession du véhicule au chauffeur')}\n"
    "      {tr('Tracker GPS certifié ANATT', '139 000 en année 1, puis 89 000 par an (tricycle) ou 49 000 par an (moto)', 'Fixe', 'Payé à la livraison puis à chaque anniversaire, jusqu’à la cession (8.4)')}")

# -- renumérotation des sections suivantes
for old, new in (('8.8 · Conclusion et points à arrêter', '8.9 · Conclusion et points à arrêter'),
                 ('8.7 · Sensibilité et seuils de pilotage', '8.8 · Sensibilité et seuils de pilotage'),
                 ('8.6 · Le plan de financement', '8.7 · Le plan de financement'),
                 ('8.5 · Le financement des véhicules', '8.6 · Le financement des véhicules'),
                 ('8.4 · L’évolution des charges dans le temps', '8.5 · L’évolution des charges dans le temps')):
    rep(old, new)
s = s.replace('08 · p.8 · 8.8 -->', '08 · p.9 · 8.9 -->').replace('08 · p.7 · 8.7 -->', '08 · p.8 · 8.8 -->') \
     .replace('08 · p.6 · 8.6 -->', '08 · p.7 · 8.7 -->').replace('08 · p.5 · 8.5 -->', '08 · p.6 · 8.6 -->').replace('08 · p.4 · 8.4 -->', '08 · p.5 · 8.5 -->')

# -- phases : colonne assurances + trackers
rep("<th>dont assurances</th>", "<th>dont assurances, trackers</th>")
rep("n(p['mens']), f'<strong>{sg(p[\"flux\"])}</strong>')", "n(p['mens']), f'<strong>{sg(p[\"flux\"])}</strong>')") if False else None
rep("n(autres), n(p['assur']),", "n(autres), n(p['assur'] + p['tracker']),")

# -- 8.8 : texte « scénario prudent » dynamique
rep("""      <strong>Scénario prudent.</strong> Le cas A ne tient pas ({mm(SAP['mini'])} au point bas) ; le cas B
      est presque à l’équilibre ({mm(SBP['mini'])}). Les motos réduisent donc le besoin de financement.""",
    """      <strong>Scénario prudent.</strong> Aucun des deux cas ne tient : {mm(SAP['mini'])} au point bas pour le
      cas A, {mm(SBP['mini'])} pour le cas B. Les motos réduisent le besoin de financement de
      {mm(SBP['mini'] - SAP['mini'], 1, False)}.""")

# -- 8.9 : conclusion dynamique
a = s.index("      <p style=\"text-align:left\">\n        Avec 15 M FCFA de levée, le scénario de base laisse")
b = s.index("      <p style=\"text-align:left\">\n        Les seuils de pilotage sont simples")
s = s[:a] + """      <p style="text-align:left">
        Avec 15 M FCFA de levée, le scénario de base laisse, dans le cas B, une réserve de
        {mm(SB['mini'], 1, False)} au point bas et aucun mois de trésorerie négative. Dans le cas A, le point
        bas est de {mm(SA['mini'])} au mois {SA['mois_mini']} : un creux de {SA['tres_neg']} mois, que quatre
        ajustements comblent (voir ci-dessous). Le scénario prudent n’est couvert dans aucun des deux cas.
      </p>
""" + s[b:]
rep("""Les seuils de pilotage sont simples : le volume par tricycle doit rester au-dessus de
        {pct(SEUIL_A, 0)} de l’objectif, soit {n(9000 * SEUIL_A / 100)} F par jour, et le bilan du test
        moto à 3 mois décide de l’extension.""",
    """Le seuil de pilotage est net : avec les trackers, le volume par véhicule doit atteindre
        {pct(SEUIL_A, 0)} de l’objectif dans le cas A et {pct(SEUIL_B, 0)} dans le cas B. Le bilan du test
        moto à 3 mois décide de l’extension.""")

# -- 8.9 : points à arrêter (tracker + correctifs pour A)
rep("""        <li>garantie du fournisseur sur les véhicules neufs, qui délimite la responsabilité de TamCar.</li>""",
    """        <li>garantie du fournisseur sur les véhicules neufs, qui délimite la responsabilité de TamCar ;</li>
        <li>trackers GPS : confirmation de l’obligation et des prix avec l’ANATT, et possibilité d’étaler le paiement.</li>""")
rep("""  <div class="callout ajout" style="margin-top:14px">
    <strong>Ce que l’investisseur doit retenir.</strong> Le plan repose sur quatre réglages : responsables payés
    à 3 % du volume, pas de marketing récurrent, développeur rémunéré à partir du mois 13, solde des
    véhicules sur 18 mois. Chacun est chiffré en partie 7 et peut être révisé sans changer la structure
    du plan.
  </div>""",
    """  <div class="callout ajout" style="margin-top:14px">
    <strong>Combler le creux du cas A.</strong> Quatre ajustements rétablissent une trésorerie jamais négative :
    solde des véhicules sur 21 mois (point bas {mm(OPTA['solde_21'])}) ou 24 mois ({mm(OPTA['solde_24'])}) ;
    levée portée à 15,5 M FCFA ({mm(OPTA['levee_15_5'])}) ; ou tracker de l’année 1 seul à la charge de TamCar. La
    levée minimale qui couvre le cas A est de {n(OPTA['levee_mini'])} FCFA.
  </div>""")

# -- page 8.4 (trackers), insérée après la page 8.3
page84 = '''
# ------------------------------------------------------------ 8.4
pages.append(f\'\'\'<!-- ============================================================ 08 · p.4 · 8.4 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">08</span><h1>Charges d’exploitation et plan de financement <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">8.4 · Les trackers GPS : une obligation et un outil de contrôle</div>

  <div class="hero" style="margin-top:12px; padding:18px 24px">
    <span class="pill">Tracker GPS certifié ANATT</span>
    <div class="cols2" style="margin-top:4px">
      <p style="text-align:left">
        Le tracker est un boîtier GPS posé dans le véhicule. Il transmet sa position en continu,
        indépendamment du téléphone du conducteur. Selon le relevé de l’ANATT, un dispositif certifié est
        obligatoire pour les véhicules de transport ; il se renouvelle chaque année.
      </p>
      <p style="text-align:left">
        Pour TamCar, il a deux fonctions : c’est une condition pour exploiter légalement, et c’est
        l’outil qui protège et contrôle les véhicules qu’elle possède.
      </p>
    </div>
  </div>

  <div class="row c-1-1 stretch" style="margin-top:12px">
    <table class="tbl" style="margin-top:0">
      <colgroup><col style="width:28%"><col style="width:24%"><col style="width:24%"><col style="width:24%"></colgroup>
      <thead><tr><th>Par véhicule, en FCFA</th><th>Année 1</th><th>Années suivantes</th><th>Sur la détention par TamCar</th></tr></thead>
      <tbody>
        {tr('Tricycle', '139 000', '89 000', f'<strong>{n(TRI_V)}</strong><small>36 mois</small>')}
        {tr('Moto', '139 000', '49 000', f'<strong>{n(MOTO_V)}</strong><small>24 mois</small>')}
      </tbody>
    </table>
    <table class="tbl" style="margin-top:0">
      <colgroup><col style="width:28%"><col style="width:18%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup>
      <thead><tr><th>Dans le plan, en FCFA</th><th>Année 1</th><th>Année 2</th><th>Année 3</th><th>Total</th></tr></thead>
      <tbody>
        {tr('Cas A', n(TA[0]), n(TA[1]), n(TA[2]), f'<strong>{n(sum(TA))}</strong>')}
        {tr('Cas B', n(TB[0]), n(TB[1]), n(TB[2]), f'<strong>{n(sum(TB))}</strong>')}
      </tbody>
    </table>
  </div>
  <div class="src">Prix de l’ANATT relevés en juillet 2026 et maintenus. Paiement annuel, à la livraison puis à chaque anniversaire, tant que TamCar est propriétaire ; à la cession, le chauffeur reprend le renouvellement.</div>

  <div class="rule-label" style="margin-top:14px">Pourquoi le tracker compte pour le business</div>
  <div class="row c-3 stretch" style="margin-top:8px">
    <div class="tile">
      <div class="ico">{{{{ico:shield}}}}</div>
      <h4>Conformité</h4>
      <p>Sans dispositif certifié, le véhicule ne peut pas être autorisé au transport (à confirmer avec l’ANATT). C’est une condition d’exploitation, pas une option.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:car}}}}</div>
      <h4>Protection de l’actif</h4>
      <p>TamCar possède de {mm(C.vehicules('A')[2], 1, False)} à {mm(C.vehicules('B')[2], 2, False)} FCFA de véhicules. Le tracker permet de les localiser et de les récupérer en cas de vol ou de détournement.</p>
    </div>
    <div class="tile vert">
      <div class="ico">{{{{ico:coins}}}}</div>
      <h4>Intégrité des revenus</h4>
      <p>La commission dépend des courses enregistrées. La position du véhicule permet de repérer une activité hors plateforme et de rapprocher kilomètres et courses.</p>
    </div>
  </div>
  <div class="row c-3 stretch">
    <div class="tile or">
      <div class="ico">{{{{ico:alert}}}}</div>
      <h4>Sécurité et litiges</h4>
      <p>En cas d’accident, d’incident ou de réclamation, l’historique de position sert de preuve. Il complète le suivi en direct de la plateforme, qui repose sur le téléphone du conducteur.</p>
    </div>
    <div class="tile">
      <div class="ico">{{{{ico:chart}}}}</div>
      <h4>Pilotage de la flotte</h4>
      <p>Disponibilité, immobilisations, kilomètres parcourus : ces données alimentent les indicateurs de rentabilité (6.6) et le calendrier d’entretien.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:clipboard}}}}</div>
      <h4>Cession et assurance</h4>
      <p>L’historique d’usage documente l’état du véhicule à la cession et peut peser dans les conditions d’assurance.</p>
    </div>
  </div>

  <div class="row c-1-1 stretch" style="margin-top:12px">
    <div class="callout">
      <strong>Qui paie.</strong> TamCar, pour les véhicules qu’elle possède, jusqu’à leur cession. Pour les véhicules des
      concessionnaires partenaires, le tracker reste à leur charge. Le demander au conducteur pèserait
      {n(MENS_TRACKER)} F par mois sur son revenu en main : 12 % pour un tricycle, 25 % pour une moto.
    </div>
    <div class="callout rouille">
      <strong>Effet sur le plan.</strong> Les trackers coûtent {n(sum(TA))} FCFA (cas A) et {n(sum(TB))} FCFA (cas B) sur
      36 mois. Point bas du cas A : {mm(STA['mini'])} sans tracker, {mm(SA['mini'])} avec ; cas B : {mm(STB['mini'])}
      contre {mm(SB['mini'])}. Marge de sécurité : {pct(SEUIL_A_SANS, 0)} contre {pct(SEUIL_A, 0)} de l’objectif
      (cas A), {pct(SEUIL_B_SANS, 0)} contre {pct(SEUIL_B, 0)} (cas B).
    </div>
  </div>
  <div class="rnote">Hypothèses de ma part : TamCar paie les trackers de sa flotte ; paiement annuel d’avance. À confirmer avec l’ANATT : obligation pour tricycles et motos, étalement possible. Le suivi live actuel repose sur le GPS du téléphone du conducteur ; l’intégration des trackers dans l’espace de gestion reste à développer.</div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
\'\'\')
'''
marque = "# ------------------------------------------------------------ 8.4\ndef table_phases"
assert marque in s
s = s.replace(marque, page84 + "\n" + marque, 1)
p.write_text(s, encoding='utf-8')

# ===================================================================== gen_partie7.py
q = pathlib.Path('gen_partie7.py'); t = q.read_text(encoding='utf-8')


def rep7(old, new):
    global t
    assert old in t, ('gen7', old[:100])
    t = t.replace(old, new, 1)


rep7("mi50, _, fi50 = C.moto_stress(0.5)\nmi0, _, fi0 = C.moto_stress(0.0)",
     "mi50, _, fi50 = C.moto_stress(0.5)\nmi0, mo0, fi0 = C.moto_stress(0.0)\nOPTA = C.options_correctives('A')\nTA, TB = C.tracker_annuel('A'), C.tracker_annuel('B')")
rep7("Carburant, entretien et réparations : à la charge du conducteur.</span>')}",
     "Trackers GPS certifiés ANATT (8.4). Carburant, entretien et réparations : à la charge du conducteur.</span>')}")

# 7.5 : paragraphe dynamique
a = t.index("      <span class=\"modif\">Dans le scénario de base, la trésorerie reste positive tous les mois dans les deux")
b = t.index("    </p>\n    <p>\n      Ces agrégats sont ceux du scénario de base")
t = t[:a] + """      <span class="modif">Dans le scénario de base, le cas B garde une trésorerie positive tous les mois : point bas de
      {mm(B['mini'])} FCFA au mois {B['mois_mini']}, puis {mm(B['fin'])} au mois 36 ; flux stable dès le mois {B['stable']}.
      Le cas A passe brièvement sous zéro : point bas de {mm(A['mini'])} au mois {A['mois_mini']}, soit {A['tres_neg']} mois de
      trésorerie négative, puis {mm(A['fin'])} au mois 36 ; flux stable dès le mois {A['stable']}. Ce creux tient aux trackers
      GPS (8.4) : sans eux, le cas A aurait un point bas de {mm(C.sans_tracker('A')['mini'])}. Il se comble par un solde des
      véhicules sur 21 mois ({mm(OPTA['solde_21'])} au point bas), par un solde sur 24 mois ({mm(OPTA['solde_24'])}) ou par une
      levée de {mm(OPTA['levee_mini'] + 50_000, 1, False)} FCFA.</span>
""" + t[b:]

# 7.5 (fin) : ligne trackers dans la répartition + lecture
rep7("      {ligne_cat('Prestataires et promotions de lancement', 'comptable externe, juriste, promotions', 'c_presta')}",
     "      {ligne_cat('Prestataires et promotions de lancement', 'comptable externe, juriste, promotions', 'c_presta')}\n      {ligne_cat('Trackers GPS certifiés ANATT', 'payés à la livraison puis à chaque anniversaire', 'c_tracker')}")
rep7("ni parrainage, ni community manager, ni entretien des véhicules (à la charge du conducteur).",
     "ni parrainage, ni community manager, ni entretien des véhicules (à la charge du conducteur). Les trackers GPS\n    (8.4) pèsent environ un dixième des charges.")

# 7.6 : texte dynamique
a = t.index("        <span class=\"modif\">Dans cette hypothèse, le cas A atteint un point bas de trésorerie de")
b = t.index("reste particulièrement sensible au niveau de financement disponible au lancement et à la")
t = t[:a] + """        <span class="modif">Dans cette hypothèse, le cas A atteint un point bas de trésorerie de
        {mm(AP['mini'])} FCFA au mois {AP['mois_mini']}, et le cas B de {mm(BP['mini'])} au mois {BP['mois_mini']}.
        Les motos réduisent le besoin de financement de {mm(BP['mini'] - AP['mini'], 1, False)}, mais aucun des deux cas
        ne tient à ce niveau d’activité.</span> Le projet
        """ + t[b:]

# 7.8 : conclusion dynamique
a = t.index("<span class=\"modif\">{mm(A['rec_ops'], 1, False)} FCFA (cas A) et")
b = t.index("      </p>\n      <p style=\"text-align:left\">\n        La réalisation de ces objectifs")
t = t[:a] + """<span class="modif">{mm(A['rec_ops'], 1, False)} FCFA (cas A) et {mm(B['rec_ops'] + B['fonds'], 1, False)}
        FCFA (cas B)</span> sur 36 mois et une trésorerie <span class="modif">à 36 mois de {mm(A['fin'], 1, False)} FCFA
        dans le cas A et de {mm(B['fin'], 1, False)} FCFA dans le cas B. Avec les trackers GPS, le cas B garde une
        trésorerie positive tous les mois ; le cas A a un creux de {A['tres_neg']} mois ({mm(A['mini'])} au point bas)
        qu’un solde sur 21 ou 24 mois comble. Le scénario prudent n’est couvert dans aucun des deux cas.</span>
""" + t[b:]
rep7("<p>Les 5 motos restent en service ; bilan à 3 mois. Même vides, elles laissent le plan positif à 36 mois ({sg(fi0)}). Détail en 8.7.</p>",
     "<p>Les 5 motos restent en service ; bilan à 3 mois. Si elles ne roulent pas, le point bas atteint {mm(mi0)} (mois {mo0}) et le plan finit à {mm(fi0)}. Détail en 8.8.</p>")
q.write_text(t, encoding='utf-8')

# ===================================================================== partie 6 / 5 : mention du tracker
for fichier, old, new in (
    ('partie6.html', 'En contrepartie, elle finance l’achat et l’assurance du véhicule.', 'En contrepartie, elle finance l’achat, l’assurance et le tracker GPS certifié du véhicule.'),):
    r = pathlib.Path(fichier); u = r.read_text(encoding='utf-8')
    assert old in u, (fichier, old)
    r.write_text(u.replace(old, new, 1), encoding='utf-8')
print('ok')
