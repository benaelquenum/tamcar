"""Génère partie8.html (Charges d'exploitation et plan de financement) — version 6, à partir du classeur TamCar_resultat_complet_v2.

Les versions précédentes (cas A et B, dix tricycles, Parakou) sont dans archives/2026-10-03_plan_affaires_v5.
"""
import pathlib

import modele_v6 as M

ICI = pathlib.Path(__file__).parent
n, sg, mm, pct, taux = M.n, M.sg, M.mm, M.pct, M.taux

def D1(v):
    return f"{v:.1f}".replace('.', ',')

TAUX = M.TAUX
R_T, R_S = M.res(1.0, True), M.res(1.0, False)
R70_S = M.res(0.7, False)
SEUIL_S, SEUIL_T = M.seuils('flotte_actuelle'), M.seuils('avec_tiers')
NT = M.N_ESS_T + M.N_CONF_T
CUM6 = M.ligne(87)[6] + M.ligne(88)[6]
TRI_MENS = M.PRIX_TRICYCLE * (1 - M.ACOMPTE_PCT) / M.MENS_TRICYCLE
ASS_TRI_M = 75_000 / 12
ASS_MOTO_M = 50_000 / 12
TRACKERS = [M.annuel(50)[i] + M.annuel(51)[i] for i in (1, 2, 3)]
PATENTE = M.h('B50') + M.h('B51') * 12 * M.h('B37')
MISE_DEPART = (M.ACOMPTE_TRICYCLE + M.MOTOS_COMPTANT + M.annuel(48)[1] + M.annuel(49)[1] + M.annuel(50)[1] + M.annuel(51)[1]
               + M.N_VEHICULES_TAMCAR * M.FRAIS_ENTREE)
POINT_BAS_T = min(M.serie_caisse(1.0, True))
MOIS_BAS_T = M.serie_caisse(1.0, True).index(POINT_BAS_T)
POINT_BAS_S = min(M.serie_caisse(1.0, False))
VAC_AN = M.h('B81') / 12 * M.h('B82') * M.h('B80') * 12 * (M.N_VEHICULES_MOIS1)


def tr(*cells, cls=''):
    return f'<tr{" class=" + chr(34) + cls + chr(34) if cls else ""}>' + ''.join(f'<td>{c}</td>' for c in cells) + '</tr>'


pages = []

