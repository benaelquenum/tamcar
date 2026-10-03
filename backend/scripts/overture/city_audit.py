import duckdb, json, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(HERE, 'all_places.json'), encoding='utf-8'))
PARQ = os.path.join(HERE, 'communes_bj.parquet').replace(chr(92), '/')

con = duckdb.connect()
con.execute("INSTALL spatial; LOAD spatial;")
con.execute("CREATE TABLE p (id VARCHAR, name VARCHAR, category_group VARCHAR, city VARCHAR, source VARCHAR, lat DOUBLE, lng DOUBLE)")
con.executemany("INSERT INTO p VALUES (?,?,?,?,?,?,?)", [(r['id'], r['name'], r['category_group'], r['city'], r['source'], r['lat'], r['lng']) for r in rows])
con.execute(f"CREATE TABLE c AS SELECT name AS commune, geometry FROM '{PARQ}'")

# Commune contenant le point (les limites Overture ne se chevauchent pas ; sinon on garde la plus petite)
con.execute("""
CREATE TABLE j AS
SELECT p.*, c.commune,
       ST_Distance(ST_Point(p.lng, p.lat), ST_Boundary(c.geometry)) * 111000 AS dist_limite_m
FROM p LEFT JOIN c ON ST_Contains(c.geometry, ST_Point(p.lng, p.lat))
""")
print('lignes jointes (peut dépasser le total si chevauchement) :', con.execute('select count(*) from j').fetchone()[0], 'sur', len(rows))
print('lieux sans commune trouvée :', con.execute('select count(*) from j where commune is null').fetchone()[0])

print('\n=== Ville inscrite (lignes) x commune réelle (colonnes) ===')
mat = con.execute("select city, coalesce(commune,'(aucune)') c, count(*) n from j group by 1,2 order by 1,3 desc").fetchall()
by = collections.defaultdict(list)
for city, c, n in mat: by[city].append((c, n))
for city, lst in by.items():
    tot = sum(n for _, n in lst)
    print(f'{city:15s} total {tot:5d} :', ', '.join(f'{c} {n}' for c, n in lst[:9]))

LABEL = {'Cotonou': 'Cotonou', 'Abomey-Calavi': 'Abomey-Calavi', 'Porto Novo': 'Porto-Novo', 'Ouidah': 'Ouidah', 'Sèmè-Kpodji': 'Sèmè-Kpodji'}
print('\n=== Erreurs nettes : le lieu est dans l\'une des 5 communes mais porte un autre nom de ville ===')
err = [r for r in con.execute("select id, name, city, commune, dist_limite_m, source, category_group from j").fetchall() if r[3] in LABEL and LABEL[r[3]] != r[2]]
print('nombre :', len(err))
cc = collections.Counter((r[2], LABEL[r[3]]) for r in err)
for (a, b), n in cc.most_common(): print(f'  inscrit {a:14s} -> réel {b:14s} : {n}')
close = [r for r in err if r[4] < 100]
print('dont à moins de 100 m d\'une limite :', len(close))
src = collections.Counter(r[5] for r in err)
print('par source :', dict(src))

print('\n=== Lieux hors des 5 communes (autres communes) selon le nom inscrit ===')
out = con.execute("select city, commune, count(*) from j where commune is not null and commune not in ('Cotonou','Abomey-Calavi','Porto Novo','Ouidah','Sèmè-Kpodji') group by 1,2 order by 3 desc").fetchall()
for r in out[:25]: print('  ', r)
print('total hors 5 communes :', sum(r[2] for r in out))
print('\nexemples d\'erreurs :')
for r in err[:12]: print('  ', r[1][:40], '| inscrit', r[2], '| réel', r[3], '| à', round(r[4]), 'm de la limite')
json.dump([dict(id=r[0], name=r[1], old=r[2], new=LABEL[r[3]], dist=r[4], source=r[5]) for r in err], open(os.path.join(HERE, 'city_errors.json'), 'w', encoding='utf-8'), ensure_ascii=False)
