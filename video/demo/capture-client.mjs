// Photographie les ecrans de l'app client (donnees de demonstration) pour la video de presentation.
// Usage : MSYS_NO_PATHCONV=1 node capture-client.mjs [nom ...]   (sans argument : toutes les scenes)
import path from 'node:path';
import { ouvrir, BASE, SHOTS } from './shot.mjs';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const DEST = '/commande?dest_lat=6.3667&dest_lng=2.4333&dest=March%C3%A9%20Dantokpa%2C%20Cotonou';

async function cliquer(page, texte, { tag = 'button,a' } = {}) {
  const ok = await page.evaluate((t, sel) => {
    const els = [...document.querySelectorAll(sel)];
    const el = els.find((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().includes(t));
    if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; }
    return false;
  }, texte, tag);
  if (!ok) throw new Error('bouton introuvable : ' + texte);
}

async function snap(page, nom, { plein = false } = {}) {
  await page.screenshot({ path: path.join(SHOTS, nom + '.png'), fullPage: plein });
  console.log('photo', nom);
}

const SCENES = {
  async accueil(page) {
    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 180000 }); await attendre(3500);
    await snap(page, 'c-accueil');
  },
  async trajet(page) {
    await page.goto(BASE + DEST, { waitUntil: 'networkidle2', timeout: 180000 }); await attendre(6000);
    await snap(page, 'c-trajet');
    await cliquer(page, 'Choisir un véhicule'); await attendre(3500);
    await snap(page, 'c-vehicules');
    await snap(page, 'c-vehicules-plein', { plein: true });
  },
  async suivi(page) {
    for (const [id, nom] of [['demo-matched', 'c-suivi-route'], ['demo-arrived', 'c-suivi-arrive'], ['demo-progress', 'c-suivi-course']]) {
      await page.goto(BASE + '/ride/' + id, { waitUntil: 'networkidle2', timeout: 180000 }); await attendre(6000);
      await snap(page, nom);
      // volet replie : la carte et le vehicule du chauffeur occupent l'ecran
      try { await page.click('[aria-label="Réduire"]'); await attendre(2500); await snap(page, nom + '-carte'); } catch (e) { console.log('volet', nom, 'non replie'); }
    }
  },
  async corridor(page) {
    await page.goto(BASE + '/commande?dest_lat=6.4969&dest_lng=2.6289&dest=Porto-Novo%2C%20March%C3%A9%20Ouando', { waitUntil: 'networkidle2', timeout: 180000 }); await attendre(7000);
    await snap(page, 'c-corridor');
  },
  async fin(page) {
    await page.goto(BASE + '/ride/demo-done', { waitUntil: 'networkidle2', timeout: 180000 }); await attendre(5000);
    await snap(page, 'c-fin');
  },
  async reserver(page) {
    await page.goto(BASE + DEST + '&scheduled=1', { waitUntil: 'networkidle2', timeout: 180000 }); await attendre(6000);
    await snap(page, 'c-reserver');
  },
  async portefeuille(page) {
    await page.goto(BASE + '/wallet', { waitUntil: 'networkidle2', timeout: 180000 }); await attendre(2500);
    await snap(page, 'c-portefeuille');
  },
  async historique(page) {
    await page.goto(BASE + '/history', { waitUntil: 'networkidle2', timeout: 180000 }); await attendre(2500);
    await snap(page, 'c-historique');
  },
  async reservations(page) {
    await page.goto(BASE + '/reservations', { waitUntil: 'networkidle2', timeout: 180000 }); await attendre(2500);
    await snap(page, 'c-reservations');
  },
  async divers(page) {
    for (const [route, nom] of [['/tampass', 'c-tampass'], ['/menu', 'c-menu'], ['/chauffeurs', 'c-chauffeurs'], ['/parrainer', 'c-parrainer'], ['/compte', 'c-compte']]) {
      await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 180000 }); await attendre(2500);
      await snap(page, nom);
    }
  },
};

const demandees = process.argv.slice(2);
if (demandees.includes('nuit')) {
  // meme ecran de suivi, a 21 h 30 : l'app propose de prevenir un proche
  const o = await ouvrir({ heureUTC: 20, minute: 30 });
  try { await o.page.goto(BASE + '/ride/demo-matched', { waitUntil: 'networkidle2', timeout: 180000 }); await attendre(6000); await snap(o.page, 'c-suivi-nuit'); } catch (e) { console.log('nuit ERREUR', String(e).slice(0, 160)); }
  await o.browser.close();
}
const { browser, page } = await ouvrir();
for (const [nom, fn] of Object.entries(SCENES)) {
  if (demandees.length && !demandees.includes(nom)) continue;
  try { await fn(page); } catch (e) { console.log(nom, 'ERREUR', String(e).slice(0, 160)); }
}
await browser.close();
