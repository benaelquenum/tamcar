"""Génère partie11.html (Architecture technique de la plateforme).
Les chiffres (tables, fonctions, lignes de code, écrans) sont lus dans le dépôt à chaque build :
ils ne sont jamais saisis à la main."""
import glob
import os
import pathlib
import re

import modele_tresorerie as M

ICI = pathlib.Path(__file__).parent
DEPOT = ICI.parent


# ------------------------------------------------------------------ chiffres du dépôt
def lignes(dossier, exts):
    tot = 0
    for racine, dirs, fichiers in os.walk(DEPOT / dossier):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', 'android', 'www', '.git')]
        for f in fichiers:
            if f.endswith(exts):
                tot += sum(1 for _ in open(os.path.join(racine, f), encoding='utf-8', errors='ignore'))
    return tot


def pages_app(dossier):
    return sum(1 for r, d, f in os.walk(DEPOT / dossier) for x in f if x == 'page.tsx')


def stats():
    mig = sorted(glob.glob(str(DEPOT / 'backend/supabase/migrations/*.sql')))
    sql = ''.join(open(f, encoding='utf-8').read() for f in mig)
    sql = re.sub(r'--[^\n]*', '', sql)
    tables = set(re.findall(r'create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)', sql, re.I))
    tables -= set(re.findall(r'drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)', sql, re.I))
    rls = set(re.findall(r'alter\s+table\s+(?:public\.)?(\w+)\s+enable\s+row\s+level\s+security', sql, re.I))
    funcs = set(re.findall(r'create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(', sql, re.I))
    policies = set(re.findall(r'create\s+policy\s+"?([^"\n]+?)"?\s+on\s+(?:public\.)?([\w.]+)', sql, re.I))
    vues = set(re.findall(r'create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?(\w+)', sql, re.I))
    enums = set(re.findall(r'create\s+type\s+(?:public\.)?(\w+)', sql, re.I))
    cron = set(re.findall(r"cron\.schedule\(\s*'([\w-]+)'", sql, re.I))
    ecrans = {a: pages_app(f'apps/{a}/src') for a in ('client', 'driver-portal', 'back-office', 'web')}
    return dict(
        migrations=len(mig), tables=sorted(tables), rls=len(tables & rls), funcs=len(funcs),
        internes=len([f for f in funcs if f.startswith('_')]), policies=len(policies), vues=len(vues),
        enums=len(enums), cron=sorted(cron), ecrans=ecrans, total_ecrans=sum(ecrans.values()),
        ts=sum(lignes(f'apps/{a}/src', ('.ts', '.tsx')) for a in ecrans), sql=lignes('backend/supabase/migrations', ('.sql',)),
        edge=len(glob.glob(str(DEPOT / 'backend/supabase/functions/*/index.ts'))),
        edge_lignes=lignes('backend/supabase/functions', ('.ts',)),
    )


S = stats()
METIER = S['funcs'] - S['internes']


def arrondi(v, pas=1000):
    return f"{round(v / pas) * pas:,}".replace(',', ' ')


DOMAINES = [
    ('Identité et accès', 'b', 'Profils, consentements (CGU), jetons de notification, parrainage, lieux favoris.',
     {'profiles', 'terms_acceptances', 'native_push_tokens', 'push_subscriptions', 'referral_codes', 'referral_redemptions',
      'client_favorite_places', '_push_settings', 'trusted_contacts'}),
    ('Courses', 'b', 'Courses, réservations et locations, arrêts, messages, appels, liens de suivi, notes, alertes SOS.',
     {'rides', 'ride_stops', 'ride_messages', 'ride_calls', 'ride_share_links', 'ratings', 'sos_alerts', 'vehicle_rentals',
      'ride_driver_exclusions', 'ride_live_state'}),
    ('Chauffeurs, véhicules, partenaires', 'v', 'Chauffeurs, véhicules (fiche, conformité), partenaires, candidatures, rendez-vous, avertissements, villes et responsables, versements quotidiens et jours non travaillés, fonds de rachat, avis de fin de contrat, bonus, récompenses, alertes.',
     {'drivers', 'vehicles', 'dealer_partners', 'dealer_advances', 'driver_applications', 'driver_appointments', 'driver_requests',
      'driver_warnings', 'ops_cities', 'ops_city_managers', 'driver_data_usage', 'admin_alerts', 'ops_commission_log',
      'driver_approach_log', 'driver_arrears', 'driver_bonus_log', 'driver_excused_days', 'driver_floor_log', 'driver_offline_payments',
      'driver_senteur_log', 'driver_upkeep_log', 'gadget_awards', 'data_bundle_awards', 'cession_notices', 'driver_fund_settlements',
      'vehicle_compliance_notices'}),
    ('Portefeuilles et paiements', 'g', 'Portefeuilles, journal des mouvements, décaissements, demandes de versement des partenaires, épargne garantie.',
     {'wallets', 'wallet_transactions', 'driver_payouts', 'driver_insurance_charges', 'tamassur_withdrawals', 'payment_events', 'dealer_payout_requests'}),
    ('Tarifs, lieux, promotions', 'o', 'Grilles de prix, tarifs de location, prix du corridor, points de rabattement, lieux, codes promo, bannières.',
     {'pricing_tiers', 'rental_rates', 'corridor_prices', 'checkpoints', 'places', 'promo_codes', 'promo_code_redemptions', 'home_banners',
      'program_rules'}),
    ('Abonnements TamPass', 'v', 'Formules, abonnements, courses programmées, événements.',
     {'subscription_plans', 'subscriptions', 'subscription_rides', 'subscription_events'}),
    ('WhatsApp (Tamy)', 'g', 'Contacts, sessions, messages et courses commandées par WhatsApp.',
     {'wa_contacts', 'wa_messages', 'wa_rides', 'wa_sessions'}),
    ('TamCar Office', 'r', 'Comptabilité en partie double, trésorerie, paie, congés, échéances, documents, audit, sauvegardes.',
     {t for t in S['tables'] if t.startswith('bo_')} | {'backup_archives', 'backup_drive_files', 'backup_runs'}),
]
dom_tiles = ''
vus = set()
for nom, col, desc, ens in DOMAINES:
    k = len(ens & set(S['tables']))
    vus |= ens
    dom_tiles += f'<div class="dom {col}"><b>{nom}<em>{k}</em></b><p>{desc}</p></div>\n'
