// Serveur Supabase de DEMONSTRATION : repond comme l'API de Supabase (auth + PostgREST) avec des donnees fictives,
// pour photographier les vrais ecrans de l'app sans toucher a la base reelle. Aucune cle reelle n'est utilisee.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MOCK_PORT || 54321);
const LOG = path.join(ICI, 'requests.log');
const FIX = path.join(ICI, 'fixtures.mjs');
async function fixtures() { return import(pathToFileURL(FIX).href + '?v=' + fs.statSync(FIX).mtimeMs); }
const journal = (l) => { try { fs.appendFileSync(LOG, l + '\n'); } catch {} };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
  'access-control-expose-headers': 'Content-Range, Content-Profile',
};

function filtre(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const m = /^(eq|neq|in|is|gt|gte|lt|lte|like|ilike)\.(.*)$/.exec(v);
    if (!m) continue;
    const [, op, val] = m;
    out = out.filter((r) => {
      const x = r[k];
      if (x === undefined) return true; // colonne inconnue du jeu fictif : on ne filtre pas
      if (op === 'eq') return String(x) === val;
      if (op === 'neq') return String(x) !== val;
      if (op === 'is') return val === 'null' ? x === null : String(x) === val;
      if (op === 'in') return val.replace(/[()]/g, '').split(',').map((s) => s.replace(/"/g, '')).includes(String(x));
      return true;
    });
  }
  const lim = params.get('limit');
  if (lim) out = out.slice(0, Number(lim));
  return out;
}

// identifiant de l'utilisateur d'apres le jeton (JWT fictif) de la requete
function sujet(req) {
  try {
    const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    return JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString('utf8')).sub;
  } catch { return null; }
}

const server = http.createServer(async (req, res) => {
  const { TABLES, RPC, USERS, session } = await fixtures();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const sub = sujet(req);
    journal(`${req.method} ${p}${url.search.slice(0, 220)}${body ? '  BODY ' + body.slice(0, 120) : ''}`);
    const send = (code, obj, extra = {}) => {
      const s = obj === undefined ? '' : JSON.stringify(obj);
      res.writeHead(code, { 'content-type': 'application/json', ...CORS, ...extra });
      res.end(s);
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

    if (p === '/auth/v1/user') return send(200, USERS[sub] ?? Object.values(USERS)[0]);
    if (p === '/auth/v1/token') return send(200, session(Object.keys(USERS)[0]));
    if (p.startsWith('/auth/v1/')) return send(200, {});

    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.slice('/rest/v1/rpc/'.length);
      const h = RPC[fn];
      let args = {};
      try { args = body ? JSON.parse(body) : {}; } catch {}
      const r = typeof h === 'function' ? h(args, { sub }) : h;
      return send(200, r === undefined ? null : r);
    }
    if (p.startsWith('/rest/v1/')) {
      const table = p.slice('/rest/v1/'.length);
      const src = TABLES[table] ?? [];
      const all = typeof src === 'function' ? src({ sub }) : src;
      if (req.method === 'GET' || req.method === 'HEAD') {
        const rows = filtre(all, url.searchParams);
        const accept = String(req.headers.accept || '');
        const range = { 'content-range': `${rows.length ? '0-' + (rows.length - 1) : '*'}/${rows.length}` };
        if (req.method === 'HEAD') { res.writeHead(200, { ...CORS, ...range }); return res.end(); }
        if (accept.includes('vnd.pgrst.object')) {
          if (!rows.length) return send(406, { code: 'PGRST116', message: 'The result contains 0 rows', details: null, hint: null });
          return send(200, rows[0], range);
        }
        return send(200, rows, range);
      }
      let rep = [];
      try { rep = body ? JSON.parse(body) : []; } catch {}
      return send(201, rep);
    }
    if (p.startsWith('/functions/v1/') || p.startsWith('/storage/v1/')) return send(200, {});
    send(404, { message: 'inconnu (demo)' });
  });
});
server.on('upgrade', (req, socket) => { journal('WS ' + req.url); socket.destroy(); });
server.listen(PORT, () => console.log(`[mock-supabase] http://localhost:${PORT} (donnees fictives)`));
