import json, os, math, re, unicodedata, collections

S = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(S, 'places_now.json'), encoding='utf-8'))


def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()).strip()


def xy(r):
    return (r['lng'] - 2.4) * 111320 * math.cos(math.radians(6.4)), (r['lat'] - 6.4) * 110574


KINDS = ('neighbourhood', 'suburb', 'quarter', 'village', 'hamlet')
refs = [r for r in rows if r['category_group'] == 'quartier' and r['source'] != 'overture' and (r['place'] in KINDS or (r['place'] is None and r['source'] == 'popular_seed'))]
by = collections.defaultdict(list)
for r in refs:
    by[norm(r['name'])].append(r)

# noms qui ne sont pas des quartiers (villes, communes, mots trop generiques)
STOP = {n for n in ('cotonou', 'benin', 'abomey calavi', 'calavi', 'porto novo', 'ouidah', 'seme kpodji', 'seme', 'akpakpa cotonou', 'la paix', 'marche', 'carrefour', 'centre', 'ville', 'hotel', 'ecole', 'eglise')}
# 'seme' est un vrai quartier de Calavi : on le garde SEULEMENT s'il est precede de "quartier"
SPLIT = re.compile(r'[,;/\-]|\bquartier\b|\bqtr\b|\bquartie\b', re.I)

out = []
skipped = collections.Counter()
for r in rows:
    if r['category_group'] == 'quartier' or r['district'] or not r['address']:
        continue
    segs = [norm(x) for x in SPLIT.split(r['address'])]
    segs = [s for s in segs if len(s) >= 4]
    cands = {}
    for s in segs:
        if s in STOP or s not in by:
            continue
        d = min(math.hypot(xy(r)[0] - xy(c)[0], xy(r)[1] - xy(c)[1]) for c in by[s])
        if d <= 3000:
            cands[s] = by[s][0]['name']
    if len(cands) == 1:
        s, canon = next(iter(cands.items()))
        if norm(r['name']) == s or norm(r['city']) == s:
            skipped['nom ou ville'] += 1
            continue
        out.append({'id': r['id'], 'district': canon, 'address': r['address'], 'name': r['name'], 'city': r['city']})
    elif len(cands) > 1:
        skipped['plusieurs candidats'] += 1
print('districts deduits de l adresse :', len(out), '| ecartes :', dict(skipped))
print(collections.Counter(o['city'] for o in out).most_common(8))
for o in out[:25]:
    print('  ', o['name'][:30], '|', o['address'][:55], '->', o['district'])
json.dump(out, open(os.path.join(S, 'district_fix.json'), 'w', encoding='utf-8'), ensure_ascii=False)