# ------------------------------------------------------------ 8.1
pages.append(f'''<!-- ============================================================ 08 · p.1 · 8.1 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">08</span><h1>Charges d’exploitation et plan de financement</h1></div>

  <div class="hero" style="margin-top:14px">
    <span class="pill">8.1 · Objet et méthode</span>
    <div class="cols2" style="margin-top:6px">
      <p style="text-align:left">
        Cette partie montre à l’investisseur ce que TamCar devra payer pour fonctionner, comment ces
        dépenses évolueront sur 36 mois et comment les ressources initiales seront mobilisées.
      </p>
      <p style="text-align:left">
        Tous les chiffres viennent du classeur de trésorerie présenté en partie 7. Ils sont calculés
        pour deux flottes de référence et pour des taux d’atteinte des planchers de 100 % à 50 %.
      </p>
    </div>
  </div>

  <div class="row c-3 stretch">
    <div class="tile">
      <div class="ico">{{{{ico:wallet}}}}</div>
      <h4>Que paie TamCar ?</h4>
      <p>Des investissements de démarrage, des charges mensuelles d’exploitation, des coûts liés à ses six véhicules, le prix de ces véhicules et {n(M.FRAIS_ENTREE)} F d’entrée pour chaque véhicule déployé.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:chart}}}}</div>
      <h4>Comment cela évolue-t-il ?</h4>
      <p>Les charges montent avec la rémunération du développeur (mois 13) et avec le volume, car le responsable des opérations est payé à 3 %. Le tricycle est payé jusqu’au mois 13, les motos au comptant ; ensuite, plus aucune mensualité.</p>
    </div>
    <div class="tile vert">
      <div class="ico">{{{{ico:target}}}}</div>
      <h4>Comment la levée est-elle mobilisée ?</h4>
      <p>Les 15 M FCFA financent le démarrage ({mm(M.DEMARRAGE, 2, False)}), l’achat des six véhicules et les premiers mois. Le point bas, {mm(POINT_BAS_T, 1, False)}, se situe au mois 1 : la levée n’est jamais consommée en entier.</p>
    </div>
  </div>

  <div class="h-serif" style="margin-top:20px">Deux flottes de référence</div>
  <table class="tbl txt" style="margin-top:10px">
    <colgroup><col style="width:20%"><col style="width:46%"><col style="width:18%"><col style="width:16%"></colgroup>
    <thead><tr><th>Flotte</th><th>Véhicules en service</th><th>Achetés par TamCar</th><th>Levée</th></tr></thead>
    <tbody>
      {tr('<strong>Flotte de départ</strong>', f'{M.N_VEHICULES_MOIS1} véhicules au mois 1 : 1 tricycle, 5 motos (TamCar) et 9 voitures d’Afrik Group (6 Essentiel, 3 Confort).', n(M.PRIX_TRICYCLE + M.N_MOTO * M.PRIX_MOTO) + ' FCFA', '15 000 000 FCFA')}
      {tr('<strong>Flotte recrutée</strong>', f'Flotte de départ + au moins {NT} voitures de tiers ({M.N_ESS_T} Essentiel, {M.N_CONF_T} Confort) recrutées du mois 4 au mois 12.', 'Idem (aucun achat de plus)', '15 000 000 FCFA')}
    </tbody>
  </table>
  <div class="src">Planchers atteints dans les deux cas ; la partie 8.8 donne les résultats de 100 % à 50 %.</div>

  <div class="h-serif" style="margin-top:20px">Ce que TamCar paie, et ce qu’elle ne paie pas</div>
  <div class="row c-1-1 stretch">
    <div class="card">
      <div class="eyebrow">{{{{ico:coins}}}} À la charge de TamCar</div>
      <ul class="liste" style="margin-top:0">
        <li>les investissements de démarrage (8.2) ;</li>
        <li>les charges mensuelles : équipe, locaux, prestataires, promotions (8.3) ;</li>
        <li>l’impôt minimum sur les sociétés et la patente (8.3) ;</li>
        <li>l’assurance, le droit taxi, la visite technique et le tracker GPS de ses six véhicules, tant qu’elle en est propriétaire (8.3 et 8.4) ;</li>
        <li>le prix de ces véhicules : avance et mensualités du tricycle, motos au comptant (8.6) ;</li>
        <li>{n(M.FRAIS_ENTREE)} F de frais d’entrée par véhicule déployé (8.3).</li>
      </ul>
    </div>
    <div class="card">
      <div class="eyebrow rouille">{{{{ico:shield}}}} Pas à la charge de TamCar</div>
      <ul class="liste rouille" style="margin-top:0">
        <li>le carburant, l’entretien et les réparations : au conducteur ;</li>
        <li>l’assurance, le tracker GPS et l’entretien des voitures : à leur propriétaire (Afrik Group, ou le propriétaire tiers) ;</li>
        <li>les frais de paiement Mobile Money : au client ;</li>
        <li>les charges sociales de l’employeur : les rémunérations sont indiquées en brut.</li>
      </ul>
    </div>
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------ 8.2
pages.append(f'''<!-- ============================================================ 08 · p.2 · 8.2 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">08</span><h1>Charges d’exploitation et plan de financement <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">8.2 · Les investissements de démarrage</div>
  <p class="intro">Ces dépenses sont payées une seule fois, au mois 0. Elles sont identiques dans les deux flottes.</p>

  <table class="tbl txt" style="margin-top:10px">
    <colgroup><col style="width:44%"><col style="width:16%"><col style="width:12%"><col style="width:28%"></colgroup>
    <thead><tr><th>Poste</th><th style="text-align:right">Montant (FCFA)</th><th>Quand</th><th>Nature</th></tr></thead>
    <tbody>
      {tr('Formalisation de la société', '<div style="text-align:right">' + n(M.h('B22')) + '</div>', 'Mois 0', 'Statuts, RCCM, IFU, annonce, évaluation de l’apport en nature (forfait retenu avec un expert-comptable, commissaire aux apports)')}
      {tr('ANATT : autorisation d’exploitation et attestations', '<div style="text-align:right">' + n(M.h('B23')) + '</div>', 'Mois 0', 'Obligation réglementaire ; renouvelée chaque année (8.3)')}
      {tr('Juriste : contrats', '<div style="text-align:right">' + n(M.h('B24')) + '</div>', 'Mois 0', 'Contrats chauffeurs, cession, partenaires')}
      {tr('Bureau de Cotonou : caution et aménagement', '<div style="text-align:right">' + n(M.h('B25')) + '</div>', 'Mois 0', 'Accueil, dossiers, chauffeurs')}
      {tr('Matériel informatique et mobilier', '<div style="text-align:right">' + n(M.h('B26')) + '</div>', 'Mois 0', 'Postes, imprimante, mobilier')}
      {tr('Marketing de lancement : photo, vidéo, sponsoring', '<div style="text-align:right">' + n(M.h('B27')) + '</div>', 'Mois 0', 'Seul marketing budgété en investissement. Comprend la création de spots vidéo par IA (Higgsfield) : 39 200 F pour le pilote (forfait Plus, 1 mois), 309 600 F au plus si le pilote convainc (forfait Ultra, 3 mois), dollar à 800 F ; le solde couvre la photo et le sponsoring')}
      {tr('Graphisme', '<div style="text-align:right">' + n(M.h('B28')) + '</div>', 'Mois 0', 'Supports de communication')}
      {tr('<strong>Total</strong>', '<div style="text-align:right"><strong>' + n(M.DEMARRAGE) + '</strong></div>', '', 'Payé au mois 0')}
    </tbody>
  </table>

  <div class="row c-1-1 stretch" style="margin-top:12px">
    <div class="callout">
      <strong>Apport en nature.</strong> La plateforme (4 000 000 FCFA de dépenses documentées) est
      apportée en nature à la société. Ce n’est pas un décaissement : elle n’apparaît pas dans ces
      investissements.
    </div>
    <div class="callout rouille">
      <strong>Pas de marketing récurrent.</strong> Le plan ne budgète ni publicité payante, ni marketing
      de rue, ni radio, ni parrainage. Seuls le lancement et la promotion de première course sont
      financés.
    </div>
  </div>

  <div class="rule-label" style="margin-top:18px">Ce que ces dépenses représentent dans la levée</div>
  <div class="row c-3" style="margin-top:8px">
    <div class="kpi"><b>{mm(M.DEMARRAGE, 2, False)}</b><span>investissements de démarrage</span><small>{pct(100 * M.DEMARRAGE / M.LEVEE, 0)} des 15 M FCFA</small></div>
    <div class="kpi"><b>{mm(M.LEVEE - M.DEMARRAGE, 2, False)}</b><span>restent après le démarrage</span><small>avant tout achat de véhicule</small></div>
    <div class="kpi"><b>{mm(MISE_DEPART, 2, False)}</b><span>de mise de départ des six véhicules</span><small>avance, motos, assurances, trackers, frais d’entrée</small></div>
  </div>

  <div class="callout ajout" style="margin-top:14px">
    <strong>Plus d’avance de démarrage remboursable.</strong> Le plan précédent prévoyait une avance de 100 000 F par voiture, remboursée au mois 13
    (900 000 F). Elle est supprimée : TamCar avance à la place {n(M.FRAIS_ENTREE)} F de frais d’entrée par véhicule déployé (inspection, habillage,
    kit du conducteur), soit {n(M.N_VEHICULES_MOIS1 * M.FRAIS_ENTREE)} F pour les {M.N_VEHICULES_MOIS1} véhicules du mois 1. Il n’y a plus de sortie de trésorerie au mois 13 de ce chef.
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------ 8.3
OPS_S, OPS_T = M.ops_mensuel(24, False), M.ops_mensuel(24, True)
pages.append(f'''<!-- ============================================================ 08 · p.3 · 8.3 -->
<section class="page dense" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">08</span><h1>Charges d’exploitation et plan de financement <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">8.3 · Les charges d’exploitation mensuelles</div>
  <p class="intro">Montants mensuels en FCFA. « Variable » signifie qu’ils suivent le volume de courses. Les rémunérations sont indiquées en brut.</p>

  <table class="tbl txt" style="margin-top:10px">
    <colgroup><col style="width:32%"><col style="width:22%"><col style="width:12%"><col style="width:34%"></colgroup>
    <thead><tr><th>Poste</th><th>Montant</th><th>Nature</th><th>Début et remarque</th></tr></thead>
    <tbody>
      {tr('<strong>Équipe</strong>', '', '', '')}
      {tr('Responsable des opérations', '3 % du volume, plafonné à 150 000', 'Variable', f'Dès le mois 1. Flotte de départ : {n(OPS_S)} ; flotte recrutée : plafond atteint ({n(OPS_T)}), un second responsable serait à prévoir au-delà')}
      {tr('Secrétaire-comptable', '100 000', 'Fixe', 'Dès le mois 1')}
      {tr('Développeur', '200 000', 'Fixe', 'Dès le mois 13 ; le fondateur assure la maintenance la première année')}
      {tr('Infrastructure technique', '75 000', 'Fixe', 'Dès le mois 1 : base de données, hébergement, cartes, notifications')}
      {tr('Outil de développement (Claude Code)', '75 000', 'Fixe', 'Mois 1 à 12 ; ensuite inclus dans la rémunération du développeur')}
      {tr('<strong>Locaux</strong>', '', '', '')}
      {tr('Bureau, électricité et eau', '50 000 de loyer, 100 000 d’électricité et d’eau', 'Fixe', 'Bureau de Cotonou dès le mois 1')}
      {tr('<strong>Prestataires et promotions</strong>', '', '', '')}
      {tr('Comptable externe et juriste consultant', '75 000 et 50 000 par trimestre', 'Fixe', 'Un versement par trimestre')}
      {tr('Assurance multirisque professionnelle', '50 000', 'Fixe', 'Dès le mois 1')}
      {tr('Promotions de lancement', '100 000', 'Fixe', 'Six premiers mois ; budget arrêté avant le lancement (4.5.3)')}
      {tr('Autorisation de transporteur ANATT', '280 000 par an', 'Fixe', 'Renouvelée aux mois 13 et 25 (la première est dans le démarrage)')}
      {tr('Impôts et taxes', f'Impôt minimum de {n(M.h("B49"))} par an ; patente de {n(PATENTE)}', 'Fixe', 'Impôt aux mois 16 et 28 ; patente aux mois 13 et 25. Aucune exonération')}
      {tr('<strong>Véhicules et conducteurs</strong>', '', '', '')}
      {tr('Frais d’entrée par véhicule déployé', f'{n(M.FRAIS_ENTREE)} par véhicule', 'Une fois', f'{M.N_VEHICULES_MOIS1} véhicules au mois 1 ; chaque voiture de tiers à son arrivée')}
      {tr('Assurance, droit taxi, visite technique de TamCar', f'75 000 par an par tricycle ; 50 000 par an par moto', 'Fixe', 'Jusqu’à la cession du véhicule au conducteur')}
      {tr('Tracker GPS certifié ANATT de TamCar', '139 000 en année 1, puis 89 000 par an (tricycle)', 'Fixe', 'À la mise en service puis chaque anniversaire (8.4) ; motos cédées à 12 mois : pas de renouvellement')}
      {tr('Épargne NSIA (TamAssur) : postes vacants', f'environ {n(VAC_AN)} par an', 'Variable', 'Cotisation NSIA avancée pendant la vacance d’un poste (25 % de départs, 21 jours)')}
      {tr('Épargne NSIA (TamAssur) : manque au rachat', f'{n(M.NSIA_12)} par moto ; {n(M.NSIA_24)} par autre véhicule', 'Une fois par véhicule', 'À l’ouverture du premier palier de retrait (12 mois pour une moto, 24 mois pour les autres) : estimations à confirmer par une simulation écrite de NSIA')}
      {tr('Cotisation TamAssur des véhicules sous contrat', f'{n(M.COTIS)} par jour et par véhicule', 'Déduite des recettes', 'Comprise dans l’objectif du conducteur, versée à NSIA par TamCar et financée sur sa part : elle n’est pas dans les charges ci-dessus mais déduite des revenus (7.2)')}
    </tbody>
  </table>

  <div class="callout" style="margin-top:10px">
    <strong>Carburant, entretien et réparations : à la charge du conducteur.</strong> Les véhicules de TamCar
    sont neufs et garantis par le fournisseur. Pour les voitures, l’assurance, le tracker GPS et l’entretien sont à la charge de leur propriétaire. Aucune provision d’entretien n’est inscrite dans les charges de TamCar.
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------ 8.4
pages.append(f'''<!-- ============================================================ 08 · p.4 · 8.4 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">08</span><h1>Charges d’exploitation et plan de financement <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">8.4 · Les trackers GPS : une obligation et un outil de contrôle</div>

  <div class="card" style="margin-top:12px">
    <div class="eyebrow">{{{{ico:map-pin}}}} Tracker GPS certifié ANATT</div>
    <p>
      Le tracker est un boîtier GPS posé dans le véhicule. Il transmet sa position en continu,
      indépendamment du téléphone du conducteur. Selon le relevé de l’ANATT, un dispositif certifié est
      obligatoire pour les véhicules de transport ; il se renouvelle chaque année.
    </p>
    <p>
      Pour TamCar, il a deux fonctions : c’est une condition pour exploiter légalement, et c’est
      l’outil qui protège et contrôle les véhicules qu’elle possède.
    </p>
  </div>

  <table class="tbl" style="margin-top:12px">
    <colgroup><col style="width:30%"><col style="width:20%"><col style="width:20%"><col style="width:30%"></colgroup>
    <thead><tr><th>Par véhicule de TamCar, en FCFA</th><th>Année 1</th><th>Années suivantes</th><th>Sur la détention par TamCar</th></tr></thead>
    <tbody>
      {tr('Tricycle', n(M.h('B17')), n(M.h('B18')), f'{n(M.h("B17") + M.h("B18"))}<small>24 mois</small>')}
      {tr('Moto', n(M.h('B19')), '—', f'{n(M.h("B19"))}<small>12 mois, puis cédée</small>')}
    </tbody>
  </table>
  <table class="tbl" style="margin-top:8px">
    <colgroup><col style="width:30%"><col style="width:17.5%"><col style="width:17.5%"><col style="width:17.5%"><col style="width:17.5%"></colgroup>
    <thead><tr><th>Dans le plan, en FCFA</th><th>Année 1</th><th>Année 2</th><th>Année 3</th><th>Total</th></tr></thead>
    <tbody>
      {tr('Véhicules de TamCar (1 tricycle, 5 motos)', n(TRACKERS[0]), n(TRACKERS[1]), n(TRACKERS[2]), n(sum(TRACKERS)))}
    </tbody>
  </table>
  <div class="src">Prix de l’ANATT relevés en juillet 2026 et maintenus. Paiement annuel, à la mise en service puis à chaque anniversaire, tant que TamCar est propriétaire ; à la cession, le conducteur reprend le renouvellement.</div>

  <div class="rule-label" style="margin-top:14px">Pourquoi le tracker compte pour le business</div>
  <div class="row c-3 stretch" style="margin-top:8px">
    <div class="tile">
      <div class="ico">{{{{ico:check}}}}</div>
      <h4>Conformité</h4>
      <p>Sans dispositif certifié, le véhicule ne peut pas être autorisé au transport. C’est une condition d’exploitation, pas une option.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:shield}}}}</div>
      <h4>Protection de l’actif</h4>
      <p>TamCar possède {n(M.PRIX_TRICYCLE + M.N_MOTO * M.PRIX_MOTO)} FCFA de véhicules. Le tracker permet de les localiser et de les récupérer en cas de vol ou de détournement.</p>
    </div>
    <div class="tile vert">
      <div class="ico">{{{{ico:eye}}}}</div>
      <h4>Intégrité des revenus</h4>
      <p>Le versement dépend des courses enregistrées. La position du véhicule permet de repérer une activité hors plateforme et de rapprocher kilomètres et courses.</p>
    </div>
  </div>
  <div class="row c-3 stretch">
    <div class="tile or">
      <div class="ico">{{{{ico:alert}}}}</div>
      <h4>Sécurité et litiges</h4>
      <p>En cas d’accident, d’incident ou de réclamation, l’historique de position sert de preuve. Il complète le suivi en direct de la plateforme.</p>
    </div>
    <div class="tile">
      <div class="ico">{{{{ico:chart}}}}</div>
      <h4>Pilotage de la flotte</h4>
      <p>Disponibilité, immobilisations, kilomètres parcourus : ces données alimentent les indicateurs de rentabilité (6.6) et le calendrier d’entretien.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:landmark}}}}</div>
      <h4>Cession et assurance</h4>
      <p>L’historique d’usage documente l’état du véhicule à la cession et peut peser dans les conditions d’assurance.</p>
    </div>
  </div>

  <div class="callout ajout" style="margin-top:12px">
    <strong>Qui paie.</strong> TamCar, pour les six véhicules qu’elle possède, jusqu’à leur cession. Pour toutes les voitures (Afrik Group et tiers) et
    pour les véhicules de tiers en général, le tracker GPS est à la charge du propriétaire (décision confirmée le 18 octobre 2026). Le demander au
    conducteur pèserait environ 11 583 F par mois sur son revenu en main. <strong>Effet sur le plan :</strong> les trackers de TamCar coûtent
    {n(sum(TRACKERS))} FCFA sur 36 mois, soit {pct(100 * sum(TRACKERS) / M.CHARGES_36, 1)} des charges d’exploitation.
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------ 8.5
def tab_phases(titre, tiers):
    lignes = ''
    for m1, m2, nom, sous in M.PHASES:
        p = M.phase_gen(m1, m2, tiers)
        lignes += tr(f'<strong>{nom}</strong><small>{sous}</small>', n(p['rec']), n(p['ch']), n(p['equipe']), n(p['locaux_presta']),
                     n(p['autres']), n(p['achats']), sg(p['flux']))
    return f'''<table class="tbl ajout" style="margin-top:8px">
    <colgroup><col style="width:25%"><col style="width:10.5%"><col style="width:10.5%"><col style="width:10.5%"><col style="width:12.5%"><col style="width:12%"><col style="width:9.5%"><col style="width:9.5%"></colgroup>
    <thead><tr><th>{titre}</th><th>Revenus</th><th>Charges</th><th>dont équipe</th><th>dont locaux, prestataires</th><th>dont assurances, trackers, ANATT, impôts, entrées</th><th>Mensualités d’achat</th><th>Flux</th></tr></thead>
    <tbody>{lignes}</tbody>
  </table>'''


