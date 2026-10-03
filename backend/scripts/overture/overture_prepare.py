import duckdb, json, math, os, re, unicodedata, collections, difflib

HERE = os.path.dirname(os.path.abspath(__file__))
PARQ = os.path.join(HERE, 'overture_zone.parquet').replace('\\', '/')
OUTDIR = os.path.join(HERE, 'overture_sql')
os.makedirs(OUTDIR, exist_ok=True)
MIN_CONF = 0.5
MIN_CONF_NO_CATEGORY = 0.7
RELEASE = '2026-09-23.1'


def norm(s: str) -> str:
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'[^a-z0-9 ]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def hav(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ------------------------------------------------------------ données
existing = json.load(open(os.path.join(HERE, 'existing_places.json'), encoding='utf-8'))
for e in existing:
    e['n'] = e['name_normalized'] or norm(e['name'])
con = duckdb.connect()
cols = ['id', 'name', 'taxo', 'basic_category', 'taxo_root', 'confidence', 'lon', 'lat', 'address', 'locality', 'region', 'country', 'sources']
rows = [dict(zip(cols, r)) for r in con.execute(f"select {', '.join(cols)} from '{PARQ}'").fetchall()]
stats = collections.OrderedDict()
stats['lieux Overture dans la zone'] = len(rows)


def _dec(x):
    t = repr(float(x))
    return len(t.split('.')[1]) if '.' in t else 0


# Positions de remplacement (centre d'un quartier ou d'une ville) : coordonnées partagées par au moins 3 lieux,
# ou arrondies à 4 décimales ou moins. Un chauffeur y serait envoyé au mauvais endroit : on les écarte.
_g = collections.Counter((round(r['lat'], 5), round(r['lon'], 5)) for r in rows)
_n = len(rows)
rows = [r for r in rows if _g[(round(r['lat'], 5), round(r['lon'], 5))] < 3 and not (_dec(r['lat']) <= 4 and _dec(r['lon']) <= 4)]
stats['positions de remplacement écartées'] = _n - len(rows)

# ------------------------------------------------------------ filtres de qualité
rows = [r for r in rows if r['country'] != 'NG']
stats['après retrait du Nigeria'] = len(rows)
rows = [r for r in rows if r['name'] and len(norm(r['name'])) >= 2 and not re.fullmatch(r'[\d\s\-_.]+', r['name'])]
stats['après retrait des noms vides ou numériques'] = len(rows)
rows = [r for r in rows if (r['confidence'] or 0) >= MIN_CONF]
stats[f'après confiance >= {MIN_CONF}'] = len(rows)
rows = [r for r in rows if (r['taxo'] or r['basic_category']) or (r['confidence'] or 0) >= MIN_CONF_NO_CATEGORY]
stats['après retrait des sans catégorie peu fiables'] = len(rows)
# Noms en caractères fantaisie (« 𝐇𝐚𝐫𝐨𝐥𝐝 ») : NFKC les ramène à des lettres normales.
for r in rows:
    r['name'] = unicodedata.normalize('NFKC', r['name']).strip()

