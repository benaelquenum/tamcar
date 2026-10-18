"""Génère partie7.html (Scénarios financiers et trésorerie prévisionnelle) — version 6.

Tous les chiffres viennent du classeur TamCar_resultat_complet_v2 (voir modele_v6.py) : flotte de départ de 15 véhicules
(1 tricycle et 5 motos de TamCar, 9 voitures d'Afrik Group Consulting), planchers de recettes, au minimum six voitures de tiers
recrutées du mois 4 au mois 12, taux d'atteinte des planchers de 100 % à 50 %.
Les versions précédentes (cas A et B, dix tricycles) sont dans archives/2026-10-03_plan_affaires_v5.
"""
import pathlib

import modele_v6 as M

ICI = pathlib.Path(__file__).parent
n, sg, mm, pct, taux = M.n, M.sg, M.mm, M.pct, M.taux

def D1(v):
    return f"{v:.1f}".replace('.', ',')

TAUX = M.TAUX
R_BASE = M.res(1.0)              # flotte recrutée (avec les voitures de tiers), planchers atteints
R_BASE_S = M.res(1.0, False)     # flotte de départ seule
R70, R70_S = M.res(0.7), M.res(0.7, False)
R80, R80_S = M.res(0.8), M.res(0.8, False)
SEUIL_S, SEUIL_T = M.seuils('flotte_actuelle'), M.seuils('avec_tiers')
MIN = M.MIN
NT = M.N_ESS_T + M.N_CONF_T
TRI_MENS = M.PRIX_TRICYCLE * (1 - M.ACOMPTE_PCT) / M.MENS_TRICYCLE
PART_JOUR = {                                   # part de TamCar par mois, aux planchers
    'moto': M.VERS_MOTO * M.JOURS,
    'tri': M.VOL_TRI * M.JOURS * M.PART_TRICYCLE,
    'ess': M.PLANCHER_ESS * M.JOURS * M.PART_VOITURE,
    'conf': M.PLANCHER_CONF * M.JOURS * M.PART_VOITURE,
}
MISE_DEPART = (M.ACOMPTE_TRICYCLE + M.MOTOS_COMPTANT + M.annuel(48)[1] + M.annuel(49)[1] + M.annuel(50)[1] + M.annuel(51)[1]
               + M.N_VEHICULES_TAMCAR * M.FRAIS_ENTREE)
NEG_BASE = M.mois_flux_negatifs(1.0)
NEG_BASE_S = M.mois_flux_negatifs(1.0, False)


def tr(*cells, cls=''):
    return f'<tr{" class=" + chr(34) + cls + chr(34) if cls else ""}>' + ''.join(f'<td>{c}</td>' for c in cells) + '</tr>'


def mois_bas(p, tiers):
    s = M.serie_caisse(p, tiers)
    return s.index(min(s))


pages = []

