import duckdb, time, os
REL = '2026-09-23.1'
SRC = f"s3://overturemaps-us-west-2/release/{REL}/theme=places/type=place/*"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'overture_zone.parquet')
X0, X1, Y0, Y1 = 1.94, 2.81, 6.29, 6.71

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
t0 = time.time()
con.execute(f"""
COPY (
  SELECT id,
         names.primary AS name,
         taxonomy.primary AS taxo,
         basic_category,
         list_extract(taxonomy.hierarchy, 1) AS taxo_root,
         confidence,
         ST_X(geometry) AS lon, ST_Y(geometry) AS lat,
         addresses[1].freeform AS address,
         addresses[1].locality AS locality,
         addresses[1].region AS region,
         addresses[1].country AS country,
         operating_status,
         to_json(sources) AS sources,
         phones[1] AS phone,
         websites[1] AS website,
         brand.names.primary AS brand
  FROM read_parquet('{SRC}', hive_partitioning=1)
  WHERE bbox.xmin BETWEEN {X0} AND {X1} AND bbox.ymin BETWEEN {Y0} AND {Y1}
) TO '{OUT.replace(chr(92), '/')}' (FORMAT PARQUET)
""")
print('téléchargé en', round(time.time() - t0, 1), 's ->', OUT)

q = lambda s: con.execute(s).fetchall()
F = OUT.replace(chr(92), '/')
print('lignes :', q(f"select count(*) from '{F}'")[0][0])
print('pays :', q(f"select coalesce(country,'(vide)'), count(*) from '{F}' group by 1 order by 2 desc"))
print('statut :', q(f"select coalesce(operating_status,'(vide)'), count(*) from '{F}' group by 1 order by 2 desc"))
print('confiance :', q(f"select case when confidence>=0.9 then '>=0.9' when confidence>=0.8 then '0.8-0.9' when confidence>=0.7 then '0.7-0.8' when confidence>=0.5 then '0.5-0.7' else '<0.5' end as t, count(*) from '{F}' group by 1 order by 1"))
print('sans nom :', q(f"select count(*) from '{F}' where name is null or trim(name)=''")[0][0])
print('sources (premier dataset) :', q(f"select json_extract_string(sources,'$[0].dataset') d, json_extract_string(sources,'$[0].license') l, count(*) from '{F}' group by 1,2 order by 3 desc"))
print('taxonomie racine :', q(f"select coalesce(taxo_root,'(vide)'), count(*) from '{F}' group by 1 order by 2 desc limit 15"))
print('top catégories :', q(f"select coalesce(taxo,'(vide)'), count(*) from '{F}' group by 1 order by 2 desc limit 40"))