# ------------------------------------------------------------ catégories
EXACT = {
    'restaurant': ('restaurant', 'restaurant'), 'fast_food_restaurant': ('fast_food', 'restaurant'),
    'bar': ('bar', 'restaurant'), 'pub': ('pub', 'restaurant'), 'cafe': ('cafe', 'restaurant'), 'coffee_shop': ('cafe', 'restaurant'),
    'ice_cream_shop': ('ice_cream', 'restaurant'), 'bakery': ('bakery', 'commerce'),
    'hotel': ('hotel', 'hôtel'), 'resort': ('resort', 'hôtel'), 'bed_and_breakfast': ('guest_house', 'hôtel'),
    'hostel': ('hostel', 'hôtel'), 'motel': ('motel', 'hôtel'), 'inn': ('guest_house', 'hôtel'), 'guest_house': ('guest_house', 'hôtel'),
    'school': ('school', 'école'), 'college_university': ('university', 'école'), 'preschool': ('kindergarten', 'école'),
    'elementary_school': ('school', 'école'), 'middle_school': ('school', 'école'), 'high_school': ('school', 'école'),
    'driving_school': ('driving_school', 'école'), 'language_school': ('language_school', 'école'), 'education': ('training', 'école'),
    'hospital': ('hospital', 'santé'), 'pharmacy': ('pharmacy', 'santé'), 'doctor': ('doctors', 'santé'), 'dentist': ('dentist', 'santé'),
    'clinic': ('clinic', 'santé'), 'medical_center': ('clinic', 'santé'), 'health_care': ('clinic', 'santé'), 'veterinarian': ('veterinary', 'santé'),
    'bank_or_credit_union': ('bank', 'commerce'), 'atm': ('atm', 'commerce'), 'beauty_salon': ('beauty', 'commerce'),
    'hair_salon': ('hairdresser', 'commerce'), 'barber': ('hairdresser', 'commerce'), 'spa': ('beauty', 'commerce'),
    'clothing_store': ('clothes', 'commerce'), 'grocery_store': ('supermarket', 'commerce'), 'supermarket': ('supermarket', 'commerce'),
    'shopping_mall': ('mall', 'commerce'), 'hardware_store': ('hardware', 'commerce'), 'electronics_store': ('electronics', 'commerce'),
    'furniture_store': ('furniture', 'commerce'), 'fashion_boutique': ('boutique', 'commerce'), 'shopping': ('shop', 'commerce'),
    'real_estate_service': ('estate_agent', 'commerce'), 'travel_service': ('travel_agency', 'commerce'),
    'gas_station': ('fuel', 'transport'), 'bus_station': ('bus_station', 'transport'), 'taxi_service': ('taxi', 'transport'),
    'parking': ('parking', 'transport'), 'airport': ('airport', 'transport'), 'ferry_service': ('ferry_terminal', 'transport'),
    'religious_organization': ('place_of_worship', 'autre'), 'government_office': ('government', 'autre'),
    'non_governmental_association': ('ngo', 'autre'), 'social_or_community_service': ('social_facility', 'autre'),
    'professional_service': ('company', 'autre'), 'historic_site': ('attraction', 'autre'),
    'party_and_event_planning': ('events_venue', 'autre'),
}
ROOT = {
    'food_and_drink': ('restaurant', 'restaurant'), 'lodging': ('hotel', 'hôtel'), 'education': ('school', 'école'),
    'health_care': ('clinic', 'santé'), 'shopping': ('shop', 'commerce'), 'lifestyle_services': ('beauty', 'commerce'),
    'travel_and_transportation': (None, 'transport'), 'services_and_business': ('company', 'autre'),
    'community_and_government': ('government', 'autre'), 'cultural_and_historic': ('attraction', 'autre'),
    'arts_and_entertainment': ('attraction', 'autre'), 'sports_and_recreation': ('pitch', 'autre'),
    'geographic_entities': ('locality', 'quartier'),
}


def categorize(r):
    t = r['taxo'] or r['basic_category'] or ''
    if t in EXACT:
        return EXACT[t]
    if t.endswith('place_of_worship') or t in ('mosque', 'church_cathedral'):
        return ('place_of_worship', 'autre')
    if t.endswith('_restaurant'):
        return ('restaurant', 'restaurant')
    if t.endswith('_store') or t.endswith('_shop'):
        return (t, 'commerce')
    if r['taxo_root'] in ROOT:
        cat, grp = ROOT[r['taxo_root']]
        return (cat or t or 'autre', grp)
    return (t or 'autre', 'autre')


before = len(rows)
rows = [r for r in rows if not (categorize(r)[0] == 'company' and (r['confidence'] or 0) < 0.7)]
stats['entreprises de services retirées (confiance < 0.7)'] = before - len(rows)

# ------------------------------------------------------------ doublons avec les lieux existants (grille de 0,002° ~ 220 m)
G = 0.002
grid = collections.defaultdict(list)
for e in existing:
    grid[(round(e['lat'] / G), round(e['lng'] / G))].append(e)


def neighbors(lat, lon, rings=1):
    gx, gy = round(lat / G), round(lon / G)
    for dx in range(-rings, rings + 1):
        for dy in range(-rings, rings + 1):
            yield from grid.get((gx + dx, gy + dy), [])


def is_dup(r, n):
    for e in neighbors(r['lat'], r['lon'], 2):
        d = hav(r['lat'], r['lon'], e['lat'], e['lng'])
        if d > 450:
            continue
        en = e['n']
        sim = difflib.SequenceMatcher(None, n, en).ratio()
        contains = len(min(n, en, key=len)) >= 5 and (n in en or en in n)
        if (d <= 100 and (sim >= 0.6 or contains)) or (d <= 450 and sim >= 0.88) or (d <= 200 and contains):
            return True
    return False


kept, dup_existing = [], 0
for r in rows:
    n = norm(r['name'])
    r['n'] = n
    if is_dup(r, n):
        dup_existing += 1
    else:
        kept.append(r)
stats['doublons avec les lieux déjà présents (retirés)'] = dup_existing
stats['après dédoublonnage avec l\'existant'] = len(kept)