# ------------------------------------------------------------------ 7.1 + 7.2
pages.append(f'''<!-- ============================================================ 07 · p.1 · 7.1 + 7.2 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">07</span><h1>Scénarios financiers et trésorerie prévisionnelle</h1></div>

  <div class="hero" style="margin-top:14px">
    <span class="pill">7.1 · Objet des projections financières</span>
    <div class="cols2" style="margin-top:6px">
      <p style="text-align:left">
        Les projections financières de TamCar chiffrent la capacité du modèle économique à couvrir les charges
        d’exploitation, à financer le démarrage et à dégager une trésorerie suffisante pour le développement de l’entreprise.
      </p>
      <p style="text-align:left">
        Elles reposent sur les <strong>planchers de recettes</strong> : chaque véhicule a un montant minimum de recettes par jour,
        dont le conducteur verse une part fixe à TamCar. Le modèle suppose que ces versements sont <strong>encaissés</strong> ;
        l’analyse fait varier ce taux de 100 % à 50 % et mesure l’effet des véhicules de tiers recrutés.
      </p>
    </div>
  </div>

  <div class="h-serif" style="margin-top:16px">7.2 · Hypothèses retenues</div>
  <p class="intro">Le modèle financier repose sur les principales hypothèses suivantes, qui dépendent de la mise en service des véhicules, du recrutement des conducteurs, du recouvrement des versements et des conditions convenues avec le fournisseur et les propriétaires :</p>

  <table class="tbl txt" style="margin-top:8px">
    <colgroup><col style="width:24%"><col style="width:76%"></colgroup>
    <thead><tr><th>Hypothèse</th><th>Valeur retenue</th></tr></thead>
    <tbody>
      {tr('Flotte de départ', f'<span class="modif">{M.N_VEHICULES_MOIS1} véhicules au mois 1, à Cotonou et dans le Grand Nokoué : <strong>{M.N_TRI} tricycle thermique et {M.N_MOTO} motos électriques</strong> achetés par TamCar, et <strong>{M.N_ESS + M.N_CONF} voitures</strong> ({M.N_ESS} Essentiel, {M.N_CONF} Confort) mises à disposition par Afrik Group Consulting, associé de TamCar (la voiture VIP n’est pas comptée).</span>')}
      {tr('Véhicules de tiers', f'<span class="ajout">Au minimum <strong>{M.N_ESS_T} Essentiel et {M.N_CONF_T} Confort</strong> de propriétaires tiers, recrutés régulièrement du mois 4 au mois 12. Ils ne demandent aucun capital à TamCar.</span>')}
      {tr('Planchers de recettes', f'<span class="modif">Recettes minimales par véhicule et par jour : Essentiel {n(M.PLANCHER_ESS)} F, Confort {n(M.PLANCHER_CONF)} F, tricycle {n(M.VOL_TRI)} F, moto {n(M.VOL_MOTO)} F. Le conducteur verse 60 % : {n(M.VERS_ESS)} F, {n(M.VERS_CONF)} F, {n(M.VERS_TRI)} F et {n(M.VERS_MOTO)} F.</span>')}
      {tr('Part de TamCar', f'<span class="modif"><strong>{pct(100 * M.PART_VOITURE)} du volume</strong> sur les voitures (20 % de plateforme et 5 % : le fonds de rachat est ramené de 10 % à 5 % et ces 5 points reviennent à TamCar), <strong>{pct(100 * M.PART_TRICYCLE)}</strong> sur le tricycle de TamCar (part de propriétaire comprise), versement minimum de <strong>{n(M.VERS_MOTO)} F par jour</strong> sur chaque moto de TamCar. Après la cession : 20 % (commission de plateforme).</span>')}
      {tr('Durée des contrats', '<span class="modif">Voiture Essentiel : 36 mois. Confort : 48 mois (VIP : 60 mois, non compté). Tricycle : 36 mois. Moto : 12 mois. Le véhicule est cédé au conducteur à l’issue du contrat, sans paiement supplémentaire.</span>')}
      {tr('Achat des véhicules de TamCar', f'<span class="modif">Tricycle : {n(M.PRIX_TRICYCLE)} F, avance de 30 % ({n(M.ACOMPTE_TRICYCLE)} F) puis {M.MENS_TRICYCLE} mensualités de {n(TRI_MENS)} F sans intérêt (conditions à confirmer par le fournisseur). Motos : {n(M.PRIX_MOTO)} F l’unité, payées comptant.</span>')}
      {tr('Frais d’entrée', f'<span class="modif">{n(M.FRAIS_ENTREE)} F par véhicule déployé (inspection, habillage, kit du conducteur), à la charge de TamCar : {n(M.N_VEHICULES_MOIS1 * M.FRAIS_ENTREE)} F au mois 1, puis chaque véhicule de tiers. Plus d’avance de démarrage remboursable. Assurance, GPS et entretien des voitures : à la charge de leur propriétaire.</span>')}
      {tr('Horizon, cadence, financement', '36 mois ; 26 jours travaillés par mois ; le mois de lancement et le mois d’arrivée d’un véhicule comptent pour moitié. Levée de 15 000 000 FCFA, encaissée avant le mois 1.')}
      {tr('Charges', f'Investissements de démarrage de {n(M.DEMARRAGE)} FCFA et charges mensuelles détaillés en partie 8 : trackers GPS des véhicules de TamCar, autorisation ANATT (280 000 F aux mois 13 et 25), impôt minimum, patente. Carburant et entretien : à la charge du conducteur.')}
      {tr('TamAssur', '<span class="ajout">Cotisation de 1 000 F par jour prélevée sur le conducteur et reversée à NSIA : sans effet sur la caisse tant que le poste est occupé ; TamCar l’avance pendant la vacance d’un poste (25 % de départs par an, 21 jours). La garantie de 250 000 F par année de cotisation est un engagement de TamCar : son exposition n’est pas dans ces projections.</span>')}
    </tbody>
  </table>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------------ 7.3
def row_s(label, f):
    return tr(label, *[f(p) for p in TAUX])


def vers(p, v):
    return n(v * p)


pages.append(f'''<!-- ============================================================ 07 · p.2 · 7.3 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">07</span><h1>Scénarios financiers et trésorerie prévisionnelle <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">7.3 · Les scénarios : le taux d’atteinte des planchers</div>
  <p class="intro">Le plan retient le niveau auquel les conducteurs versent leurs planchers : 100 % (scénario de base), puis 90, 80, 70, 60 et 50 %. Un taux inférieur à 100 % recouvre les versements en retard ou impayés, les postes vacants et les conducteurs qui ne couvrent pas leur plancher.</p>

  <table class="tbl" style="margin-top:10px">
    <colgroup><col style="width:28%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"></colgroup>
    <thead><tr><th>Indicateur</th><th class="tam">Base · 100 %</th><th>90 %</th><th>80 %</th><th>70 %</th><th>60 %</th><th>50 %</th></tr></thead>
    <tbody>
      {row_s('Versement par jour<small>moto · tricycle</small>', lambda p: f"{vers(p, M.VERS_MOTO)} · {vers(p, M.VERS_TRI)}")}
      {row_s('Versement par jour<small>Essentiel · Confort</small>', lambda p: f"{vers(p, M.VERS_ESS)} · {vers(p, M.VERS_CONF)}")}
      {row_s('Recettes mensuelles de TamCar, année 2<small>flotte de départ</small>', lambda p: n(M.rec_moyenne(p, 2, False)))}
      {row_s('Recettes mensuelles de TamCar, année 2<small>avec six voitures de tiers</small>', lambda p: n(M.rec_moyenne(p, 2, True)))}
      {row_s('Recettes cumulées sur 36 mois<small>flotte de départ · M FCFA</small>', lambda p: mm(M.rec_36(p, False), 1, False))}
      {row_s('Recettes cumulées sur 36 mois<small>avec six voitures de tiers · M FCFA</small>', lambda p: mm(M.rec_36(p, True), 1, False))}
    </tbody>
  </table>

  <div class="row c-3 stretch" style="margin-top:14px">
    <div class="tile">
      <div class="ico">{{{{ico:target}}}}</div>
      <h4>Scénario de base · 100 %</h4>
      <p>Les conducteurs versent leurs planchers. C’est la référence des projections et de l’échéancier de trésorerie présentés dans le business plan.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:alert}}}}</div>
      <h4>Scénario prudent · 80 %</h4>
      <p>Un versement sur cinq manque : retards, postes vacants, conducteurs en difficulté. Il mesure la marge de sécurité face à un encaissement imparfait.</p>
    </div>
    <div class="tile vert">
      <div class="ico">{{{{ico:chart}}}}</div>
      <h4>Stress · 70 % et moins</h4>
      <p>Le seuil de 70 % est celui que la caisse supporte pendant trois ans. Il ne dit pas que l’entreprise est rentable à ce niveau : la partie 7.6 donne les vrais seuils.</p>
    </div>
  </div>

  <div class="callout rouille" style="margin-top:12px">
    Ces montants sont les résultats du modèle, à hypothèses données. Ils ne sont ni des
    revenus garantis ni une promesse de rendement pour les investisseurs.
  </div>

  <div class="callout ajout" style="margin-top:10px">
    <strong>L’hypothèse déterminante est l’encaissement des versements.</strong> Le manque est prélevé chaque nuit sur le portefeuille du
    conducteur, mais ce portefeuille peut devenir négatif. Le risque tient donc moins à l’activité d’un conducteur qu’à la
    <strong>vacance des véhicules</strong> et au <strong>recouvrement</strong> (7.6, 8.8).
  </div>

  <div class="callout ajout" style="margin-top:10px">
    <strong>Ce que comptent les « revenus de TamCar ».</strong> Sa part de plateforme (20 %), le fonds de rachat qui lui revient
    (5 %), la part de propriétaire sur les véhicules qu’elle possède (30 %) et le versement minimum des motos. La part du
    conducteur (40 %), celle des propriétaires de véhicules (30 % et 5 % de fonds de cession) ne sont pas des revenus de TamCar : elle les fait
    circuler, elle ne les garde pas (6.2).
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------------ 7.4
def ligne_veh(nom, qui, plancher, versement, part, capital):
    return tr(f'<strong>{nom}</strong><small>{qui}</small>', n(plancher), n(versement), n(part), capital)


