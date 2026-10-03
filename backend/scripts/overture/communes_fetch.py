import duckdb, os
REL = '2026-09-23.1'
HERE = os.path.dirname(os.path.abspath(__file__))
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
AREA = f"s3://overturemaps-us-west-2/release/{REL}/theme=divisions/type=division_area/*"
out = os.path.join(HERE, 'communes_bj.parquet').replace(chr(92), '/')
con.execute(f"""
COPY (SELECT names.primary AS name, subtype, region, geometry FROM read_parquet('{AREA}', hive_partitioning=1)
      WHERE country='BJ' AND subtype='county') TO '{out}' (FORMAT PARQUET)
""")
print(con.execute(f"select count(*), string_agg(name, ', ' order by name) from '{out}'").fetchone())
