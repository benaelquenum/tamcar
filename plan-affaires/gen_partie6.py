"""Génère partie6.html (Modèle économique et sources de revenus) — version 6 : planchers, versements, fonds de rachat ramené à 5 %,
part de TamCar de 25 %, véhicules de tiers. Chiffres lus dans le classeur v2 (modele_v6).
La version 5 (répartition 40/10/30/20, cas A et B) est dans archives/2026-10-03_plan_affaires_v5.
"""
import pathlib

import modele_v6 as M

ICI = pathlib.Path(__file__).parent
n, pct = M.n, M.pct

def D1(v):
    return f"{v:.1f}".replace('.', ',')

PART = M.PART_NETTE_MENS            # part de TamCar par mois, aux planchers, nette de la cotisation TamAssur
TRI_MENS = M.PRIX_TRICYCLE * (1 - M.ACOMPTE_PCT) / M.MENS_TRICYCLE
COTIS = M.COTIS
OBJ = {'moto': M.OBJ_MOTO, 'tri': M.OBJ_TRI, 'ess': M.OBJ_ESS, 'conf': M.OBJ_CONF}
NT = M.N_ESS_T + M.N_CONF_T
PRIX_FLOTTE = M.PRIX_TRICYCLE + M.N_MOTO * M.PRIX_MOTO

pages = []