pages.append(f'''<!-- ============================================================ 07 · p.3 · 7.4 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">07</span><h1>Scénarios financiers et trésorerie prévisionnelle <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">7.4 · Investissement dans la flotte et modalités de paiement</div>

  <div class="card" style="margin-top:12px">
    <div class="cols2">
      <p>
        TamCar achète six véhicules : <strong>un tricycle thermique</strong> ({n(M.PRIX_TRICYCLE)} F) et <strong>cinq motos électriques</strong>
        ({n(M.PRIX_MOTO)} F l’unité, soit {n(M.MOTOS_COMPTANT)} F). Le tricycle est payé 30 % à la commande ({n(M.ACOMPTE_TRICYCLE)} F) puis en
        {M.MENS_TRICYCLE} mensualités de {n(TRI_MENS)} F, sans intérêt, conditions à confirmer par le fournisseur ; les motos sont payées comptant.
      </p>
      <p>
        Avec l’assurance, le droit taxi, la visite technique, les trackers GPS et les frais d’entrée, la mise de départ de la flotte propre atteint
        <strong>{n(MISE_DEPART)} F</strong> au mois 1, avant les mensualités du tricycle, soit {pct(100 * MISE_DEPART / M.LEVEE, 0)} de la levée de 15 M.
      </p>
      <p>
        Les voitures n’engagent aucun capital : elles appartiennent à Afrik Group Consulting, qui en assure l’assurance, le tracker GPS et
        l’entretien. Les voitures de tiers recrutées en plus fonctionnent de la même façon. Pour TamCar, chaque véhicule ne coûte que
        {n(M.FRAIS_ENTREE)} F de frais d’entrée.
      </p>
      <p>
        Le montage est le suivant : les véhicules que TamCar possède remboursent leur prix par la part qu’ils lui rapportent. La part du
        tricycle ({n(PART_JOUR['tri'])} F par mois) couvre sa mensualité ({n(TRI_MENS)} F) dès que le conducteur atteint
        {pct(100 * TRI_MENS / PART_JOUR['tri'] * 1.0, 0)} de son plancher.
      </p>
    </div>
  </div>

  <div class="h-serif ajout" style="margin-top:16px">Ce que rapporte chaque véhicule, planchers atteints</div>
  <table class="tbl ajout" style="margin-top:8px">
    <colgroup><col style="width:30%"><col style="width:15%"><col style="width:15%"><col style="width:20%"><col style="width:20%"></colgroup>
    <thead><tr><th>Véhicule</th><th>Plancher de recettes par jour (F)</th><th>Versement du conducteur par jour (F)</th><th>Part de TamCar par mois (F)</th><th>Capital engagé par TamCar</th></tr></thead>
    <tbody>
      {ligne_veh('Moto', 'de TamCar · cédée au bout de 12 mois', M.VOL_MOTO, M.VERS_MOTO, PART_JOUR['moto'], f'{n(M.PRIX_MOTO)} F comptant')}
      {ligne_veh('Tricycle', 'de TamCar · cédé au bout de 36 mois', M.VOL_TRI, M.VERS_TRI, PART_JOUR['tri'], f'{n(M.PRIX_TRICYCLE)} F (30 % + {M.MENS_TRICYCLE} mois)')}
      {ligne_veh('Voiture Essentiel', 'Afrik Group ou tiers · 36 mois', M.PLANCHER_ESS, M.VERS_ESS, PART_JOUR['ess'], f'aucun · {n(M.FRAIS_ENTREE)} F d’entrée')}
      {ligne_veh('Voiture Confort', 'Afrik Group ou tiers · 48 mois', M.PLANCHER_CONF, M.VERS_CONF, PART_JOUR['conf'], f'aucun · {n(M.FRAIS_ENTREE)} F d’entrée')}
    </tbody>
  </table>

  <div class="row c-1-1 stretch ajout" style="margin-top:12px">
    <div class="callout vert">
      <strong>Délai de récupération.</strong> La part d’une moto ({n(PART_JOUR['moto'])} F par mois) rembourse son prix en
      {D1(M.PRIX_MOTO / PART_JOUR['moto'])} mois de versements ; celle du tricycle ({n(PART_JOUR['tri'])} F) le sien en
      {M.PRIX_TRICYCLE / PART_JOUR['tri']:.0f} mois. Une voiture rapporte {n(PART_JOUR['ess'])} F ou {n(PART_JOUR['conf'])} F par mois pour {n(M.FRAIS_ENTREE)} F engagés.
    </div>
    <div class="callout rouille">
      <strong>Après la cession.</strong> TamCar ne garde plus que 20 % du volume : une moto cédée lui rapporte
      {n(M.VOL_MOTO * M.JOURS * 0.2)} F par mois au lieu de {n(PART_JOUR['moto'])} F. L’équilibre du plan ne dépend donc pas des motos, mais des voitures.
    </div>
  </div>

  <div class="h-serif ajout" style="margin-top:16px">La mise de départ de la flotte propre, au mois 1</div>
  <table class="tbl ajout" style="margin-top:8px">
    <colgroup><col style="width:70%"><col style="width:30%"></colgroup>
    <thead><tr><th>Poste</th><th>FCFA</th></tr></thead>
    <tbody>
      {tr('Tricycle : avance de 30 %', n(M.ACOMPTE_TRICYCLE))}
      {tr('Cinq motos : achat comptant', n(M.MOTOS_COMPTANT))}
      {tr('Assurance, droit taxi et visite technique : tricycle et motos, première année', n(M.annuel(48)[1] + M.annuel(49)[1]))}
      {tr('Trackers GPS certifiés ANATT : tricycle et motos', n(M.annuel(50)[1] + M.annuel(51)[1]))}
      {tr('Frais d’entrée des six véhicules de TamCar', n(M.N_VEHICULES_TAMCAR * M.FRAIS_ENTREE))}
      {tr('<strong>Total de la mise de départ</strong>', f'<strong>{n(MISE_DEPART)}</strong>')}
    </tbody>
  </table>
  <div class="callout ajout" style="margin-top:10px">
    Les frais d’entrée des neuf voitures d’Afrik Group ({n(M.N_ESS * M.FRAIS_ENTREE + M.N_CONF * M.FRAIS_ENTREE)} F) s’ajoutent aux charges d’exploitation du mois 1 ; ceux des voitures de tiers, à leur arrivée.
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------------ 7.5
def ligne_tab(label, va, vb, fort=False):
    if fort:
        return tr(f'<strong>{label}</strong>', f'<strong>{va}</strong>', f'<strong>{vb}</strong>')
    return tr(label, va, vb)


def total_36(avec):
    """Agrégats sur 36 mois, planchers atteints, pour la flotte de départ (avec=False) ou la flotte recrutée (avec=True)."""
    s = M.serie(1.0, avec)
    rec = sum(s['rec'][1:])
    ch = sum(s['ch'][1:])
    achats = M.cumul((45,), 36)
    cap = M.DEMARRAGE
    expl = ch - achats                    # charges d'exploitation et de mise en circulation (achats exclus)
    fin = M.LEVEE - cap + rec - ch
    return dict(rec=rec, achats=achats, expl=expl, fin=fin)


T_S, T_T = total_36(False), total_36(True)
POINT_BAS_S = min(M.serie_caisse(1.0, False))
POINT_BAS_T = min(M.serie_caisse(1.0, True))

pages.append(f'''<!-- ============================================================ 07 · p.4 · 7.5 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">07</span><h1>Scénarios financiers et trésorerie prévisionnelle <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">7.5 · Projection de trésorerie sur 36 mois</div>
  <p class="intro">
    Planchers atteints, le modèle chiffre les revenus de TamCar à <strong>{n(T_S['rec'])} FCFA</strong> sur 36 mois pour la flotte de départ et à
    <strong>{n(T_T['rec'])} FCFA</strong> avec les six voitures de tiers. Le tableau reprend les principaux agrégats.
  </p>

  <table class="tbl" style="margin-top:10px">
    <colgroup><col style="width:52%"><col style="width:24%"><col style="width:24%"></colgroup>
    <thead><tr><th>Planchers atteints, sur 36 mois (FCFA)</th><th>Flotte de départ<br>15 véhicules</th><th class="tam">Flotte recrutée<br>+ 6 voitures de tiers</th></tr></thead>
    <tbody>
      {ligne_tab('Levée de fonds (trésorerie de départ)', n(M.LEVEE), n(M.LEVEE))}
      {ligne_tab('Revenus de TamCar (courses et versements)', n(T_S['rec']), n(T_T['rec']))}
      {ligne_tab('Achat des véhicules de TamCar (avance, mensualités, motos)', n(T_S['achats']), n(T_T['achats']))}
      {ligne_tab('Investissements de démarrage', n(M.DEMARRAGE), n(M.DEMARRAGE))}
      {ligne_tab('Charges d’exploitation cumulées', n(T_S['expl']), n(T_T['expl']))}
      {ligne_tab('Trésorerie à 36 mois', sg(T_S['fin']), sg(T_T['fin']), True)}
      {ligne_tab('Point bas de trésorerie', f"{sg(POINT_BAS_S)} (mois {mois_bas(1.0, False)})", f"{sg(POINT_BAS_T)} (mois {mois_bas(1.0, True)})")}
    </tbody>
  </table>

  <div class="h-serif ajout" style="margin-top:16px">Trésorerie cumulée, mois par mois, flotte de départ</div>
  <div class="ajout" style="margin-top:8px; background:#fff; border:1px solid var(--trait); border-radius:18px; padding:10px 12px 4px">
    {{{{chart:tresorerie_sans_tiers}}}}
  </div>

  <div class="card" style="margin-top:12px">
    <p>
      <strong>Le point bas se produit au démarrage.</strong> Planchers atteints, la trésorerie descend à {mm(POINT_BAS_S, 1, False)} FCFA au mois {mois_bas(1.0, False)}, quand TamCar
      règle l’achat des véhicules, les assurances et les trackers, puis remonte : le flux mensuel est positif dès le mois 2, sauf aux mois 13 et 25
      (renouvellement de l’autorisation ANATT, patente, trackers du tricycle), où la rémunération du développeur et les charges annuelles s’additionnent.
      La trésorerie atteint {mm(M.serie_caisse(1.0, False)[12], 1, False)} au mois 12, {mm(M.serie_caisse(1.0, False)[24], 1, False)} au mois 24 et {mm(M.serie_caisse(1.0, False)[36], 1, False)} au mois 36.
    </p>
    <p>
      Chaque poste a son périmètre exact : les revenus des véhicules, les remboursements du financement, les charges d’exploitation et
      les sommes qui reviennent aux propriétaires et aux conducteurs sont suivis séparément. Le modèle recalcule ces indicateurs dès que le montant du
      financement, les salaires, les loyers ou les autres charges évoluent.
    </p>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')


# ------------------------------------------------------------------ 7.5 (fin) + 7.6
def ligne_cat(nom, sous, cle):
    v = M.cat_total(cle)
    return tr(nom, n(v), pct(100 * v / M.CHARGES_36, 1))


def res_ligne(p):
    a, b = M.res(p, False), M.res(p, True)
    return tr(f'<strong>{taux(p)}</strong>',
              mm(a['point_bas']), mm(a['caisse_fin'][2]), mm(a['ebe'][1]), mm(a['net'][1]),
              mm(b['point_bas']), mm(b['caisse_fin'][2]), mm(b['ebe'][1]), mm(b['net'][1]))


pages.append(f'''<!-- ============================================================ 07 · p.5 · 7.5 (fin) + 7.6 -->
<section class="page dense" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">07</span><h1>Scénarios financiers et trésorerie prévisionnelle <small>(suite)</small></h1></div>

  <div class="h-serif ajout" style="margin-top:14px">Où vont les charges d’exploitation</div>
  <p class="intro ajout-in">Planchers atteints, 36 mois : {n(M.CHARGES_36)} FCFA, hors investissements de démarrage et achat des véhicules. La flotte recrutée y ajoute les frais d’entrée et la part du responsable des opérations (3 % du volume).</p>
  <table class="tbl ajout" style="margin-top:8px">
    <colgroup><col style="width:56%"><col style="width:24%"><col style="width:20%"></colgroup>
    <thead><tr><th>Poste, flotte recrutée</th><th>FCFA sur 36 mois</th><th>Part</th></tr></thead>
    <tbody>
      {ligne_cat(*M.CATS['equipe'][:2], 'equipe')}
      {ligne_cat(*M.CATS['locaux'][:2], 'locaux')}
      {ligne_cat(*M.CATS['assur'][:2], 'assur')}
      {ligne_cat(*M.CATS['presta'][:2], 'presta')}
      {ligne_cat(*M.CATS['entree'][:2], 'entree')}
      {ligne_cat(*M.CATS['nsia'][:2], 'nsia')}
      {ligne_cat(*M.CATS['tracker'][:2], 'tracker')}
      {ligne_cat(*M.CATS['anatt'][:2], 'anatt')}
      {ligne_cat(*M.CATS['impots'][:2], 'impots')}
    </tbody>
  </table>
  <div class="callout ajout" style="margin-top:10px">
    <strong>Lecture.</strong> L’équipe représente plus de la moitié des charges. Ce qui permet de rester
    excédentaire, c’est ce que le plan ne budgète pas : ni publicité payante, ni marketing de rue, ni radio,
    ni parrainage, ni community manager, ni entretien des véhicules (à la charge du conducteur).
  </div>

  <div class="h-serif" style="margin-top:18px">7.6 · Résistance du modèle : quand les planchers ne sont pas tous versés</div>
  <p class="intro">Les mêmes projections, au taux d’atteinte indiqué. « Flotte de départ » : 15 véhicules ; « flotte recrutée » : avec les six voitures de tiers. Montants en millions de FCFA.</p>

  <table class="tbl ajout" style="margin-top:8px">
    <colgroup><col style="width:12%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:11%"></colgroup>
    <thead>
      <tr><th rowspan="2">Taux</th><th colspan="4">Flotte de départ</th><th colspan="4" class="tam">Flotte recrutée</th></tr>
      <tr><th>Point bas de la caisse</th><th>Caisse au mois 36</th><th>Excédent brut, an 2</th><th>Résultat net, an 2</th><th>Point bas de la caisse</th><th>Caisse au mois 36</th><th>Excédent brut, an 2</th><th>Résultat net, an 2</th></tr>
    </thead>
    <tbody>
      {''.join(res_ligne(p) for p in TAUX)}
    </tbody>
  </table>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

pages.append(f'''<!-- ============================================================ 07 · p.5b · 7.6 (suite) -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">07</span><h1>Scénarios financiers et trésorerie prévisionnelle <small>(suite)</small></h1></div>

  <div class="h-serif ajout" style="margin-top:14px">7.6 · Résistance du modèle (suite) : la trésorerie avec les voitures de tiers</div>
  <div class="ajout" style="margin-top:8px; background:#fff; border:1px solid var(--trait); border-radius:18px; padding:10px 12px 4px">
    {{{{chart:tresorerie}}}}
  </div>
  <p class="src ajout">Flotte recrutée (avec les six voitures de tiers) : planchers atteints, puis 80 %, 70 % et 60 %. La trésorerie reste positive à chaque niveau jusqu’à 60 % ; elle finit au-dessus de son niveau après le démarrage (10,5 M) à 100, 80 et 70 %.</p>

  <div class="row c-1-1 stretch ajout" style="margin-top:12px">
    <div class="callout rouille">
      <strong>Flotte de départ.</strong> L’excédent d’exploitation devient positif à partir de <strong>{pct(100 * SEUIL_S['ebe'], 0)}</strong> des planchers, le résultat
      net à partir de {pct(100 * SEUIL_S['net'], 0)}, et la caisse reste positive pendant 36 mois jusqu’à {pct(100 * SEUIL_S['caisse'], 0)}. À 70 %, la caisse tient
      ({mm(R70_S['caisse_fin'][2], 1, False)} au mois 36), mais l’entreprise consomme environ {mm(abs(R70_S['ebe'][1]), 1, False)} par an de la levée.
    </div>
    <div class="callout vert">
      <strong>Flotte recrutée.</strong> Avec les six voitures de tiers, l’excédent d’exploitation est positif dès <strong>{pct(100 * SEUIL_T['ebe'], 0)}</strong> des planchers, le résultat
      net dès {pct(100 * SEUIL_T['net'], 0)} et la caisse reste positive jusqu’à {pct(100 * SEUIL_T['caisse'], 0)}. À 70 %, l’excédent d’exploitation
      de l’année 2 est de {mm(R70['ebe'][1], 1, False)}.
    </div>
  </div>

  <div class="card" style="margin-top:12px">
    <p>
      <strong>Ce que montrent ces scénarios.</strong> La caisse tient presque à tous les niveaux, parce que la levée de 15 M couvre les écarts :
      la mesure de la santé de l’entreprise est donc l’<strong>excédent d’exploitation</strong>, qui indique si les versements couvrent les charges
      sans consommer la levée. Il se redresse nettement avec les voitures de tiers, et la partie 8.8 en fait le seuil de pilotage.
    </p>
    <p>
      Le suivi financier compare chaque mois les versements encaissés aux versements dus, les charges réalisées aux budgets, et les recrutements de
      véhicules aux objectifs ; il déclenche un plan correctif si le taux d’encaissement passe sous les seuils d’alerte (8.8).
    </p>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------------ récapitulatif : le choix
NB_MIN70 = {g: MIN[f'{g}@70'] for g in ('moto', 'tri', 'ess', 'conf')}
NB_MIN80 = {g: MIN[f'{g}@80'] for g in ('moto', 'tri', 'ess', 'conf')}
NB_MIN90 = {g: MIN[f'{g}@90'] for g in ('moto', 'tri', 'ess', 'conf')}
NB_MIN100 = {g: MIN[f'{g}@100'] for g in ('moto', 'tri', 'ess', 'conf')}


def ligne_min(p, d):
    return tr(f'<strong>{p}</strong>', d['moto'], d['tri'], d['ess'], d['conf'])


pages.append(f'''<!-- ============================================================ 07 · récapitulatif : la flotte retenue -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">07</span><h1>Scénarios financiers et trésorerie prévisionnelle <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">Le choix : la flotte de départ et au moins six voitures de tiers</div>

  <div class="hero" style="margin-top:12px; padding:18px 24px 16px">
    <span class="pill">Récapitulatif · ce que changent les voitures de tiers</span>
    <h2 style="font-size:21px">Un excédent d’exploitation, <em>même quand les planchers ne sont versés qu’à 70 %.</em></h2>
    <div class="cols2" style="margin-top:6px">
      <p style="text-align:left">
        La flotte de départ, avec les voitures d’Afrik Group, laisse la trésorerie positive trois ans mais dépend de l’encaissement des planchers.
        Recruter <strong>trois Essentiel et trois Confort de plus</strong>, sans capital, porte l’excédent d’exploitation de
        <strong>{mm(R_BASE_S['ebe'][1], 1, False)}</strong> à <strong>{mm(R_BASE['ebe'][1], 1, False)}</strong> par an (année 2).
      </p>
      <p style="text-align:left">
        C’est le levier le plus efficace du plan : une voiture rapporte {n(PART_JOUR['ess'])} F à {n(PART_JOUR['conf'])} F par mois à TamCar, pour {n(M.FRAIS_ENTREE)} F d’entrée.
        Le plan fixe donc un objectif de recrutement : <strong>au minimum six voitures de tiers entre le mois 4 et le mois 12</strong>.
      </p>
    </div>
  </div>

  <table class="tbl" style="margin-top:12px">
    <colgroup><col style="width:40%"><col style="width:22%"><col style="width:22%"><col style="width:16%"></colgroup>
    <thead><tr><th>Planchers atteints, 36 mois</th><th>Flotte de départ</th><th class="tam">Flotte recrutée</th><th>Écart</th></tr></thead>
    <tbody>
      {tr('Véhicules en service au mois 12', M.N_VEHICULES_MOIS1, M.N_VEHICULES_MOIS1 + NT, '+' + str(NT))}
      {tr('Revenus de TamCar (FCFA)', n(T_S['rec']), n(T_T['rec']), sg(T_T['rec'] - T_S['rec']))}
      {tr('Excédent d’exploitation, année 2 (FCFA)', n(R_BASE_S['ebe'][1]), n(R_BASE['ebe'][1]), sg(R_BASE['ebe'][1] - R_BASE_S['ebe'][1]))}
      {tr('<strong>Trésorerie à 36 mois (FCFA)</strong>', '<strong>' + sg(T_S['fin']) + '</strong>', '<strong>' + sg(T_T['fin']) + '</strong>', '<strong>' + sg(T_T['fin'] - T_S['fin']) + '</strong>')}
      {tr('Excédent d’exploitation, année 2, à 70 % des planchers (FCFA)', n(R70_S['ebe'][1]), n(R70['ebe'][1]), sg(R70['ebe'][1] - R70_S['ebe'][1]))}
      {tr('Taux d’atteinte pour un excédent d’exploitation positif', pct(100 * SEUIL_S['ebe'], 0), pct(100 * SEUIL_T['ebe'], 0), '−' + str(round(100 * (SEUIL_S['ebe'] - SEUIL_T['ebe']))) + ' points')}
      {tr('Taux d’atteinte pour un résultat net positif', pct(100 * SEUIL_S['net'], 0), pct(100 * SEUIL_T['net'], 0), '−' + str(round(100 * (SEUIL_S['net'] - SEUIL_T['net']))) + ' points')}
    </tbody>
  </table>

  <div class="h-serif ajout" style="margin-top:14px">Combien de véhicules de tiers pour un excédent et une trésorerie positifs chaque mois ?</div>
  <p class="intro ajout-in">Nombre minimal de véhicules d’un seul type, arrivés régulièrement du mois 4 au mois 12, pour que l’excédent d’exploitation et le flux de caisse restent positifs chaque mois à partir du mois 13 (les charges annuelles étant mises en réserve chaque mois). Sans économie sur les charges.</p>
  <table class="tbl ajout" style="margin-top:6px">
    <colgroup><col style="width:28%"><col style="width:18%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup>
    <thead><tr><th>Taux d’atteinte des planchers</th><th>Motos</th><th>Tricycles</th><th>Voitures Essentiel</th><th>Voitures Confort</th></tr></thead>
    <tbody>
      {ligne_min('100 %', NB_MIN100)}
      {ligne_min('90 %', NB_MIN90)}
      {ligne_min('80 %', NB_MIN80)}
      {ligne_min('70 %', NB_MIN70)}
    </tbody>
  </table>
  <div class="row c-1-1 stretch ajout" style="margin-top:10px">
    <div class="callout vert">
      <strong>Pourquoi des voitures.</strong> À 70 %, il faut {NB_MIN70['ess']} Essentiel ou {NB_MIN70['conf']} Confort, contre {NB_MIN70['tri']} tricycles ou
      {NB_MIN70['moto']} motos : une moto de tiers rapporte {n(M.VALEUR['moto@70'])} F par mois à ce niveau, un Confort {n(M.VALEUR['conf@70'])} F.
    </div>
    <div class="callout rouille">
      <strong>Le risque est borné.</strong> Un véhicule de tiers qui ne roule pas coûte {n(M.FRAIS_ENTREE)} F d’entrée. Si le recrutement
      échoue, le plan retombe sur la flotte de départ : trésorerie positive, mais sans marge sous {pct(100 * SEUIL_S['ebe'], 0)} des planchers.
    </div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------------ 7.7 + 7.8
COM_MOTOS_CEDEES = M.VOL_MOTO * M.JOURS * 0.2 * M.N_MOTO

pages.append(f'''<!-- ============================================================ 07 · p.6 · 7.7 + 7.8 -->
<section class="page dense" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">07</span><h1>Scénarios financiers et trésorerie prévisionnelle <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">7.7 · Situation à l’issue des 36 mois</div>

  <div class="card" style="margin-top:12px">
    <div class="cols2">
      <p>
        À l’issue de la période prévue, les <strong>véhicules de TamCar sont intégralement financés</strong> et les
        conducteurs en deviennent propriétaires conformément aux contrats de cession.
        <span class="modif">Les motos sont cédées au mois 13, après 12 mois ; le tricycle après 36 mois, au mois 37 ; les voitures après 36 mois
        (Essentiel) ou 48 mois (Confort) de contrat.</span>
      </p>
      <p>
        Le modèle prévoit alors la poursuite de leur activité sur la plateforme TamCar, avec
        maintien de la commission applicable aux courses. <span class="modif">Les 5 motos cédées continuent de lui rapporter environ
        {n(COM_MOTOS_CEDEES)} FCFA par mois (20 % de leur volume) ; après la cession d’une voiture, TamCar garde 20 % du volume au lieu de 25 %.</span>
      </p>
      <p>
        Cette étape est importante pour la stratégie de développement : elle permet à TamCar
        de conserver une activité de mise en relation et de perception de commissions sans devoir
        financer de nouveau les mêmes véhicules.
      </p>
      <p>
        Le lancement d’un second cycle de flotte, à moyen terme, est décidé sur les résultats
        obtenus, la trésorerie disponible et la capacité de l’entreprise à financer cette
        expansion sans fragiliser son exploitation courante.
      </p>
    </div>
  </div>

  <div class="h-serif" style="margin-top:20px">7.8 · Conclusion financière</div>

  <div class="hero" style="margin-top:12px; padding:22px 26px">
    <span class="pill">Conclusion</span>
    <div class="cols2" style="margin-top:8px">
      <p style="text-align:left">
        Les projections présentent un modèle dans lequel les <strong>versements minimums des conducteurs</strong> couvrent les charges
        d’exploitation et financent le développement de la plateforme. Planchers atteints, le modèle prévoit des revenus cumulés de
        <span class="modif">{mm(T_S['rec'], 1, False)} FCFA pour la flotte de départ et {mm(T_T['rec'], 1, False)} FCFA avec les six voitures de tiers</span> sur 36 mois,
        et une trésorerie à 36 mois de <span class="modif">{mm(T_S['fin'], 1, False)} FCFA et {mm(T_T['fin'], 1, False)} FCFA</span>. La trésorerie ne passe jamais sous
        zéro et le point bas ({mm(POINT_BAS_T, 1, False)} FCFA) se situe au démarrage.
      </p>
      <p style="text-align:left">
        Le niveau d’encaissement décide du reste : l’excédent d’exploitation de la flotte de départ suppose
        <strong>{pct(100 * SEUIL_S['ebe'], 0)} des planchers</strong>, celui de la flotte recrutée {pct(100 * SEUIL_T['ebe'], 0)}.
        La réalisation de ces objectifs repose sur l’encaissement des versements, la vacance des véhicules, le recrutement des voitures de
        tiers et la maîtrise des charges : les scénarios sont les outils de pilotage de ces points.
      </p>
      <p style="text-align:left">
        Le financement recherché de 15 000 000 FCFA couvre le besoin initial (investissements de démarrage et achat des
        véhicules de TamCar, 7.9) ; tous les postes de charges sont intégrés au modèle, et les hypothèses de cession des véhicules sont
        celles de la partie 6.
      </p>
    </div>
  </div>

  <div class="rule-label ajout" style="margin-top:16px">Ce que le plan suppose, et sa marge de sécurité</div>
  <div class="row c-3 stretch ajout" style="margin-top:10px">
    <div class="tile vert">
      <div class="ico">{{{{ico:check}}}}</div>
      <h4>Quatre réglages</h4>
      <p>Responsable des opérations payé à 3 % du volume ; ni publicité payante, ni marketing de rue, radio ou parrainage ; développeur rémunéré dès le mois 13 ; aucune économie supplémentaire supposée.</p>
    </div>
    <div class="tile">
      <div class="ico">{{{{ico:target}}}}</div>
      <h4>Marge de sécurité</h4>
      <p>Flotte de départ : excédent d’exploitation positif dès {pct(100 * SEUIL_S['ebe'], 0)} des planchers, trésorerie positive dès {pct(100 * SEUIL_S['caisse'], 0)}. Flotte recrutée : {pct(100 * SEUIL_T['ebe'], 0)} et {pct(100 * SEUIL_T['caisse'], 0)}.</p>
    </div>
    <div class="tile or">
      <div class="ico">{{{{ico:users}}}}</div>
      <h4>Recruter, encaisser</h4>
      <p>Les deux leviers du plan : six voitures de tiers au minimum, et l’encaissement des versements, suivi par un taux d’encaissement (8.8).</p>
    </div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------------ 7.9
HD = M.HD


def hd(cle, champ, f=lambda v: v):
    return f(HD[cle][champ])


def hd_bas(cle):
    r = HD[cle]
    return f"{mm(r['point_bas'])}<small>mois {r['mois_point_bas']}</small>"


NEG = lambda cle: HD[cle]['mois_negatifs']

pages.append(f'''<!-- ============================================================ 07 · p.7 · 7.9 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">07</span><h1>Scénarios financiers et trésorerie prévisionnelle <small>(suite)</small></h1></div>

  <div class="h-serif ajout" style="margin-top:14px">7.9 · Si la levée est de 10 M ou de 5 M FCFA, ou si les voitures ne viennent pas</div>
  <p class="intro ajout-in">Le plan prévoit une seule levée, de 15 M FCFA. Voici ce qui se passe si les fonds reçus sont inférieurs, et si les voitures d’Afrik Group ne rejoignent pas la flotte. Planchers atteints, flotte recrutée sauf mention.</p>

  <table class="tbl ajout" style="margin-top:8px">
    <colgroup><col style="width:30%"><col style="width:17.5%"><col style="width:17.5%"><col style="width:17.5%"><col style="width:17.5%"></colgroup>
    <thead><tr><th></th><th>15 M · plan</th><th>10 M</th><th>5 M</th><th>Sans voiture</th></tr></thead>
    <tbody>
      {tr('<strong>Flotte achetée par TamCar</strong>', '1 tricycle et 5 motos', '1 tricycle et 5 motos', 'Aucun véhicule', '1 tricycle et 5 motos')}
      {tr('<strong>Voitures</strong>', f'{M.N_ESS + M.N_CONF} d’Afrik Group et {NT} de tiers', f'{M.N_ESS + M.N_CONF} d’Afrik Group et {NT} de tiers', f'{M.N_ESS + M.N_CONF} d’Afrik Group et {NT} de tiers', 'Aucune')}
      {tr('Point bas de trésorerie', f"{mm(POINT_BAS_T)}<small>mois {mois_bas(1.0, True)}</small>", hd_bas('levee_10M'), hd_bas('levee_5M_sans_vehicule'), hd_bas('sans_voitures'))}
      {tr('Mois de trésorerie négative', sum(1 for v in M.serie_caisse(1.0, True) if v < 0), NEG('levee_10M'), NEG('levee_5M_sans_vehicule'), NEG('sans_voitures'))}
      {tr('<strong>Trésorerie au mois 36</strong>', mm(R_BASE['caisse_fin'][2]), mm(HD['levee_10M']['caisse_fin'][2]), mm(HD['levee_5M_sans_vehicule']['caisse_fin'][2]), mm(HD['sans_voitures']['caisse_fin'][2]))}
      {tr('Excédent d’exploitation, année 2', mm(R_BASE['ebe'][1]), mm(HD['levee_10M']['ebe'][1]), mm(HD['levee_5M_sans_vehicule']['ebe'][1]), mm(HD['sans_voitures']['ebe'][1]))}
    </tbody>
  </table>

  <div class="row c-1-1 stretch" style="margin-top:12px">
    <div class="callout vert ajout">
      <strong>Avec 10 M FCFA.</strong> Le plan tient sans changement : le point bas est de {mm(HD['levee_10M']['point_bas'], 1, False)} au mois
      {HD['levee_10M']['mois_point_bas']}, aucun mois n’est négatif. La marge qui permet d’absorber un encaissement imparfait est toutefois
      plus mince : elle se mesure aux 5 M de moins disponibles.
    </div>
    <div class="callout rouille ajout">
      <strong>Avec 5 M FCFA.</strong> Les investissements de démarrage ({mm(M.DEMARRAGE, 2, False)}) absorbent presque tout : TamCar n’achète aucun véhicule et
      démarre avec les voitures. La trésorerie touche zéro au mois 1 ({mm(HD['levee_5M_sans_vehicule']['point_bas'])}), puis remonte ; elle suppose un
      léger décalage des premières dépenses.
    </div>
  </div>
  <div class="callout ajout" style="margin-top:10px">
    <strong>Si les voitures ne rejoignent pas la flotte.</strong> Le tricycle et les cinq motos seuls ne couvrent pas les charges :
    la trésorerie devient négative au mois {HD['sans_voitures']['premier_mois_negatif']} et atteint {mm(HD['sans_voitures']['point_bas'])} au mois
    {HD['sans_voitures']['mois_point_bas']}. Les voitures d’Afrik Group sont la condition du plan : leur mise à disposition est formalisée dans le contrat partenaire.
    Avec les seules {NT} voitures de tiers (sans Afrik Group), la trésorerie reste positive (point bas de {mm(HD['sans_voitures_afrik']['point_bas'], 1, False)}) mais
    l’excédent d’exploitation est négatif ({mm(HD['sans_voitures_afrik']['ebe'][1])} en année 2).
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

(ICI / 'partie7.html').write_text('\n'.join(pages), encoding='utf-8')
print('partie7.html :', len(pages), 'pages')