pa_s = M.phase_gen(1, 6, False)
pa_t = M.phase_gen(7, 12, True)
pages.append(f'''<!-- ============================================================ 08 · p.5 · 8.5 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">08</span><h1>Charges d’exploitation et plan de financement <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">8.5 · L’évolution des charges dans le temps</div>
  <p class="intro">Moyennes mensuelles par phase, planchers atteints, en FCFA. Le flux est ce qui reste après les charges, les mensualités d’achat et les revenus ; les investissements de démarrage sont comptés à part. Les achats de véhicules et les frais d’entrée du mois 1 pèsent sur la première phase.</p>

  {tab_phases('Flotte de départ · 15 véhicules', False)}
  {tab_phases('Flotte recrutée · + 6 voitures de tiers', True)}

  <div class="row c-1-1 stretch ajout" style="margin-top:12px">
    <div class="callout rouille">
      <strong>Ce qui fait bouger les charges.</strong> De la première à la dernière phase, celles de la flotte de départ passent de
      {n(M.phase_gen(1, 6, False)['ch'])} à {n(M.phase_gen(25, 36, False)['ch'])} F par mois : la mise en circulation et les frais d’entrée du démarrage
      disparaissent, tandis que la rémunération du développeur ({n(M.h('B33'))} F dès le mois 13) s’y ajoute.
    </div>
    <div class="callout vert">
      <strong>Ce qui les compense.</strong> Les revenus passent de {n(M.phase_gen(1, 6, False)['rec'])} à {n(M.phase_gen(25, 36, False)['rec'])} F par mois pour la
      flotte de départ, et à {n(M.phase_gen(25, 36, True)['rec'])} F avec les voitures de tiers. Le flux devient positif dès la deuxième phase (mois 7 à 12).
    </div>
  </div>
  <div class="src ajout">Le flux de la première phase est négatif en moyenne parce qu’il contient l’achat des véhicules de TamCar, le mois du lancement (compté pour moitié) et la montée progressive des véhicules ; il est positif dès le mois 2, hors charges annuelles et manque au rachat NSIA (7.5).</div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------ 8.6
dettes = {m: M.PRIX_TRICYCLE * (1 - M.ACOMPTE_PCT) - sum(M.ligne(43)[2:m + 1]) for m in (1, 6, 12, 13)}
pages.append(f'''<!-- ============================================================ 08 · p.6 · 8.6 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">08</span><h1>Charges d’exploitation et plan de financement <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">8.6 · Le financement des véhicules</div>
  <p class="intro">TamCar achète six véhicules ; les voitures n’engagent aucun capital. Le fournisseur de tricycles accorde 30 % à la commande et le solde sur 12 mois, sans intérêt (conditions à confirmer) ; les motos sont payées comptant.</p>

  <table class="tbl" style="margin-top:10px">
    <colgroup><col style="width:30%"><col style="width:14%"><col style="width:18%"><col style="width:16%"><col style="width:12%"><col style="width:10%"></colgroup>
    <thead><tr><th>Véhicule</th><th>Valeur</th><th>À la commande (mois 1)</th><th>Mensualité</th><th>Mensualités</th><th>Dernier paiement</th></tr></thead>
    <tbody>
      {tr('Tricycle thermique · Cotonou', n(M.PRIX_TRICYCLE), n(M.ACOMPTE_TRICYCLE) + ' (30 %)', n(TRI_MENS), 'Mois 2 à 13', 'Mois 13')}
      {tr('Cinq motos électriques · Cotonou', n(M.N_MOTO * M.PRIX_MOTO), n(M.N_MOTO * M.PRIX_MOTO) + ' (comptant)', '—', '—', '—')}
      {tr('<strong>Total</strong>', '<strong>' + n(M.PRIX_TRICYCLE + M.N_MOTO * M.PRIX_MOTO) + '</strong>', '<strong>' + n(M.ACOMPTE_TRICYCLE + M.MOTOS_COMPTANT) + '</strong>', n(TRI_MENS) + ' au plus', '', '')}
      {tr('Neuf voitures (6 Essentiel, 3 Confort)', 'Afrik Group', 'aucun capital', '—', '—', '—')}
      {tr('Voitures de tiers recrutées', 'leurs propriétaires', 'aucun capital', '—', '—', '—')}
    </tbody>
  </table>

  <div class="h-serif" style="margin-top:16px">Ce que TamCar doit encore au fournisseur</div>
  <table class="tbl" style="margin-top:8px">
    <colgroup><col style="width:34%"><col style="width:16.5%"><col style="width:16.5%"><col style="width:16.5%"><col style="width:16.5%"></colgroup>
    <thead><tr><th>Solde dû, en FCFA</th><th>Mois 1</th><th>Mois 6</th><th>Mois 12</th><th>Mois 13</th></tr></thead>
    <tbody>
      {tr('Tricycle', n(dettes[1]), n(dettes[6]), n(dettes[12]), n(max(0, dettes[13])))}
    </tbody>
  </table>
  <p class="intro" style="margin-top:6px">Le solde dû est à son maximum juste après la commande ({n(dettes[1])} F) : la dette totale du plan envers un fournisseur est celle d’un seul tricycle.</p>

  <div class="row c-1-1 stretch" style="margin-top:12px">
    <div class="callout vert">
      <strong>Qui rembourse ?</strong> Les véhicules eux-mêmes. Aux planchers, la part de TamCar sur le tricycle est de {n(M.PART_NETTE_MENS['tri'])} F par mois
      (nette de la cotisation TamAssur) pour une mensualité de {n(TRI_MENS)} F : elle est couverte dès {pct(100 * M.SEUIL_MENS_TRI, 0)} du plancher. Les motos, payées
      comptant, rapportent {n(M.VERS_MOTO * M.JOURS)} F par mois chacune : leur prix est remboursé en {D1(M.PRIX_MOTO / (M.VERS_MOTO * M.JOURS))} mois.
    </div>
    <div class="callout rouille">
      <strong>Durée de cession.</strong> La moto est cédée au conducteur après 12 mois, le tricycle après 24 mois, la voiture Essentiel après 36 mois
      et le Confort après 48 mois, sans paiement supplémentaire. À la cession, TamCar ne garde que ses 20 % de plateforme et cesse de payer l’assurance.
    </div>
  </div>
  <div class="callout ajout" style="margin-top:10px">
    <strong>Non comptées.</strong> Plus aucune avance de démarrage de propriétaire n’est versée à TamCar ni remboursée : la décision de supprimer l’avance (11 octobre 2026) a
    remplacé l’ancien dispositif par des frais d’entrée de {n(M.FRAIS_ENTREE)} F par véhicule, à la charge de TamCar (8.2).
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------ 8.7
def pf_table(titre, tiers):
    lignes = ''
    cum = {}
    for m in (0, 12, 24, 36):
        s = M.serie(1.0, tiers)
        rec = sum(s['rec'][1:m + 1])
        ch = sum(s['ch'][0:m + 1])
        achats = M.cumul((45,), m)
        dem = M.cumul((20,), m)
        cum[m] = dict(dem=dem, achats=achats, expl=ch - dem - achats, rec=rec, emplois=ch,
                      ress=M.LEVEE + rec, solde=M.LEVEE + rec - ch)
    def lig(lab, cle, fort=False):
        cells = [n(cum[m][cle]) if cum[m][cle] else '—' for m in (0, 12, 24, 36)]
        if cle == 'solde':
            cells = [sg(cum[m][cle]) for m in (0, 12, 24, 36)]
        return tr(*([f'<strong>{lab}</strong>'] + [f'<strong>{c}</strong>' for c in cells])) if fort else tr(lab, *cells)
    return f'''<table class="tbl" style="margin-top:6px">
    <colgroup><col style="width:44%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:14%"></colgroup>
    <thead><tr><th>{titre}, cumul en FCFA</th><th>Mois 0</th><th>Mois 12</th><th>Mois 24</th><th>Mois 36</th></tr></thead>
    <tbody>
      {lig('Investissements de démarrage', 'dem')}
      {lig('Achat des véhicules de TamCar', 'achats')}
      {lig('Charges d’exploitation et mise en circulation', 'expl')}
      {lig('Total des emplois', 'emplois', True)}
      {tr('Levée de fonds', n(M.LEVEE), n(M.LEVEE), n(M.LEVEE), n(M.LEVEE))}
      {lig('Revenus de TamCar', 'rec')}
      {lig('Total des ressources', 'ress', True)}
      {lig('Solde de trésorerie', 'solde', True)}
    </tbody>
  </table>'''


def barre(invest, achats, net, reserve):
    segs = [('c1', 'Investissements', invest), ('c2', 'Achat des véhicules', achats), ('c3', 'Charges nettes', max(net, 0)), ('c4', 'Réserve', max(reserve, 0))]
    tot = max(M.LEVEE, sum(v for _, _, v in segs))
    out = '<div class="bar4">'
    for cl, nom, v in segs:
        w = 100 * v / tot
        lib = f"{nom} {mm(v, 1, False)}" if w >= 17 else (mm(v, 1, False) if w >= 7 else '')
        out += f'<div class="{cl}" style="width:{w:.1f}%">{lib}</div>'
    return out + '</div>'


m_bas = MOIS_BAS_T
s_t = M.serie(1.0, True)
invest = M.DEMARRAGE
achats_m1 = M.cumul((45,), m_bas)
net_m1 = M.LEVEE - invest - achats_m1 - POINT_BAS_T

pages.append(f'''<!-- ============================================================ 08 · p.7 · 8.7 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">08</span><h1>Charges d’exploitation et plan de financement <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">8.7 · Le plan de financement</div>
  <p class="intro">Emplois et ressources cumulés, planchers atteints. Le solde de trésorerie est celui de la projection de la partie 7.</p>

  {pf_table('Flotte de départ', False)}
  {pf_table('Flotte recrutée', True)}

  <div class="h-serif" style="margin-top:14px">Comment les 15 M FCFA sont mobilisés</div>
  <p class="intro">Utilisation de la levée jusqu’au point bas de trésorerie, au mois {m_bas} : le démarrage et l’achat des véhicules absorbent la moitié de la levée, le reste demeure en réserve.</p>
  <div class="bar-label">Flotte recrutée <small>réserve au point bas : {mm(POINT_BAS_T, 1, False)}</small></div>
  {barre(invest, achats_m1, net_m1, POINT_BAS_T)}
  <div class="src">Turquoise : investissements de démarrage · orange : achat des véhicules de TamCar · violet : charges d’exploitation nettes des revenus des premiers mois · bleu : réserve restante.</div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------ 8.8
def ligne_sens(p):
    a, b = M.res(p, False), M.res(p, True)
    return tr(f'<strong>{taux(p)}</strong>', mm(a['point_bas']), mm(a['caisse_fin'][2]), mm(a['ebe'][1]), mm(b['point_bas']), mm(b['caisse_fin'][2]), mm(b['ebe'][1]))


pages.append(f'''<!-- ============================================================ 08 · p.8 · 8.8 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">08</span><h1>Charges d’exploitation et plan de financement <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">8.8 · Sensibilité et seuils de pilotage</div>

  <table class="tbl" style="margin-top:8px">
    <colgroup><col style="width:16%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:14%"></colgroup>
    <thead>
      <tr><th rowspan="2">Taux d’atteinte</th><th colspan="3">Flotte de départ</th><th colspan="3" class="tam">Flotte recrutée</th></tr>
      <tr><th>Point bas de la caisse</th><th>Caisse au mois 36</th><th>Excédent brut, an 2</th><th>Point bas de la caisse</th><th>Caisse au mois 36</th><th>Excédent brut, an 2</th></tr>
    </thead>
    <tbody>
      {''.join(ligne_sens(p) for p in TAUX)}
    </tbody>
  </table>

  <div class="row c-1-1 stretch" style="margin-top:12px">
    <div class="callout rouille">
      <strong>Marge de sécurité, flotte de départ.</strong> Excédent d’exploitation positif dès {pct(100 * SEUIL_S['ebe'], 0)} des planchers, résultat net positif dès
      {pct(100 * SEUIL_S['net'], 0)}, trésorerie positive sur 36 mois jusqu’à {pct(100 * SEUIL_S['caisse'], 0)}. À 70 %, la caisse ne tient pas ({mm(R70_S['point_bas'], 1)} au point bas) : l’entreprise consomme la levée.
    </div>
    <div class="callout vert">
      <strong>Marge de sécurité, flotte recrutée.</strong> {pct(100 * SEUIL_T['ebe'], 0)} pour l’excédent d’exploitation, {pct(100 * SEUIL_T['net'], 0)} pour le résultat net,
      {pct(100 * SEUIL_T['caisse'], 0)} pour la trésorerie : les voitures de tiers abaissent d’environ {round(100 * (SEUIL_S['ebe'] - SEUIL_T['ebe']))} points le seuil d’excédent, de {round(100 * (SEUIL_S['net'] - SEUIL_T['net']))} points celui du résultat et de {round(100 * (SEUIL_S['caisse'] - SEUIL_T['caisse']))} points celui de la trésorerie.
    </div>
  </div>

  <div class="h-serif ajout" style="margin-top:14px">Piloter l’encaissement : les seuils d’alerte</div>
  <p class="intro ajout-in">Le risque principal étant l’encaissement des versements et la vacance des véhicules, le tableau de bord mensuel suit un <strong>taux d’encaissement des planchers</strong> (versements encaissés divisés par versements dus) et le nombre de voitures recrutées.</p>
  <table class="tbl ajout" style="margin-top:6px">
    <colgroup><col style="width:30%"><col style="width:30%"><col style="width:40%"></colgroup>
    <thead><tr><th>Indicateur</th><th>Seuil d’alerte</th><th>Décision</th></tr></thead>
    <tbody>
      {tr('Taux d’encaissement des planchers<small>moyenne mensuelle</small>', f'Sous 90 %, puis sous 80 % (excédent négatif sous {pct(100 * SEUIL_T["ebe"], 0)})', 'Vigilance, puis plan correctif : recouvrement, remplacement de conducteurs, recrutement de voitures de tiers (10.9)')}
      {tr('Voitures de tiers recrutées', f'Moins de {CUM6} au mois 6 ; moins de {NT} au mois 12', 'Intensifier le recrutement ; différer les dépenses non essentielles')}
      {tr('Dette d’un conducteur', 'Plus de 5 000 F', 'Mise en ligne bloquée jusqu’à la recharge (6.3)')}
      {tr('Poste vacant', 'Plus de 21 jours', 'Recrutement prioritaire ; coût de la cotisation avancée suivi (8.3)')}
      {tr('Trésorerie', 'Sous 8 M FCFA après le mois 12', 'Gel des dépenses de développement ; revue du plan avec l’investisseur')}
    </tbody>
  </table>
  <div class="src ajout">Les seuils d’alerte sont tirés du modèle ; ils sont ajustés sur les données réelles après les premiers mois.</div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

# ------------------------------------------------------------ 8.9
pages.append(f'''<!-- ============================================================ 08 · p.9 · 8.9 -->
<section class="page" data-filigrane="TamCar">
  <div class="sec-head"><span class="num">08</span><h1>Charges d’exploitation et plan de financement <small>(suite)</small></h1></div>

  <div class="h-serif" style="margin-top:14px">8.9 · Conclusion et conditions retenues</div>

  <div class="hero" style="margin-top:12px; padding:22px 26px">
    <span class="pill">Conclusion</span>
    <div class="cols2" style="margin-top:8px">
      <p style="text-align:left">
        TamCar fonctionne avec une structure légère : environ <strong>{n(M.phase_gen(25, 36, True)['ch'])} FCFA de charges
        mensuelles</strong> à régime établi avec les voitures de tiers ({n(M.phase_gen(25, 36, False)['ch'])} F pour la flotte de départ), dont plus de la moitié pour l’équipe. Les véhicules
        de TamCar sont payés par la part qu’ils lui rapportent ; les voitures n’engagent aucun capital.
      </p>
      <p style="text-align:left">
        Avec 15 M FCFA de levée, le point bas de trésorerie est de {mm(POINT_BAS_T, 1, False)} au mois {MOIS_BAS_T} et la trésorerie ne devient jamais négative, planchers atteints.
        Le seuil de pilotage est net : excédent d’exploitation positif dès {pct(100 * SEUIL_S['ebe'], 0)} des planchers pour la flotte de départ,
        {pct(100 * SEUIL_T['ebe'], 0)} avec les six voitures de tiers.
      </p>
    </div>
  </div>

  <div class="rule-label" style="margin-top:16px">Conditions retenues</div>
  <div class="row c-1-1 stretch" style="margin-top:8px">
    <div class="tile">
      <div class="ico">{{{{ico:briefcase}}}}</div>
      <h4>Achat et conformité</h4>
      <ul class="liste" style="margin-top:0">
        <li>tricycle payé 30 % à la commande puis sur 12 mois sans intérêt, à confirmer avec le fournisseur ; motos payées comptant ;</li>
        <li>prix de {n(M.PRIX_TRICYCLE)} F par tricycle et de {n(M.PRIX_MOTO)} F par moto maintenus ;</li>
        <li>véhicules de TamCar neufs, vendus avec la garantie du fournisseur : entretien et réparations à la charge du conducteur ;</li>
        <li>ANATT : autorisation de 300 000 F au démarrage, puis 280 000 F à chaque renouvellement annuel ; trackers certifiés payés chaque année d’avance.</li>
      </ul>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:landmark}}}}</div>
      <h4>Cession, partenaires et fiscalité</h4>
      <ul class="liste" style="margin-top:0">
        <li>cession : 12 mois pour la moto, 24 mois pour le tricycle, 36 mois pour l’Essentiel, 48 mois pour le Confort, sans paiement supplémentaire ;</li>
        <li>voitures d’Afrik Group : mise à disposition formalisée dans le contrat partenaire ; assurance, tracker et entretien à leur charge ;</li>
        <li>impôt minimum ({n(M.h('B49'))} F par an) et patente chiffrés en 8.3, sans aucune exonération : {n(M.cat_total('impots'))} F sur 36 mois ;</li>
        <li>au minimum six voitures de tiers recrutées du mois 4 au mois 12 ; frais d’entrée de {n(M.FRAIS_ENTREE)} F par véhicule.</li>
      </ul>
    </div>
  </div>

  <div class="callout ajout" style="margin-top:14px">
    <strong>Ce que le plan ne chiffre pas.</strong> L’écart entre la garantie TamAssur et la valeur de rachat du contrat NSIA aux paliers de 36 mois et au-delà (le plan chiffre le premier palier, 12 ou 24 mois), le coût d’un second responsable des opérations au-delà de 5 M F de volume mensuel, l’amortissement comptable de l’apport en nature de la
    plateforme, les frais FeexPay et les revenus de services complémentaires (TamPass), qui s’ajouteraient aux revenus du plan. L’engagement TamAssur sera
    confirmé par écrit avec NSIA avant le lancement.
  </div>

  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>
</section>
''')

(ICI / 'partie8.html').write_text('\n'.join(pages), encoding='utf-8')
print('partie8.html :', len(pages), 'pages')