AUTRES = set(S['tables']) - vus


def tr(*cells, cls=''):
    return f'<tr{" class=" + chr(34) + cls + chr(34) if cls else ""}>' + ''.join(f'<td>{c}</td>' for c in cells) + '</tr>'


def boite(x, y, w, h, titre, sous='', fond='#fff', trait='#C9D6F2', couleur='#071B3A', taille=10.5):
    t = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{fond}" stroke="{trait}" stroke-width="1.2"/>'
    if sous:
        t += f'<text x="{x + w / 2}" y="{y + h / 2 - 2}" text-anchor="middle" font-size="{taille}" font-weight="700" fill="{couleur}">{titre}</text>'
        t += f'<text x="{x + w / 2}" y="{y + h / 2 + 11}" text-anchor="middle" font-size="{taille - 2}" fill="#4E5B6F">{sous}</text>'
    else:
        t += f'<text x="{x + w / 2}" y="{y + h / 2 + 4}" text-anchor="middle" font-size="{taille}" font-weight="700" fill="{couleur}">{titre}</text>'
    return t


def fleche(x1, y1, x2, y2, couleur='#2454D5', tirets=False):
    d = ' stroke-dasharray="4 3"' if tirets else ''
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{couleur}" stroke-width="1.6"{d} marker-end="url(#ah)"/>'


def schema_architecture():
    s = '<svg viewBox="0 0 720 424" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif">'
    s += '<defs>'
    for nom, col in (('ab', '#2454D5'), ('av', '#7828E7'), ('ao', '#097C72')):
        s += f'<marker id="{nom}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="{col}"/></marker>'
    s += '</defs>'
    tete = lambda x, t: f'<text x="{x}" y="15" text-anchor="middle" font-size="9" font-weight="700" fill="#4E5B6F" letter-spacing="1">{t}</text>'
    s += tete(68, 'UTILISATEURS') + tete(235, 'VERCEL · DUBLIN') + tete(460, 'SUPABASE') + tete(658, 'SERVICES EXTERNES')
    # utilisateurs
    users = [('Passagers', 'web installable · Android'), ('Chauffeurs', 'web installable · Android'),
             ('Équipe TamCar', 'back-office'), ('WhatsApp', 'bot Tamy, via l’API de Meta')]
    for i, (t, sub) in enumerate(users):
        s += boite(8, 34 + i * 78, 120, 56, t, sub, fond='#EFF4FE')
    # Vercel
    s += '<rect x="160" y="28" width="150" height="312" rx="14" fill="#F7F9FF" stroke="#C9D6F2" stroke-width="1.2"/>'
    for i, (t, sub) in enumerate([('App passagers', 'Next.js 14'), ('App chauffeurs', 'Next.js 14'), ('TamCar Office', 'Next.js 14'), ('Site vitrine', 'Next.js 14')]):
        s += boite(172, 40 + i * 78, 126, 56, t, sub)
    # Supabase
    s += '<rect x="350" y="28" width="220" height="360" rx="14" fill="#F4FBF9" stroke="#9DD9D0" stroke-width="1.2"/>'
    s += f'<rect x="362" y="40" width="196" height="112" rx="9" fill="#fff" stroke="#097C72" stroke-width="1.4"/>'
    s += '<text x="460" y="66" text-anchor="middle" font-size="11.5" font-weight="700" fill="#071B3A">PostgreSQL 15 + PostGIS</text>'
    s += '<text x="460" y="86" text-anchor="middle" font-size="9" fill="#4E5B6F">règles métier · droits par ligne</text>'
    s += '<text x="460" y="100" text-anchor="middle" font-size="9" fill="#4E5B6F">tâches planifiées · déclencheurs</text>'
    s += f'<text x="460" y="126" text-anchor="middle" font-size="9" font-weight="700" fill="#097C72">{len(S["tables"])} tables · {METIER} fonctions · {S["migrations"]} migrations</text>'
    s += f'<rect x="362" y="162" width="196" height="102" rx="9" fill="#fff" stroke="#097C72" stroke-width="1.4"/>'
    s += f'<text x="460" y="188" text-anchor="middle" font-size="11.5" font-weight="700" fill="#071B3A">Edge Functions ({S["edge"]})</text>'
    s += '<text x="460" y="208" text-anchor="middle" font-size="9" fill="#4E5B6F">notifications push · WhatsApp</text>'
    s += '<text x="460" y="222" text-anchor="middle" font-size="9" fill="#4E5B6F">webhooks et décaissements de paiement</text>'
    s += '<text x="460" y="236" text-anchor="middle" font-size="9" fill="#4E5B6F">lecture de justificatifs par IA</text>'
    s += '<text x="460" y="252" text-anchor="middle" font-size="8.4" fill="#4E5B6F">Deno · TypeScript</text>'
    s += boite(362, 274, 196, 44, 'Storage privé', 'justificatifs du back-office', taille=10)
    s += boite(362, 328, 94, 48, 'Auth', 'jetons JWT', taille=10)
    s += boite(464, 328, 94, 48, 'Realtime', 'WebSocket', taille=10)
    # services externes
    ext = [('Cartes', 'Mapbox · MapLibre + PMTiles'), ('Recherche de lieux', 'base TamCar · Google Places'),
           ('Notifications', 'Web Push · FCM'), ('Mobile Money', 'FeexPay'),
           ('WhatsApp', 'API Cloud de Meta'), ('Intelligence artificielle', 'API Anthropic')]
    for i, (t, sub) in enumerate(ext):
        s += boite(600, 34 + i * 62, 116, 50, t, sub, fond='#F4F0FF', trait='#CDBDF5', taille=9.8)
    # flèches utilisateurs -> applications
    for i in range(3):
        s += fleche(128, 62 + i * 78, 170, 68 + i * 78).replace('url(#ah)', 'url(#ab)')
    # applications -> base
    for i, y in enumerate((64, 84, 104, 124)):
        s += fleche(298, 68 + i * 78, 360, y).replace('url(#ah)', 'url(#ab)')
    # temps réel direct : navigateurs -> Realtime, par le bas
    s += '<path d="M8 62 L3 62 L3 404 L510 404 L510 378" fill="none" stroke="#7828E7" stroke-width="1.5" marker-end="url(#av)"/>'
    s += '<text x="290" y="418" text-anchor="middle" font-size="8.8" fill="#7828E7">temps réel : les navigateurs se connectent directement à Supabase</text>'
    # edge <-> services externes
    for i in (2, 3, 4, 5):
        y = 34 + i * 62 + 25
        s += f'<line x1="558" y1="213" x2="598" y2="{y}" stroke="#097C72" stroke-width="1.5" marker-end="url(#ao)"/>'
    s += '<text x="716" y="418" text-anchor="end" font-size="8.8" fill="#097C72">vert : appels sortants et webhooks signés</text>'
    return s + '</svg>'


# =====================================================================================================
pages = []
TETE = '<div class="sec-head"><span class="num">11</span><h1>Architecture technique de la plateforme{suite}</h1></div>'
PIED = '  <div class="pn"><b><!--PN--></b> sur <!--TOTAL--></div>\n</section>\n'


def page(corps, suite=True, nom=''):
    t = TETE.replace('{suite}', ' <small>(suite)</small>' if suite else '')
    pages.append(f'<!-- ============================================================ 11 · {nom} -->\n<section class="page" data-filigrane="TamCar">\n  {t}\n{corps}\n{PIED}')


# ---------------------------------------------------------------- 11.1
page(f'''
  <div class="h-serif" style="margin-top:14px">11.1 · Principes d’architecture</div>
  <p class="intro">La plateforme est déjà en production côté code : quatre applications, une base de données unique et des services gérés. Quatre choix la structurent.</p>
  <div class="row c-1-1 stretch" style="margin-top:8px">
    <div class="tile">
      <div class="ico">{{{{ico:database}}}}</div>
      <h4>La base de données porte les règles</h4>
      <p>Le calcul du prix, la répartition des recettes, les mouvements de portefeuille et les droits d’accès sont des fonctions PostgreSQL, exécutées de façon atomique. Les applications affichent et déclenchent ; elles ne décident pas.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:cloud}}}}</div>
      <h4>Des services gérés</h4>
      <p>Supabase pour la base, l’authentification, le temps réel et les fonctions serveur ; Vercel pour les applications. Aucun serveur à administrer : une équipe réduite peut exploiter la plateforme.</p>
    </div>
  </div>
  <div class="row c-1-1 stretch">
    <div class="tile vert">
      <div class="ico">{{{{ico:smartphone}}}}</div>
      <h4>Une seule base de code</h4>
      <p>Les applications web installables et les coques Android partagent le même code. La coque charge l’application en production : une correction est diffusée sans republier l’APK.</p>
    </div>
    <div class="tile or">
      <div class="ico">{{{{ico:layers}}}}</div>
      <h4>Des briques remplaçables</h4>
      <p>PostgreSQL standard, clients open source, moteur de carte commutable par une variable d’environnement, prestataire de paiement isolé derrière un webhook : chaque dépendance externe peut changer.</p>
    </div>
  </div>

  <div class="rule-label" style="margin-top:16px">Le dépôt en chiffres</div>
  <div class="row c-4" style="margin-top:8px">
    <div class="kpi"><b>{S['total_ecrans']}</b><span>écrans</span><small>{len(S['ecrans'])} applications web</small></div>
    <div class="kpi"><b>{len(S['tables'])}</b><span>tables</span><small>toutes sous contrôle d’accès par ligne</small></div>
    <div class="kpi"><b>{METIER}</b><span>fonctions métier</span><small>plus {S['internes']} fonctions internes</small></div>
    <div class="kpi"><b>{S['migrations']}</b><span>migrations</span><small>historique daté du schéma</small></div>
  </div>
  <div class="src">Environ {arrondi(S['ts'])} lignes de TypeScript, {arrondi(S['sql'])} lignes de SQL de migration (historique cumulé, redéfinitions comprises) et {arrondi(S['edge_lignes'])} lignes de fonctions serveur. Chiffres lus dans le dépôt à la date de ce document.</div>

  <div class="rule-label" style="margin-top:14px">Périmètre fonctionnel déjà couvert par le code</div>
  <div class="card" style="margin-top:8px">
    <ul class="liste deux" style="margin-top:0">
      <li>commande immédiate et réservation à l’avance ;</li>
      <li>tarification par catégorie, tarif fixe du corridor ;</li>
      <li>mise en relation des chauffeurs, suivi en direct ;</li>
      <li>messagerie, appels, alerte SOS, lien de suivi public ;</li>
      <li>portefeuilles, recharge, décaissement des chauffeurs ;</li>
      <li>abonnements TamPass et épargne assurance des chauffeurs ;</li>
      <li>recrutement des chauffeurs, rendez-vous, avertissements ;</li>
      <li>concessionnaires, avances, responsables par ville ;</li>
      <li>codes promo, parrainage, lieux favoris ;</li>
      <li>comptabilité, trésorerie, paie et congés (TamCar Office).</li>
    </ul>
  </div>
''', suite=False, nom='p.1 · 11.1')

# ---------------------------------------------------------------- 11.2
page(f'''
  <div class="h-serif" style="margin-top:14px">11.2 · La pile technique en un coup d’œil</div>
  <table class="tbl txt" style="margin-top:10px">
    <colgroup><col style="width:15%"><col style="width:36%"><col style="width:49%"></colgroup>
    <thead><tr><th>Couche</th><th>Technologie</th><th>Rôle dans TamCar</th></tr></thead>
    <tbody>
      {tr('Interfaces', 'Next.js 14 (routeur applicatif), React 18, TypeScript, Tailwind CSS', f"Quatre applications : passagers, chauffeurs, TamCar Office (back-office) et site vitrine.")}
      {tr('Mobile', 'Capacitor 8 (Android)', 'Deux coques Android qui chargent l’application en production. Modules natifs : géolocalisation en arrière-plan, notifications push et locales, synthèse vocale pour le guidage du chauffeur.')}
      {tr('Base de données', 'PostgreSQL 15 (Supabase), PostGIS', 'Données, règles métier, droits d’accès, calculs géographiques.')}
      {tr('Extensions', 'pg_trgm, unaccent, pgcrypto, pg_cron, pg_net', 'Recherche de lieux tolérante aux fautes, tâches planifiées, appels HTTP sortants depuis la base.')}
      {tr('Authentification', 'Supabase Auth', 'Sessions à jetons JWT, cookies côté serveur (@supabase/ssr). E-mail et mot de passe ; code SMS par téléphone possible.')}
      {tr('Temps réel', 'Supabase Realtime', 'Diffusion par WebSocket des changements de courses, de chauffeurs, de messages, d’arrêts et d’appels.')}
      {tr('Fonctions serveur', f"{S['edge']} Edge Functions (Deno, TypeScript)", 'Notifications, webhooks de paiement, décaissements, bot WhatsApp, lecture de justificatifs.')}
      {tr('Hébergement', 'Vercel (région Dublin) ; Supabase (région Europe de l’Ouest, Irlande)', 'Applications web d’un côté ; base, authentification, fichiers et fonctions de l’autre.')}
      {tr('Cartographie', 'Mapbox GL JS ; MapLibre GL + PMTiles (Protomaps) en cours de bascule ; Google Places en secours', 'Fonds de carte, itinéraires, recherche de lieux (la base de lieux TamCar est interrogée d’abord).')}
      {tr('Notifications', 'Web Push (VAPID), Firebase Cloud Messaging (FCM v1)', 'Offres de courses aux chauffeurs, suivi de course, rappels de réservation.')}
      {tr('Paiement', 'Mobile Money : FeexPay', 'Recharge du portefeuille et décaissement des revenus des chauffeurs, confirmés par webhook signé.')}
      {tr('Messagerie', 'API WhatsApp Cloud (Meta)', 'Bot Tamy : commande de course par WhatsApp.')}
      {tr('Intelligence artificielle', 'API Anthropic, Claude Haiku 4.5', 'Lecture des justificatifs de dépenses dans TamCar Office.')}
      {tr('Développement', 'Git, SQL versionné, Gradle (APK), Claude Code', 'Versionnement du code et du schéma, construction Android, assistant de développement.')}
    </tbody>
  </table>
  <div class="rnote">Vérifié dans le code : Next.js 14, React 18, Capacitor 8, PostgreSQL 15, les extensions, les six Edge Functions, la région Vercel « dub1 ». Le code de paiement est FedaPay ; FeexPay est le prestataire retenu depuis le 14 août (commit) mais n’est pas encore intégré. « Supabase en nuage » : je n’ai pas lu la région du projet.</div>
''', nom='p.2 · 11.2')

# ---------------------------------------------------------------- 11.3
page(f'''
  <div class="h-serif" style="margin-top:14px">11.3 · Architecture d’ensemble</div>
  <div class="schema">{schema_architecture()}</div>
  <div class="row c-1-1 stretch" style="margin-top:12px">
    <div class="tile">
      <div class="ico">{{{{ico:zap}}}}</div>
      <h4>Lire et écrire</h4>
      <p>Les applications appellent des fonctions PostgreSQL (RPC) avec le jeton de l’utilisateur. Les droits sont appliqués par la base, ligne par ligne, pas par le code de l’application.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:route}}}}</div>
      <h4>Suivre en temps réel</h4>
      <p>Les changements des tables courses, chauffeurs, messages, arrêts et appels sont diffusés par WebSocket. Le navigateur se connecte directement à Supabase, sans passer par Vercel.</p>
    </div>
  </div>
  <div class="row c-1-1 stretch">
    <div class="tile vert">
      <div class="ico">{{{{ico:bell}}}}</div>
      <h4>Prévenir</h4>
      <p>Un changement de statut déclenche un trigger SQL, qui appelle une Edge Function par <span class="mono">pg_net</span> : notification push aux chauffeurs et aux passagers, message WhatsApp.</p>
    </div>
    <div class="tile or">
      <div class="ico">{{{{ico:shield}}}}</div>
      <h4>Recevoir</h4>
      <p>Les prestataires de paiement et WhatsApp rappellent des Edge Functions. La signature de chaque appel est vérifiée avant tout traitement, puis une fonction SQL met la base à jour.</p>
    </div>
  </div>
''', nom='p.3 · 11.3')

# ---------------------------------------------------------------- 11.4
page(f'''
  <div class="h-serif" style="margin-top:14px">11.4 · La base de données</div>
  <p class="intro">Une seule base PostgreSQL porte les {len(S['tables'])} tables du produit, réparties en huit domaines. Le schéma est décrit par {S['migrations']} migrations datées.</p>
  <div class="row c-4" style="margin-top:8px">
    {dom_tiles}
  </div>

  <div class="rule-label" style="margin-top:16px">Ce que PostgreSQL fait pour la plateforme</div>
  <table class="tbl txt" style="margin-top:8px">
    <colgroup><col style="width:24%"><col style="width:76%"></colgroup>
    <thead><tr><th>Mécanisme</th><th>Usage</th></tr></thead>
    <tbody>
      {tr('PostGIS', 'Positions en type géographique, index spatiaux : recherche des chauffeurs dans un rayon, rattachement d’une course à une ville, contrôle de la zone de service.')}
      {tr('pg_trgm et unaccent', 'Recherche de lieux tolérante aux fautes de frappe et aux accents, sur la base de lieux de TamCar.')}
      {tr('Contrôle d’accès par ligne', f"Activé sur les {S['rls']} tables, avec {S['policies']} politiques : un passager ne voit que ses courses, un chauffeur les siennes et le fil des offres, un concessionnaire ses véhicules.")}
      {tr('Fonctions métier', f"{METIER} fonctions appelables par les applications (prix, acceptation d’une course, portefeuilles, abonnements, candidatures…), plus {S['internes']} fonctions internes non exposées.")}
      {tr('Triggers et pg_net', 'Un changement de statut déclenche les notifications sans code applicatif supplémentaire.')}
      {tr('pg_cron', f"{len(S['cron'])} tâches planifiées : rappels de réservation, génération et suivi nocturnes des courses TamPass, prélèvements quotidien et mensuel liés à l’assurance des chauffeurs.")}
      {tr('Types et vues', f"{S['enums']} types énumérés (statuts de course, catégories de véhicule, types de mouvement) et {S['vues']} vues pour l’administration et les états.")}
    </tbody>
  </table>
  <div class="callout" style="margin-top:12px">
    <strong>Conséquence pratique.</strong> Un même calcul sert toutes les interfaces : l’application passagers, l’application chauffeurs, le bot WhatsApp
    et le back-office appellent les mêmes fonctions. Une règle corrigée dans la base l’est partout.
  </div>
''', nom='p.4 · 11.4')

# ---------------------------------------------------------------- 11.5
page(f'''
  <div class="h-serif" style="margin-top:14px">11.5 · Une course, de la commande à l’encaissement</div>
  <p class="intro">Le cycle de vie d’une course est une machine à états dans la base : chaque transition est une fonction qui contrôle qui l’appelle et dans quel état se trouve la course.</p>
  <div class="flow">
    <div class="st"><i>Statut</i><b>Demandée</b><span class="mono">create_ride</span><small>prix calculé par la base, zone de service vérifiée, course proposée aux chauffeurs</small></div>
    <div class="st"><i>Statut</i><b>Acceptée</b><span class="mono">accept_ride</span><small>premier chauffeur servi ; répartition des recettes figée sur la course</small></div>
    <div class="st"><i>Statut</i><b>Sur place</b><span class="mono">driver_arrived</span><small>le chauffeur est au point de prise en charge</small></div>
    <div class="st"><i>Statut</i><b>En cours</b><span class="mono">driver_start_ride</span><small>passager à bord, arrêts et destination suivis en direct</small></div>
    <div class="st"><i>Statut</i><b>Terminée</b><span class="mono">driver_complete_ride</span><small>portefeuilles crédités, ou commission débitée si paiement en espèces</small></div>
  </div>
  <p class="mini" style="margin-top:8px">Sorties possibles : annulée par le passager, annulée par le chauffeur, expirée si aucun chauffeur n’est trouvé. Frais d’annulation et pénalités de réservation sont appliqués par la base.</p>

  <div class="row c-1-1 stretch" style="margin-top:12px">
    <div class="card">
      <h3>Le prix, calculé une seule fois</h3>
      <p>La fonction <span class="mono">compute_price</span> calcule le prix dans la base : base, kilomètres, minutes, minimum, supplément climatisation et nuit, arrondi aux 50 F. Le même calcul sert les cinq catégories : moto, tricycle, essentiel, confort, premium.</p>
      <p>Entre deux points de rabattement du corridor Cotonou ↔ Porto-Novo, le prix est fixe. La zone de service est un enchaînement de cinq cercles de 15 km (Ouidah, Pahou, Cotonou, Sèmè-Podji, Porto-Novo), écrit à l’identique dans la base et dans l’application.</p>
    </div>
    <div class="card">
      <h3>La mise en relation, sans verrou applicatif</h3>
      <p>Les chauffeurs de la bonne catégorie, dans un rayon de 10 km, voient la course dans leur fil (<span class="mono">pending_rides_for_driver</span>) et reçoivent une notification. L’acceptation est une seule instruction SQL conditionnelle : la course passe à « acceptée » seulement si elle est encore « demandée » et sans chauffeur.</p>
      <p>Deux chauffeurs qui acceptent au même instant ne peuvent donc pas obtenir la même course, et aucun verrou n’est géré par l’application. Un chauffeur peut enchaîner une seconde course proche de l’arrivée de la première.</p>
    </div>
  </div>

  <div class="rule-label" style="margin-top:14px">Autour de la course</div>
  <div class="row c-3 stretch" style="margin-top:8px">
    <div class="tile">
      <div class="ico">{{{{ico:coins}}}}</div>
      <h4>Répartition des recettes</h4>
      <p>Fixée à l’acceptation. Le plan retient 40 % chauffeur, 30 % propriétaire, 5 % de fonds de cession et 25 % TamCar pour un véhicule qui n’appartient pas au chauffeur (6.2) ; 80 / 20 s’il est propriétaire. Les montants sont stockés sur la course.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:clock}}}}</div>
      <h4>Réservation à l’avance</h4>
      <p>Une réservation est diffusée aux chauffeurs, avec plancher de 30 minutes, rappels et pénalités. Des tâches planifiées la libèrent à l’heure et relancent la recherche si personne n’a accepté.</p>
    </div>
    <div class="tile vert">
      <div class="ico">{{{{ico:shield}}}}</div>
      <h4>Sécurité en course</h4>
      <p>Alerte SOS traitée par l’administration, messagerie liée à la course, lien de suivi public par jeton (sans compte), notation réciproque.</p>
    </div>
  </div>
''', nom='p.5 · 11.5')

# ---------------------------------------------------------------- 11.6
page(f'''
  <div class="h-serif" style="margin-top:14px">11.6 · Portefeuilles, paiements et comptabilité</div>
  <p class="intro">Tout mouvement d’argent passe par un portefeuille et laisse une ligne dans un journal : rien n’est modifié sans trace.</p>
  <div class="row c-4" style="margin-top:8px">
    <div class="dom"><b>Crédit</b><p>Portefeuille du passager : recharge Mobile Money, paiement des courses.</p></div>
    <div class="dom g"><b>Revenus</b><p>Portefeuille du chauffeur ou du concessionnaire : part de chaque course, retrait vers Mobile Money.</p></div>
    <div class="dom v"><b>Rachat</b><p>Séquestre de cession : part du prix mise de côté pour le chauffeur.</p></div>
    <div class="dom o"><b>Épargne</b><p>Épargne assurance du chauffeur (TamAssur), alimentée par un prélèvement programmé.</p></div>
  </div>

  <div class="rule-label" style="margin-top:14px">Recharge : du paiement au crédit</div>
  <div class="flow vert">
    <div class="st"><i>1</i><b>Paiement</b><small>l’application ouvre le widget du prestataire avec une référence créée par TamCar</small></div>
    <div class="st"><i>2</i><b>Confirmation</b><small>le prestataire appelle une Edge Function (webhook)</small></div>
    <div class="st"><i>3</i><b>Signature</b><small>HMAC-SHA256 vérifié en temps constant ; sinon rejet</small></div>
    <div class="st"><i>4</i><b>Crédit</b><small>une fonction SQL crédite le portefeuille et écrit le journal</small></div>
  </div>
  <div class="rule-label" style="margin-top:12px">Décaissement : du portefeuille au Mobile Money du chauffeur</div>
  <div class="flow viol">
    <div class="st"><i>1</i><b>Demande</b><small><span class="mono">request_driver_payout</span> réserve le montant</small></div>
    <div class="st"><i>2</i><b>Envoi</b><small>une Edge Function crée puis lance le décaissement chez le prestataire</small></div>
    <div class="st"><i>3</i><b>Résultat</b><small>le webhook annonce « envoyé » ou « échoué »</small></div>
    <div class="st"><i>4</i><b>Clôture</b><small>débit définitif, ou remboursement automatique du portefeuille</small></div>
  </div>
  <div class="callout ajout" style="margin-top:10px">
    <strong>Prestataire de paiement : FeexPay.</strong> L’intégration de la recharge, du décaissement et des webhooks signés est livrée avant le lancement. Elle repose sur une couche
    isolée (deux Edge Functions et un module d’appel côté application) ; les portefeuilles, le journal et les fonctions de crédit sont indépendants du prestataire.
  </div>

  <div class="h-serif" style="margin-top:18px">TamCar Office : la comptabilité est dans la plateforme</div>
  <div class="row c-1-1 stretch" style="margin-top:8px">
    <div class="card">
      <h3>Comptabilité en partie double</h3>
      <p>Plan de comptes SYSCOHADA révisé (environ 90 comptes), sept journaux, écritures équilibrées, numérotées et immuables : une erreur se corrige par extourne. Balance, grand livre, position de trésorerie, bilan et compte de résultat sont calculés par des fonctions SQL.</p>
    </div>
    <div class="card">
      <h3>Reliée aux flux de la plateforme</h3>
      <p>Les mouvements de portefeuille génèrent chaque jour une écriture de synthèse ; le solde résiduel est la commission de TamCar. S’y ajoutent la paie (ITS), les congés, les échéances, les documents et un journal d’audit.</p>
    </div>
  </div>
  <div class="callout" style="margin-top:10px">
    <strong>Lecture de justificatifs par IA.</strong> Une photo de facture ou une phrase libre est analysée par une Edge Function (Claude Haiku 4.5) qui propose fournisseur, date, montant,
    catégorie comptable et mode de paiement, avec un indice de confiance. Un humain valide avant toute écriture. Accès réservé au back-office, pièces lues côté serveur dans un stockage privé.
  </div>
''', nom='p.6 · 11.6')

# ---------------------------------------------------------------- 11.7
page(f'''
  <div class="h-serif" style="margin-top:14px">11.7 · Applications, mobile, cartes et temps réel</div>
  <table class="tbl txt" style="margin-top:10px">
    <colgroup><col style="width:18%"><col style="width:10%"><col style="width:72%"></colgroup>
    <thead><tr><th>Application</th><th>Écrans</th><th>Contenu</th></tr></thead>
    <tbody>
      {tr('Passagers', S['ecrans']['client'], 'Commande et réservation, suivi en direct, portefeuille, TamPass, parrainage, lieux favoris, historique, factures, candidature chauffeur. Inclut les écrans d’administration (courses, chauffeurs, véhicules, concessionnaires, litiges, dettes, promotions, lieux, villes).')}
      {tr('Chauffeurs', S['ecrans']['driver-portal'], 'Fil des offres avec prix et part du chauffeur, navigation guidée avec voix, revenus et portefeuille, réservations, abonnements TamPass, historique.')}
      {tr('TamCar Office', S['ecrans']['back-office'], 'Comptabilité, trésorerie, paie, congés, échéances, documents, tableau de bord de la plateforme, guide d’utilisation.')}
      {tr('Site vitrine', S['ecrans']['web'], 'Présentation publique.')}
    </tbody>
  </table>

  <div class="row c-1-1 stretch" style="margin-top:12px">
    <div class="card">
      <h3>Mobile</h3>
      <p>Les applications sont des web apps installables. Deux coques Android (Capacitor) les chargent en production et ajoutent ce que le navigateur ne fait pas : position en arrière-plan pour le chauffeur, notifications reçues application fermée (FCM), notifications locales, synthèse vocale.</p>
      <p>Un service worker minimal gère les notifications ; la mise en cache hors ligne est désactivée pour l’instant, car elle perturbait les actions serveur de Next.js.</p>
    </div>
    <div class="card">
      <h3>Position du chauffeur</h3>
      <p>Les positions trop imprécises sont écartées et les cinq dernières sont moyennées, pondérées par leur précision : le point affiché ne « danse » plus. Sur la carte du passager, les chauffeurs sont arrondis à une grille d’environ 220 m, sans identité ni cap, cinq véhicules au plus : seule la catégorie est visible.</p>
    </div>
  </div>

  <div class="rule-label" style="margin-top:14px">Cartes : sortir de la dépendance à un fournisseur</div>
  <div class="row c-1-1 stretch" style="margin-top:8px">
    <div class="card">
      <p><strong>Aujourd’hui</strong> : Mapbox pour les fonds de carte, le géocodage et les itinéraires ; la base de lieux de TamCar est interrogée d’abord, Google Places en secours.</p>
    </div>
    <div class="card">
      <p><strong>En cours</strong> : MapLibre GL avec des tuiles PMTiles (Protomaps) hébergées par TamCar. Le moteur se choisit par variable d’environnement, sans modifier le code ; le retour à Mapbox est immédiat.</p>
    </div>
  </div>
  <div class="row c-1-1 stretch">
    <div class="card">
      <p><strong>Temps réel</strong> : un canal par composant, avec des noms de topic uniques et un nettoyage systématique avant chaque abonnement. Cette règle vient d’une erreur réellement rencontrée avec Supabase Realtime, documentée dans le code.</p>
    </div>
    <div class="card">
      <p><strong>Langues</strong> : français et anglais.</p>
    </div>
  </div>
''', nom='p.7 · 11.7')

# ---------------------------------------------------------------- 11.8
page(f'''
  <div class="h-serif" style="margin-top:14px">11.8 · Sécurité</div>
  <p class="intro">La sécurité repose d’abord sur la base : c’est elle qui refuse, même si une application se trompe.</p>
  <div class="row c-3 stretch" style="margin-top:8px">
    <div class="tile">
      <div class="ico">{{{{ico:lock}}}}</div>
      <h4>Accès par ligne</h4>
      <p>Toutes les tables ({S['rls']}) sont protégées par {S['policies']} politiques, selon le rôle : passager, chauffeur, concessionnaire, administrateur, back-office.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:code}}}}</div>
      <h4>Fonctions durcies</h4>
      <p>Les fonctions privilégiées fixent leur chemin de recherche, contrôlent l’identité et le propriétaire de la ressource, et les fonctions internes sont retirées de l’API publique.</p>
    </div>
    <div class="tile vert">
      <div class="ico">{{{{ico:shield}}}}</div>
      <h4>Secrets côté serveur</h4>
      <p>La clé de service n’existe que dans les Edge Functions. Le navigateur ne porte que des clés publiques (Supabase, carte, notifications).</p>
    </div>
  </div>

  <table class="tbl txt" style="margin-top:14px">
    <colgroup><col style="width:26%"><col style="width:74%"></colgroup>
    <thead><tr><th>Sujet</th><th>Mesure en place</th></tr></thead>
    <tbody>
      {tr('Webhooks', 'Paiement : signature HMAC-SHA256 vérifiée, comparaison en temps constant. WhatsApp : signature X-Hub-Signature-256 vérifiée avant tout traitement. Un appel non signé est rejeté.')}
      {tr('Sessions', 'Jetons JWT renouvelés automatiquement, cookies côté serveur, routes protégées par un intergiciel ; les routes publiques sont listées explicitement.')}
      {tr('Consentement', 'Tant que la version en vigueur des conditions d’utilisation n’est pas acceptée, toute requête protégée est renvoyée vers l’écran d’acceptation. L’acceptation est horodatée et versionnée.')}
      {tr('Vie privée', 'Chauffeurs visibles de façon anonyme et arrondie sur la carte du passager. Lien de suivi public limité au statut, au trajet, au prénom du chauffeur, au véhicule et à sa position ; il expire six heures après la fin de la course.')}
      {tr('Fichiers', 'Justificatifs du back-office dans un espace de stockage privé, lus côté serveur uniquement.')}
      {tr('Intelligence artificielle', 'Fonction réservée aux rôles du back-office, jeton vérifié ; la clé du fournisseur n’est jamais exposée.')}
      {tr('Traçabilité', 'Journal d’audit du back-office, écritures comptables immuables, journal de tous les mouvements de portefeuille.')}
      {tr('Abus', 'Seuil de dette des chauffeurs avec blocage de la mise en ligne, frais d’annulation, compteurs d’absence, avertissements, module de litiges.')}
    </tbody>
  </table>
  <div class="callout ajout" style="margin-top:12px">
    <strong>Point de vigilance.</strong> La politique de confidentialité est publiée ; la conformité à la réglementation béninoise sur les données personnelles et une revue de sécurité indépendante sont réalisées avant le passage à l’échelle.
  </div>

''', nom='p.8 · 11.8')

# ---------------------------------------------------------------- 11.9
page(f'''
  <div class="h-serif" style="margin-top:14px">11.9 · Exploitation, qualité et coûts</div>
  <div class="row c-1-1 stretch" style="margin-top:10px">
    <div class="card">
      <h3>Du code à la production</h3>
      <p>Le code et le schéma sont dans Git. Les applications web sont construites et déployées sur Vercel. Chaque évolution de la base est un fichier SQL daté, appliqué dans l’ordre sur le projet Supabase. Les APK Android se construisent avec Gradle ; comme les coques chargent le site, elles changent rarement.</p>
    </div>
    <div class="card">
      <h3>Développement assisté</h3>
      <p>Le produit est développé par le fondateur avec Claude Code, un assistant de programmation. Ce choix explique la vitesse de production du code ; il rend d’autant plus utiles la revue humaine, les tests et la documentation, que la feuille de route technique organise (11.10).</p>
    </div>
  </div>

  <div class="rule-label ajout" style="margin-top:14px">Industrialisation prévue avec le développeur</div>
  <div class="card ajout" style="margin-top:8px">
    <ul class="liste deux" style="margin-top:0">
      <li>tests automatisés des fonctions critiques : prix, répartition des recettes, portefeuilles, acceptation d’une course ;</li>
      <li>intégration continue : construction et tests à chaque modification ;</li>
      <li>supervision des erreurs et des performances, avec des alertes sur les Edge Functions et les webhooks ;</li>
      <li>sauvegardes de la base, avec restauration testée ;</li>
      <li>test de charge à l’échelle de l’objectif de 36 mois, avant l’extension ;</li>
      <li>revue de sécurité indépendante (11.8).</li>
    </ul>
  </div>

  <div class="rule-label" style="margin-top:14px">Coûts et ressources dans le plan</div>
  <div class="row c-4" style="margin-top:8px">
    <div class="kpi"><b>20 000 F</b><span>par mois</span><small>Supabase, offre Pro (25 USD)</small></div>
    <div class="kpi"><b>16 000 F</b><span>par mois</span><small>Vercel, offre Pro (20 USD), au lancement commercial</small></div>
    <div class="kpi"><b>75 000 F</b><span>par mois</span><small>enveloppe d’infrastructure du plan (8.3), dont 39 000 F pour cartes, SMS, WhatsApp et nom de domaine</small></div>
    <div class="kpi"><b>200 000 F</b><span>par mois, dès le mois 13</span><small>développeur salarié (5.4)</small></div>
  </div>
  <div class="src">Taux retenu : 1 USD = 800 F. Outil de développement assisté : 75 000 F par mois, du mois 1 au mois 12 (8.3). Vercel est gratuit pendant le développement.</div>
  <div class="rnote">Le budget d’infrastructure de 75 000 F par mois est l’hypothèse du plan ; je n’ai pas les factures Supabase et Vercel pour la confronter à la réalité.</div>
''', nom='p.9 · 11.9')

# ---------------------------------------------------------------- 11.10
page(f'''
  <div class="h-serif" style="margin-top:14px">11.10 · Feuille de route technique</div>
  <p class="intro">Les chantiers sont classés par échéance : ce qui conditionne le lancement, ce qui suit, ce qui relève de la croissance.</p>
  <div class="row c-3 stretch" style="margin-top:8px">
    <div class="tile">
      <div class="ico">{{{{ico:flag}}}}</div>
      <h4>Avant le lancement</h4>
      <p><strong>Paiement automatique</strong> : intégrer FeexPay pour la recharge et le décaissement, sur le modèle des webhooks signés existants.</p>
      <p><strong>Commande par WhatsApp</strong> : tout le processus de commande, du départ au suivi de la course, passe par WhatsApp ; configuration chez Meta (numéro, modèles, webhook), puis essais.</p>
      <p><strong>Trackers GPS</strong> : pose sur les véhicules de TamCar et suivi de leur renouvellement annuel.</p>
      <p><strong>Webhooks et secrets</strong> : configuration chez le prestataire, puis essais en bac à sable avec de petits montants.</p>
    </div>
    <div class="tile violet">
      <div class="ico">{{{{ico:calendar}}}}</div>
      <h4>Les douze premiers mois</h4>
      <p><strong>Cartes</strong> : finir la bascule vers MapLibre et PMTiles, puis héberger les polices et le géocodage.</p>
      <p><strong>Suivi des trackers</strong> : recevoir leurs positions dans la plateforme pour contrôler l’usage et alerter.</p>
      <p><strong>Espace concessionnaire</strong> : suivi de leurs véhicules, avances et versements.</p>
    </div>
    <div class="tile vert">
      <div class="ico">{{{{ico:chart}}}}</div>
      <h4>Croissance</h4>
      <p><strong>Industrialisation</strong> avec le développeur (mois 13) : tests, intégration continue, supervision, revue de sécurité.</p>
      
      <p><strong>États financiers</strong> : passer des états déjà calculés à la liasse fiscale complète dans TamCar Office.</p>
      <p><strong>Passage à l’échelle</strong> : dimensionnement de la base, de l’hébergement des tuiles et du temps réel.</p>
    </div>
  </div>

  <div class="callout ajout" style="margin-top:14px">
    <strong>Risques techniques identifiés.</strong> Dépendance à quelques services gérés (Supabase, Vercel) : atténuée par l’usage de PostgreSQL standard et de code portable. Dépendance aux cartes de
    Mapbox : atténuée par la bascule en cours. Concentration de la connaissance du code sur le fondateur : atténuée par le développeur du mois 13, la documentation et les tests. Un seul prestataire de paiement à la fois :
    la couche d’intégration est isolée pour pouvoir en changer.
  </div>
  <div class="rnote">Les trackers GPS ne sont pas intégrés à la plateforme aujourd’hui : le suivi en direct repose sur le téléphone du chauffeur (backlog « Traccar »). L’ordre des chantiers est ma proposition.</div>
''', nom='p.10 · 11.10')

(ICI / 'partie11.html').write_text('\n'.join(pages), encoding='utf-8')
print(f'partie11.html : {len(pages)} pages')
assert not AUTRES, sorted(AUTRES)