# ------------------------------------------------------------------ 6.1
pages.append(f'''<!-- ============================================================ 06 · p.1 · 6.1 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">06</span><h1>Modèle économique et sources de revenus</h1></div>

  <div class="hero" style="margin-top:14px">
    <span class="pill">6.1 · Principes généraux du modèle économique</span>
    <div class="cols2" style="margin-top:6px">
      <p style="text-align:left">
        TamCar repose sur un modèle économique combinant <strong>l’intermédiation numérique, la
        perception de commissions sur les courses et l’exploitation d’une flotte de
        véhicules</strong>, la sienne et celle de propriétaires partenaires. La plateforme met en relation les passagers et les
        chauffeurs, organise les réservations, sécurise le suivi des trajets et assure la répartition des revenus générés.
      </p>
      <p style="text-align:left">
        Le modèle se distingue par une logique de <strong>prix fixe annoncé avant la course</strong>, par un
        <strong>versement minimum quotidien</strong> de chaque conducteur sous contrat (le plancher) et par la
        <strong>cession du véhicule au conducteur</strong> à l’issue du contrat, sans paiement supplémentaire : l’activité quotidienne de transport
        conduit à l’<strong>accession à la propriété</strong>.
      </p>
    </div>
  </div>

  <div class="callout" style="margin-top:12px">
    Les revenus de TamCar dépendent de trois leviers : les versements planchers des conducteurs, le nombre de véhicules en service
    (le sien et ceux des propriétaires partenaires) et le volume de courses réalisé au-dessus des planchers.
  </div>

  <div class="rule-label ajout" style="margin-top:18px">Les sources de revenus de TamCar, en clair</div>

  <div class="row c-1-1 stretch ajout" style="margin-top:10px">
    <div class="tile">
      <div class="ico">{{{{ico:coins}}}}</div>
      <h4>1 · Sa part de chaque course</h4>
      <p>25 % du prix payé par le client sur les véhicules de propriétaires partenaires : 20 % de plateforme et 5 % de gestion du véhicule. C’est la source de base.</p>
    </div>
    <div class="tile or">
      <div class="ico">{{{{ico:car}}}}</div>
      <h4>2 · La part propriétaire, sur sa flotte</h4>
      <p>30 % du prix de plus, sur les véhicules que TamCar possède (1 tricycle et 5 motos). Cette part sert d’abord à rembourser l’achat des véhicules.</p>
    </div>
  </div>
  <div class="row c-1-1 stretch ajout">
    <div class="tile violet">
      <div class="ico">{{{{ico:wallet}}}}</div>
      <h4>3 · Le versement minimum</h4>
      <p>Chaque jour, le conducteur doit atteindre son objectif (60 % du plancher, cotisation TamAssur comprise) : à défaut, la différence est prélevée sur son portefeuille. Une moto de TamCar rapporte au moins {n(M.VERS_MOTO)} F nets par jour.</p>
    </div>
    <div class="tile vert">
      <div class="ico">{{{{ico:calendar}}}}</div>
      <h4>4 · Les services complémentaires</h4>
      <p>TamPass et d’autres services : des revenus additionnels, qui s’ajoutent à la base et ne figurent pas dans le plan de trésorerie (6.5).</p>
    </div>
  </div>

  <div class="callout rouille ajout" style="margin-top:12px">
    <strong>Ce qui n’est pas un revenu de TamCar.</strong> La part du chauffeur (40 % ou 80 % du prix) et la part des propriétaires partenaires
    (30 %, plus 5 % de fonds de cession versé à la cession du véhicule). TamCar les fait circuler, elle ne les garde pas.
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------------ 6.2
pages.append(f'''<!-- ============================================================ 06 · p.2 · 6.2 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">06</span><h1>Modèle économique et sources de revenus <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">6.2 · Répartition des recettes générées par les courses</div>
  <p class="intro">
    Le modèle répartit le montant total payé par le client entre les acteurs de la course.
  </p>

  <table class="tbl txt" style="margin-top:10px">
    <colgroup><col style="width:26%"><col style="width:12%"><col style="width:62%"></colgroup>
    <thead><tr><th>Bénéficiaire</th><th style="text-align:right">Part prévue</th><th>Finalité</th></tr></thead>
    <tbody>
      <tr><td>Chauffeur</td><td style="text-align:right"><strong>40 %</strong></td><td>Rémunération de son activité</td></tr>
      <tr><td>Propriétaire du véhicule</td><td style="text-align:right"><strong>30 %</strong></td><td>Rémunération liée à la mise à disposition du véhicule</td></tr>
      <tr><td>Fonds de cession</td><td style="text-align:right"><strong>5 %</strong></td><td>Versé au propriétaire à la cession du véhicule au chauffeur, en complément de sa part (30 % + 5 % = 35 %)</td></tr>
      <tr><td>TamCar</td><td style="text-align:right"><strong>25 %</strong></td><td>20 % de plateforme, plus 5 % pour la gestion et le fonctionnement du véhicule (le fonds de rachat, ramené de 10 % à 5 %, laisse ces 5 points à TamCar)</td></tr>
    </tbody>
  </table>

  <div class="card" style="margin-top:12px">
    <div class="cols2">
      <p>
        Cette clé de répartition constitue le principe de référence du modèle. Elle est
        intégrée aux règles de calcul de la plateforme et présentée de manière compréhensible
        aux chauffeurs et aux partenaires.
      </p>
      <p>
        <span class="modif">Le conducteur d’un véhicule sous contrat doit chaque jour atteindre un objectif égal à 60 % d’un montant de recettes minimal, le <strong>plancher</strong>
        du véhicule</span> : cela correspond à la part du propriétaire, du fonds de cession et de TamCar (30 + 5 + 25). Les 40 % restants sont à lui. La cotisation TamAssur est comprise dans cet objectif. Plus
        il réalise de courses dans l’application, plus la part de TamCar augmente ; le plancher garantit le minimum.
      </p>
    </div>
  </div>

  <div class="h-serif ajout" style="margin-top:20px">Sur 1 000 F payés par le client : deux cas</div>

  <div class="ajout">
    <div class="bar-label">Le chauffeur conduit un véhicule qui ne lui appartient pas <small>(propriétaire partenaire ou flotte TamCar)</small></div>
    <div class="bar4">
      <div class="c1" style="width:40%">Chauffeur 400 F</div>
      <div class="c3" style="width:30%">Propriétaire 300 F</div>
      <div class="c2" style="width:5%"></div>
      <div class="c4" style="width:25%">TamCar 250 F</div>
    </div>
    <div class="src">Les 50 F de fonds de cession (barre orange) sont versés au propriétaire à la cession du véhicule.</div>

    <div class="bar-label" style="margin-top:16px">Le chauffeur conduit son propre véhicule</div>
    <div class="bar4">
      <div class="c1" style="width:80%">Chauffeur 800 F</div>
      <div class="c4" style="width:20%">TamCar 200 F</div>
    </div>
  </div>

  <div class="row c-1-1 stretch ajout" style="margin-top:14px">
    <div class="callout">
      <strong>Dans le premier cas,</strong> le conducteur paie lui-même son carburant sur ses 400 F. À la fin du contrat (36 mois pour une voiture
      Essentiel, 48 pour un Confort, 36 pour un tricycle, 12 pour une moto), le véhicule lui revient <strong>sans paiement supplémentaire</strong>.
    </div>
    <div class="callout vert">
      <strong>Dans le second cas,</strong> il n’y a ni propriétaire à rémunérer, ni fonds de
      cession : le chauffeur garde 80 % du prix et TamCar 20 %.
    </div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------------ 6.2 (fin) + 6.3
pages.append(f'''<!-- ============================================================ 06 · p.3 · 6.2 (fin) + 6.3 -->
<section class="page dense" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">06</span><h1>Modèle économique et sources de revenus <small>(suite)</small></h1></div>

  <div class="h-serif ajout" style="margin-top:14px">Ce qui revient à TamCar, pour 1 000 F payés</div>
  <p class="intro ajout-in">La part de TamCar dépend de qui possède le véhicule. Montants en FCFA.</p>

  <table class="tbl ajout" style="margin-top:8px">
    <colgroup><col style="width:34%"><col style="width:22%"><col style="width:22%"><col style="width:22%"></colgroup>
    <thead>
      <tr><th>Poste de TamCar</th><th>Véhicule d’un propriétaire partenaire</th><th class="tam">Véhicule de la flotte TamCar</th><th>Véhicule du chauffeur</th></tr>
    </thead>
    <tbody>
      <tr><td>Part de la plateforme</td><td>200</td><td class="tam">200</td><td>200</td></tr>
      <tr><td>Part de gestion du véhicule (5 %)</td><td>50</td><td class="tam">50</td><td>0</td></tr>
      <tr><td>Part propriétaire</td><td>0<small>revient au propriétaire</small></td><td class="tam">300</td><td>0</td></tr>
      <tr><td><strong>Total pour TamCar</strong></td><td><strong>250</strong></td><td class="tam"><strong>550</strong></td><td><strong>200</strong></td></tr>
      <tr><td>Aux planchers, par mois, nets de la cotisation TamAssur<small>Essentiel · Confort · tricycle · moto</small></td><td>{n(PART['ess'])} · {n(PART['conf'])}</td><td class="tam">{n(PART['tri'])} · {n(PART['moto'])}</td><td>20 % du volume</td></tr>
    </tbody>
  </table>
  <div class="src ajout-in">
    Plancher de recettes par jour : Essentiel {n(M.PLANCHER_ESS)} F, Confort {n(M.PLANCHER_CONF)} F, tricycle {n(M.VOL_TRI)} F, moto {n(M.VOL_MOTO)} F, 26 jours par mois. Sur les motos de TamCar, l’objectif
    ({n(M.OBJ_MOTO)} F par jour, dont {n(M.COTIS)} F de TamAssur) est encaissé en entier. La cotisation TamAssur ({n(M.COTIS)} F par jour et par véhicule sous contrat) est financée par la part de TamCar : elle est déduite des montants ci-dessus. Après la cession, TamCar ne garde que 20 %.
  </div>

  <div class="h-serif" style="margin-top:16px">6.3 · Première source de revenus : les commissions et les versements</div>

  <div class="card" style="margin-top:10px">
    <div class="cols2">
      <p>
        La première source de revenus de TamCar est constituée par sa part sur les courses
        réalisées au moyen de la plateforme.
      </p>
      <p>
        Le montant de ces revenus évolue en fonction du volume total de courses effectivement
        réalisées, selon la clé de répartition et l’encaissement effectif des sommes dues.
      </p>
      <p>
        <span class="modif">Pour les conducteurs sous contrat, la part de TamCar est garantie par un <strong>objectif quotidien</strong>.</span>
        À minuit, si la part de TamCar sur les courses du jour, augmentée des versements reçus hors application (espèces, Mobile Money),
        est inférieure à l’objectif, <strong>la différence est prélevée sur le portefeuille du conducteur</strong>, même si son solde devient
        négatif. Aucun versement n’est dû le dimanche ; un jour non travaillé (panne, maladie) est déclaré, rien n’est prélevé et le contrat est prolongé d’autant.
      </p>
      <p>
        Pour les courses réglées en espèces, le recouvrement repose sur le portefeuille du conducteur et le mécanisme de recharge par Mobile Money. Le modèle prévoit
        une <strong>tolérance de découvert de 5 000 FCFA</strong> ; au-delà, la mise en ligne est refusée jusqu’à la recharge, et une dette prolongée suspend le compte.
      </p>
    </div>
  </div>

  <table class="tbl ajout" style="margin-top:10px">
    <colgroup><col style="width:28%"><col style="width:18%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup>
    <thead><tr><th>Objectif quotidien, par véhicule</th><th>Versement</th><th>Cotisation TamAssur</th><th>Objectif du jour</th><th>Épargne garantie par jour</th></tr></thead>
    <tbody>
      <tr><td>Moto</td><td>{n(M.VERS_MOTO)}</td><td>{n(COTIS)}</td><td><strong>{n(OBJ['moto'])}</strong></td><td>834</td></tr>
      <tr><td>Tricycle</td><td>{n(M.VERS_TRI)}</td><td>{n(COTIS)}</td><td><strong>{n(OBJ['tri'])}</strong></td><td>834</td></tr>
      <tr><td>Voiture Essentiel</td><td>{n(M.VERS_ESS)}</td><td>{n(COTIS)}</td><td><strong>{n(OBJ['ess'])}</strong></td><td>834</td></tr>
      <tr><td>Voiture Confort</td><td>{n(M.VERS_CONF)}</td><td>{n(COTIS)}</td><td><strong>{n(OBJ['conf'])}</strong></td><td>834</td></tr>
    </tbody>
  </table>
  <div class="src ajout-in">La cotisation TamAssur est comprise dans l’objectif : si la part de TamCar est inférieure, la différence est prélevée et l’épargne du jour est quand même créditée. TamCar la verse à NSIA : c’est une charge, financée sur sa part (elle est déduite de ses revenus dans le plan).</div>

  <div class="rule-label ajout" style="margin-top:12px">Exemple : une course de 1 000 F payée en espèces</div>
  <div class="row c-3 stretch ajout" style="margin-top:8px">
    <div class="tile vert">
      <div class="ico">{{{{ico:wallet}}}}</div>
      <h4>1 · Le chauffeur encaisse</h4>
      <p>Il reçoit les 1 000 F du client. Sa part (400 F, ou 800 F s’il possède son véhicule) lui reste en main.</p>
    </div>
    <div class="tile or">
      <div class="ico">{{{{ico:coins}}}}</div>
      <h4>2 · Il doit le reste</h4>
      <p>Le solde (600 F, ou 200 F) est débité de son portefeuille : c’est ce que la plateforme répartit ensuite.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:shield}}}}</div>
      <h4>3 · Il recharge</h4>
      <p>Il alimente son portefeuille par Mobile Money. Au-delà de 5 000 F de dette, la mise en ligne est refusée jusqu’à la recharge.</p>
    </div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------------ 6.4
pages.append(f'''<!-- ============================================================ 06 · p.4 · 6.4 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">06</span><h1>Modèle économique et sources de revenus <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">6.4 · Deuxième source de revenus : l’exploitation de la flotte</div>

  <div class="card" style="margin-top:12px">
    <div class="cols2">
      <p>
        <span class="modif">TamCar met en exploitation <strong>six véhicules à elle</strong> : un tricycle thermique et cinq motos électriques, pour un investissement
        de {n(PRIX_FLOTTE)} FCFA. Elle y ajoute <strong>neuf voitures</strong> d’Afrik Group Consulting, associé de TamCar, et recrute <strong>au minimum {NT} voitures
        de propriétaires tiers</strong> ({M.N_ESS_T} Essentiel, {M.N_CONF_T} Confort) du mois 4 au mois 12. Les voitures n’engagent aucun capital de TamCar.</span>
      </p>
      <p>
        La flotte remplit une <strong>double fonction</strong>. Elle permet, d’une part, de renforcer la
        disponibilité des véhicules sur la plateforme et, d’autre part, de mettre en œuvre la
        cession aux conducteurs.
      </p>
      <p>
        Dans le modèle, le propriétaire du véhicule reçoit sa part de 30 % et, à la cession, le fonds de cession de 5 %.
        À l’issue du contrat, <strong>le conducteur devient propriétaire du véhicule</strong>, sans paiement supplémentaire.
      </p>
      <p>
        Cette activité est suivie séparément des commissions ordinaires de la plateforme :
        les sommes encaissées, les charges liées aux véhicules et les obligations contractuelles <strong>ne constituent pas, en totalité, des revenus
        disponibles pour TamCar</strong>.
      </p>
    </div>
  </div>

  <div class="callout ajout" style="margin-top:10px">
    <strong>Pour ses propres véhicules, TamCar est elle-même propriétaire :</strong> elle perçoit
    la part propriétaire (30 %) en plus de sa part de plateforme et de gestion (25 %). En contrepartie, elle finance l’achat, l’assurance et le tracker GPS certifié du véhicule.
    Le carburant, l’entretien et les réparations sont à la charge du conducteur : les véhicules sont neufs et TamCar ne répond que des défauts couverts par la garantie du fournisseur.
  </div>

  <div class="h-serif ajout" style="margin-top:18px">L’achat des véhicules de TamCar</div>
  <table class="tbl ajout" style="margin-top:8px">
    <colgroup><col style="width:46%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup>
    <thead><tr><th>Montants en FCFA</th><th>Un tricycle</th><th>Cinq motos</th><th class="tam">Les six</th></tr></thead>
    <tbody>
      <tr><td>Prix d’achat</td><td>{n(M.PRIX_TRICYCLE)}</td><td>{n(M.N_MOTO * M.PRIX_MOTO)}</td><td class="tam">{n(PRIX_FLOTTE)}</td></tr>
      <tr><td>À la commande</td><td>{n(M.ACOMPTE_TRICYCLE)} (30 %)</td><td>{n(M.N_MOTO * M.PRIX_MOTO)} (comptant)</td><td class="tam">{n(M.ACOMPTE_TRICYCLE + M.MOTOS_COMPTANT)}</td></tr>
      <tr><td>Solde du tricycle, payé sur {M.MENS_TRICYCLE} mois</td><td>{n(M.PRIX_TRICYCLE - M.ACOMPTE_TRICYCLE)}</td><td>—</td><td class="tam">{n(M.PRIX_TRICYCLE - M.ACOMPTE_TRICYCLE)}</td></tr>
      <tr><td>Mensualité pendant {M.MENS_TRICYCLE} mois</td><td>{n(TRI_MENS)}</td><td>—</td><td class="tam">{n(TRI_MENS)}</td></tr>
    </tbody>
  </table>
  <div class="src ajout-in">Tricycle : paiement à confirmer avec le fournisseur, sans intérêt. Motos : prix comptant de {n(M.PRIX_MOTO)} F (500 000 F au catalogue).</div>

  <div class="h-serif ajout" style="margin-top:14px">Un tricycle qui atteint son plancher</div>
  <div class="row c-3 ajout" style="margin-top:8px">
    <div class="kpi"><b>{n(M.VOL_TRI * M.JOURS)} F</b><span>de courses par mois</span><small>{n(M.VOL_TRI)} F par jour, 26 jours</small></div>
    <div class="kpi"><b>{n(PART['tri'])} F</b><span>reviennent à TamCar</span><small>55 % : plateforme, gestion, propriétaire, moins {n(M.COTIS * M.JOURS)} F de TamAssur</small></div>
    <div class="kpi"><b>{n(TRI_MENS)} F</b><span>de mensualité d’achat</span><small>couverte dès {pct(100 * M.SEUIL_MENS_TRI, 0)} du plancher</small></div>
  </div>
  <div class="h-serif ajout" style="margin-top:12px">Une moto qui atteint son plancher</div>
  <div class="row c-3 ajout" style="margin-top:8px">
    <div class="kpi"><b>{n(M.VERS_MOTO * M.JOURS)} F</b><span>de versement net par mois</span><small>{n(M.VERS_MOTO)} F par jour, 26 jours (objectif de {n(M.OBJ_MOTO)} F moins TamAssur)</small></div>
    <div class="kpi"><b>{D1(M.PRIX_MOTO / (M.VERS_MOTO * M.JOURS))} mois</b><span>pour rembourser le prix</span><small>{n(M.PRIX_MOTO)} F comptant</small></div>
    <div class="kpi"><b>{n(M.VOL_MOTO * M.JOURS * 0.2)} F</b><span>par mois après la cession</span><small>12 mois, puis 20 % du volume</small></div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------------ 6.5 + 6.6
pages.append(f'''<!-- ============================================================ 06 · p.5 · 6.5 + 6.6 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">06</span><h1>Modèle économique et sources de revenus <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">6.5 · Les abonnements et services complémentaires</div>

  <div class="card" style="margin-top:12px">
    <div class="cols2">
      <p>
        La plateforme prévoit également des services complémentaires qui diversifient
        ses revenus, notamment les abonnements TamPass. Le portefeuille
        électronique, le parrainage et les fonctionnalités de réservation programmée soutiennent
        l’usage de la plateforme, mais ne sont pas en eux-mêmes des sources de revenus ; <strong>le
        parrainage est une dépense d’acquisition</strong>.
      </p>
      <p>
        TamPass propose aux utilisateurs une formule adaptée aux déplacements récurrents. Son
        intérêt économique tient au niveau d’adoption, à la fréquence d’utilisation, au tarif et
        au coût des avantages accordés aux abonnés.
      </p>
      <p>
        Le plan de trésorerie ne compte aucun revenu issu de ces services : ils s’ajoutent aux
        revenus du plan.
      </p>
      <p>
        <span class="modif">La cotisation TamAssur ({n(M.COTIS)} F par jour) est comprise dans l’objectif du conducteur ; TamCar la règle à NSIA et la finance sur sa part (elle est déduite des revenus du plan).
        TamCar garantit au conducteur 250 000 F par année de contrat, par paliers jusqu’au terme du contrat ; le manque au rachat est chiffré au premier palier. Cet engagement et les partenariats financiers font l’objet d’accords formalisés et des
        vérifications juridiques et réglementaires nécessaires ; les partenariats financiers ne figurent pas dans les prévisions de revenus.</span>
      </p>
    </div>
  </div>

  <div class="h-serif" style="margin-top:22px">6.6 · Les facteurs déterminants de la rentabilité</div>
  <p class="intro">La rentabilité de TamCar repose principalement sur six facteurs :</p>

  <div class="row c-3 stretch">
    <div class="tile">
      <div class="ico">{{{{ico:wallet}}}}</div>
      <h4>L’encaissement des versements</h4>
      <p>Les planchers n’ont de valeur que s’ils sont effectivement encaissés : le taux d’atteinte décide de l’excédent d’exploitation (7.6).</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:car}}}}</div>
      <h4>Le nombre de véhicules en service</h4>
      <p>Chaque voiture de propriétaire tiers ajoute {n(PART['ess'])} F à {n(PART['conf'])} F par mois pour {n(M.FRAIS_ENTREE)} F d’entrée : c’est le levier principal (10.9).</p>
    </div>
    <div class="tile vert">
      <div class="ico">{{{{ico:chart}}}}</div>
      <h4>Le volume au-dessus des planchers</h4>
      <p>Toute course au-dessus du plancher augmente la part de TamCar, selon la clé de répartition.</p>
    </div>
  </div>
  <div class="row c-3 stretch">
    <div class="tile or">
      <div class="ico">{{{{ico:users}}}}</div>
      <h4>La disponibilité des conducteurs</h4>
      <p>Un véhicule sans conducteur ne verse rien : le délai de remplacement d’un conducteur compte.</p>
    </div>
    <div class="tile">
      <div class="ico">{{{{ico:calendar}}}}</div>
      <h4>La fidélisation des passagers</h4>
      <p>Les réservations répétées contribuent à stabiliser l’activité.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:target}}}}</div>
      <h4>La maîtrise des charges d’exploitation</h4>
      <p>Les dépenses administratives, techniques, commerciales et opérationnelles doivent rester compatibles avec la progression des recettes.</p>
    </div>
  </div>

  <div class="callout" style="margin-top:12px">
    Le suivi de ces indicateurs ajuste progressivement la stratégie commerciale, le
    déploiement de la flotte et les dépenses de fonctionnement.
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------------ 6.7
pages.append(f'''<!-- ============================================================ 06 · p.6 · 6.7 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">06</span><h1>Modèle économique et sources de revenus <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">6.7 · Synthèse du modèle</div>

  <div class="hero" style="margin-top:12px; padding:22px 26px">
    <span class="pill">Synthèse</span>
    <div class="cols2" style="margin-top:8px">
      <p style="text-align:left">
        Le modèle économique de TamCar associe une activité de plateforme de transport à un
        <strong>versement minimum quotidien</strong> des conducteurs, à une flotte de véhicules (la sienne, celle de propriétaires partenaires) et à des
        services complémentaires. Les versements planchers et les commissions sur les courses constituent le principal levier
        de revenus récurrents, tandis que la flotte favorise le recrutement des chauffeurs et soutient le développement de l’activité.
      </p>
      <p style="text-align:left">
        La viabilité du modèle reposera sur la capacité de TamCar à encaisser les versements, à recruter des véhicules et des conducteurs, à
        maîtriser ses charges et à encadrer contractuellement la cession des véhicules.
      </p>
      <p style="text-align:left">
        Les hypothèses de revenus, les besoins de financement et les projections de trésorerie
        sont présentés dans les parties financières du présent business plan (parties 7 et 8).
      </p>
    </div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

(ICI / 'partie6.html').write_text('\n'.join(pages), encoding='utf-8')
print('partie6.html :', len(pages), 'pages')
