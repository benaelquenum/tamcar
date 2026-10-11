// Test de la logique pure des fonctions FeexPay (numéros, statuts, références, secret du webhook).
// Usage : node backend/tests/feexpay_core.test.mjs   (Node 22+ ; TypeScript retiré par typescript.transpileModule)
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(process.platform === 'win32' ? 1 : 0)), '../..');
const require = createRequire(path.join(root, 'apps/client/package.json'));
const ts = require('typescript');
const src = readFileSync(path.join(root, 'backend/supabase/functions/_shared/feexpay-core.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const dir = mkdtempSync(path.join(os.tmpdir(), 'feexpay-core-'));
const file = path.join(dir, 'core.mjs');
writeFileSync(file, js);
const core = await import(pathToFileURL(file).href);

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'OK ' : 'KO '} ${name}${ok ? '' : `  → obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)}`}`);
};

// Numéros
eq('phone 8 chiffres', core.normalizePhone('97 00 00 00'), '2290197000000');
eq('phone 10 chiffres', core.normalizePhone('01 97 00 00 00'), '2290197000000');
eq('phone +229', core.normalizePhone('+229 01 97 00 00 00'), '2290197000000');
eq('phone 00229', core.normalizePhone('00229 0197000000'), '2290197000000');
eq('phone 229 collé', core.normalizePhone('2290197000000'), '2290197000000');
eq('phone trop court', core.normalizePhone('9700'), null);
eq('phone sans 01', core.normalizePhone('0297000000'), null);
eq('phone vide', core.normalizePhone(''), null);
eq('phone lettres', core.normalizePhone('abc'), null);

// Statuts
eq('SUCCESSFUL', core.mapStatus('SUCCESSFUL'), 'success');
eq('FAILED', core.mapStatus('FAILED'), 'failed');
eq('PENDING', core.mapStatus('PENDING'), 'pending');
eq('IN PENDING STATE', core.mapStatus('IN PENDING STATE'), 'pending');
eq('inconnu → pending', core.mapStatus('???'), 'pending');
eq('absent → pending', core.mapStatus(undefined), 'pending');

// Références
const ref = 'FDP-0123456789abcdef0123456789abcdef';
eq('REF_RE ok', core.REF_RE.test(ref), true);
eq('REF_RE trop court', core.REF_RE.test('FDP-123'), false);
eq('callback chaîne', core.refFromCallback(ref), ref);
eq('callback objet', core.refFromCallback({ order: ref }), ref);
eq('callback vide', core.refFromCallback(''), '');
eq('callback null', core.refFromCallback(null), '');
eq('callback étranger', core.refFromCallback('order_12345'), '');

// Canaux et opérateurs
eq('canal celtiis', core.CHANNEL.celtiis, 'celtiis_bj');
eq('isNetwork moov', core.isNetwork('moov'), true);
eq('isNetwork coris (non géré)', core.isNetwork('coris'), false);

// Motif d'échec
eq('reason direct', core.reasonOf({ status: 'FAILED', reason: 'PAYER_NOT_FOUND' }), 'PAYER_NOT_FOUND');
eq('reason opérateur', core.reasonOf({ status: 'FAILED', response_operator: { description: ['Balance is insufficient'] } }), 'Balance is insufficient');
eq('reason message', core.reasonOf({ message: 'INVALID_PHONE_NUMBER' }), 'INVALID_PHONE_NUMBER');
eq('reason vide', core.reasonOf({ status: 'FAILED' }), '');

// Secret du webhook
eq('secret Bearer', core.secretFromAuthHeader('Bearer abc123'), 'abc123');
eq('secret Basic', core.secretFromAuthHeader('Basic abc123'), 'abc123');
eq('secret brut', core.secretFromAuthHeader('abc123'), 'abc123');
eq('secret absent', core.secretFromAuthHeader(null), '');
eq('timingSafeEqual égaux', core.timingSafeEqual('abc', 'abc'), true);
eq('timingSafeEqual différents', core.timingSafeEqual('abc', 'abd'), false);
eq('timingSafeEqual longueurs', core.timingSafeEqual('abc', 'abcd'), false);

console.log(fails === 0 ? '\nTous les contrôles passent.' : `\n${fails} contrôle(s) en échec.`);
process.exit(fails === 0 ? 0 : 1);
