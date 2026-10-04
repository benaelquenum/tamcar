import json, os

S = os.path.dirname(os.path.abspath(__file__))
keep = json.load(open(os.path.join(S, 'commune_fix.json'), encoding='utf-8'))
OUT = os.path.join(S, 'commune_sql')
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


NL = chr(10)
for i in range(0, len(keep), 400):
    ch = keep[i:i + 400]
    vals = (',' + NL).join(f"({q(e['id'])}, {q(e['new'])})" for e in ch)
    sql = (
        "update public.places p" + NL
        + "   set city = v.new_city," + NL
        + "       tags = p.tags || jsonb_build_object('city_before_commune', p.city, 'commune_fixed_at', '2026-10-04')" + NL
        + "  from (values" + NL + vals + NL + ") as v(id, new_city)" + NL
        + " where p.id = v.id::uuid and p.city is distinct from v.new_city;" + NL
    )
    open(os.path.join(OUT, f'commune_{i // 400 + 1:02d}.sql'), 'w', encoding='utf-8').write(sql)
print('lieux :', len(keep), '| fichiers SQL :', len(os.listdir(OUT)))
