// Photographie les ecrans de l'app chauffeur TamCar Pro (donnees de demonstration) pour la video de presentation.
// Usage : MSYS_NO_PATHCONV=1 node capture-driver.mjs [nom ...]
import path from 'node:path';
import { ouvrir, SHOTS } from './shot.mjs';

const BASE_CH = 'http://localhost:3012';
const ID_CHAUFFEUR = '00000000-0000-4000-8000-000000000002';
const ID_EN_LIGNE = '00000000-0000-4000-8000-000000000003';
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function snap(page, nom, { plein = false } = {}) { await page.screenshot({ path: path.join(SHOTS, nom + '.png'), fullPage: plein }); console.log('photo', nom); }
async function aller(page, route, ms = 3500) { await page.goto(BASE_CH + route, { waitUntil: 'networkidle2', timeout: 240000 }); await attendre(ms); console.log('  ->', page.url().replace(BASE_CH, '')); }

const SCENES = {
  async accueil(page) { await aller(page, '/', 6000); await snap(page, 'd-accueil'); },
  async tableau(page) { await aller(page, '/dashboard'); await snap(page, 'd-tableau'); await snap(page, 'd-tableau-plein', { plein: true }); },
  async portefeuille(page) { await aller(page, '/wallet'); await snap(page, 'd-portefeuille'); },
  async historique(page) { await aller(page, '/history'); await snap(page, 'd-historique'); },
  async bienetre(page) { await aller(page, '/bien-etre'); await snap(page, 'd-bienetre'); await snap(page, 'd-bienetre-plein', { plein: true }); },
  async divers(page) { await aller(page, '/tampass'); await snap(page, 'd-tampass'); await aller(page, '/reservations'); await snap(page, 'd-reservations'); },
};

const demandees = process.argv.slice(2);
if (demandees.includes('enligne')) {
  const o = await ouvrir({ id: ID_EN_LIGNE, base: BASE_CH });
  try { await aller(o.page, '/', 7000); await snap(o.page, 'd-accueil-en-ligne'); } catch (e) { console.log('enligne ERREUR', String(e).slice(0, 160)); }
  await o.browser.close();
}
const { browser, page } = await ouvrir({ id: ID_CHAUFFEUR, base: BASE_CH });
for (const [nom, fn] of Object.entries(SCENES)) {
  if (!demandees.length ? false : !demandees.includes(nom)) continue;
  try { await fn(page); } catch (e) { console.log(nom, 'ERREUR', String(e).slice(0, 160)); }
}
await browser.close();