# ------------------------------------------------------------ doublons internes à Overture
kept.sort(key=lambda r: -(r['confidence'] or 0))
seen = collections.defaultdict(list)
final, dup_int = [], 0
for r in kept:
    key = (round(r['lat'] / G), round(r['lon'] / G))
    near = [x for dx in (-1, 0, 1) for dy in (-1, 0, 1) for x in seen.get((key[0] + dx, key[1] + dy), [])]
    if any(hav(r['lat'], r['lon'], x['lat'], x['lon']) <= 60 and difflib.SequenceMatcher(None, r['n'], x['n']).ratio() >= 0.85 for x in near):
        dup_int += 1
        continue
    seen[key].append(r)
    final.append(r)
stats['doublons internes à Overture (retirés)'] = dup_int
stats['LIEUX À IMPORTER'] = len(final)

# ------------------------------------------------------------ ville : celle du lieu existant le plus proche (< 3 km), sinon centre de ville le plus proche
CENTERS = {'Abomey-Calavi': (6.4424, 2.3371), 'Porto-Novo': (6.5307, 2.6405), 'Cotonou': (6.3693, 2.4387),
           'Ouidah': (6.4765, 2.0527), 'Sèmè-Kpodji': (6.3930, 2.6081)}


COMMUNES_PARQ = os.path.join(HERE, 'communes_bj.parquet').replace('\\', '/')
COMMUNE_LABEL = {'Cotonou': 'Cotonou', 'Abomey-Calavi': 'Abomey-Calavi', 'Porto Novo': 'Porto-Novo', 'Ouidah': 'Ouidah', 'Sèmè-Kpodji': 'Sèmè-Kpodji'}
_geo = None


def commune_label(r):
    """Nom de ville de l'une des 5 communes qui contient le point, sinon None (communes voisines ou hors limites)."""
    global _geo
    if _geo is None and os.path.exists(COMMUNES_PARQ):
        _geo = duckdb.connect()
        _geo.execute("INSTALL spatial; LOAD spatial;")
    if _geo is None:
        return None
    row = _geo.execute(f"select name from '{COMMUNES_PARQ}' where ST_Contains(geometry, ST_Point(?, ?)) limit 1", [r['lon'], r['lat']]).fetchone()
    return COMMUNE_LABEL.get(row[0]) if row else None


def city_of(r):
    lab = commune_label(r)
    if lab:
        return lab
    best, bd = None, 1e9
    for e in neighbors(r['lat'], r['lon'], 6):
        d = hav(r['lat'], r['lon'], e['lat'], e['lng'])
        if d < bd:
            best, bd = e['city'], d
    if best and bd <= 3000:
        return best
    return min(CENTERS, key=lambda c: hav(r['lat'], r['lon'], *CENTERS[c]))


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"


by_group = collections.Counter()
by_city = collections.Counter()
values = []
for r in final:
    cat, grp = categorize(r)
    city = city_of(r)
    by_group[grp] += 1
    by_city[city] += 1
    src = json.loads(r['sources']) if r['sources'] else []
    ds = src[0].get('dataset') if src else None
    lic = src[0].get('license') if src else None
    tags = {'overture_id': r['id'], 'confidence': round(r['confidence'] or 0, 2), 'overture_category': r['taxo'] or r['basic_category'],
            'dataset': ds, 'license': lic, 'release': RELEASE}
    values.append(
        f"({esc(r['name'].strip())}, {esc(cat)}, {esc(grp)}, {esc(city)}, "
        f"st_setsrid(st_makepoint({r['lon']:.7f}, {r['lat']:.7f}), 4326)::geography, "
        f"{esc(r['address']) if r['address'] else 'null'}, 'overture', {esc(r['id'])}, {esc(json.dumps(tags, ensure_ascii=False))}::jsonb)"
    )

for f in os.listdir(OUTDIR):
    os.remove(os.path.join(OUTDIR, f))
B = 250
for i in range(0, len(values), B):
    sql = ("insert into public.places (name, category, category_group, city, location, address, source, overture_id, tags) values\n"
           + ",\n".join(values[i:i + B]) + "\non conflict (overture_id) do nothing;\n")
    open(os.path.join(OUTDIR, f'lot_{i // B + 1:03d}.sql'), 'w', encoding='utf-8').write(sql)

print('\n'.join(f'{k:60s} {v}' for k, v in stats.items()))
print('\nPar groupe :', dict(by_group.most_common()))
print('Par ville :', dict(by_city.most_common()))
print('Fichiers SQL :', len(os.listdir(OUTDIR)), 'lots de', B)
print('\nExemples :')
for r in final[:12]:
    print('  ', r['name'][:40], '|', categorize(r), '|', round(r['confidence'], 2), '|', city_of(r))
print('Exemples de doublons évités (existant) : voir échantillon')
