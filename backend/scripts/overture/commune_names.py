import json, os, collections, duckdb

S = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(S, 'places_now.json'), encoding='utf-8'))
PARQ = os.path.join(S, 'communes_bj.parquet').replace(chr(92), '/')

con = duckdb.connect()
con.execute('install spatial; load spatial;')
print('communes :', [r[0] for r in con.execute(f"select name from '{PARQ}' order by name").fetchall()])

# ville -> commune contenant le point
con.execute('create table pts(id varchar, lng double, lat double)')
con.executemany('insert into pts values (?,?,?)', [(r['id'], r['lng'], r['lat']) for r in rows])
res = con.execute(f"""
  select p.id, c.name from pts p left join '{PARQ}' c on ST_Contains(c.geometry, ST_Point(p.lng, p.lat))
""").fetchall()
commune = {}
for pid, name in res:
    commune.setdefault(pid, name)

FIVE = {'Cotonou': 'Cotonou', 'Abomey-Calavi': 'Abomey-Calavi', 'Porto Novo': 'Porto-Novo', 'Ouidah': 'Ouidah', 'Sèmè-Kpodji': 'Sèmè-Kpodji'}
chg = []
other = collections.Counter()
none_ = 0
for r in rows:
    c = commune.get(r['id'])
    if c is None:
        none_ += 1
        continue
    if c in FIVE:
        continue
    other[(c, r['city'])] += 1
    chg.append({'id': r['id'], 'old': r['city'], 'new': c, 'lng': r['lng'], 'lat': r['lat']})
print('lieux hors 5 communes :', len(chg), '| hors toute limite :', none_)
by = collections.Counter(x['new'] for x in chg)
print(by.most_common(40))
json.dump(chg, open(os.path.join(S, 'commune_fix.json'), 'w', encoding='utf-8'), ensure_ascii=False)


# distance a la plus proche des 5 communes (marge : 500 m pres de Porto-Novo, trace grossier ; 150 m ailleurs)
con.execute('create table cand(id varchar, lng double, lat double)')
con.executemany('insert into cand values (?,?,?)', [(x['id'], x['lng'], x['lat']) for x in chg])
dist = dict(con.execute(f"""
  select k.id, min(ST_Distance(c.geometry, ST_Point(k.lng, k.lat))) * 111000 as d
  from cand k, '{PARQ}' c where c.name in ('Cotonou','Abomey-Calavi','Porto Novo','Ouidah','Sèmè-Kpodji')
  group by k.id
""").fetchall())
near_pn = dict(con.execute(f"""
  select k.id, min(ST_Distance(c.geometry, ST_Point(k.lng, k.lat))) * 111000 as d
  from cand k, '{PARQ}' c where c.name = 'Porto Novo' group by k.id
""").fetchall())
keep, skip = [], 0
for x in chg:
    margin = 500 if near_pn[x['id']] < 500 else 150
    if dist[x['id']] < margin:
        skip += 1
        continue
    keep.append({'id': x['id'], 'old': x['old'], 'new': x['new']})
print('retenus :', len(keep), '| trop pres d une limite des 5 communes :', skip)
print(collections.Counter(x['new'] for x in keep).most_common())
json.dump(keep, open(os.path.join(S, 'commune_fix.json'), 'w', encoding='utf-8'), ensure_ascii=False)

