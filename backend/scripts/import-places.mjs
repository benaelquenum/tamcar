// TamCar — Exécute les fichiers seed places OSM via connexion directe
// (contourne la limite de taille / timeout du SQL Editor).
//
// Usage :
//   node import-places.mjs "postgresql://postgres.xxxx:MOT_DE_PASSE@aws-0-eu-....pooler.supabase.com:5432/postgres"
//
// La chaîne de connexion : Dashboard Supabase → bouton « Connect » (en haut)
// → onglet « Session pooler » → URI (remplacer [YOUR-PASSWORD]).
// Idempotent : relançable sans risque (on conflict do nothing).

import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

const uri = process.argv[2] || process.env.DATABASE_URL;
if (!uri) {
  console.error('Usage : node import-places.mjs "<connection-string>"');
  process.exit(1);
}

const dir = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.includes('seed_places_osm_booster'))
  .sort();

if (files.length === 0) {
  console.error('Aucun fichier seed_places_osm_booster trouvé.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: uri,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`Connecté. ${files.length} fichiers à exécuter.\n`);

  for (const f of files) {
    const sql = readFileSync(new URL(f, dir), 'utf8');
    process.stdout.write(`→ ${f} … `);
    const t0 = Date.now();
    await client.query(sql);
    console.log(`OK (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }

  const { rows } = await client.query(`
    select count(*)::int as total,
           count(*) filter (where city = 'Ouidah')::int as ouidah,
           count(*) filter (where city = 'Sèmè-Kpodji')::int as seme
    from public.places
  `);
  console.log('\nRésultat :', rows[0]);
} finally {
  await client.end();
}
