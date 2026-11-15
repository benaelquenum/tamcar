// Photographie une liste de routes de l'app et journalise les requetes de donnees (a lancer avec MSYS_NO_PATHCONV=1).
import { ouvrir, photo } from './shot.mjs';
const routes = process.argv.slice(2);
const { browser, page } = await ouvrir();
for (const r of routes) {
  const [route, nom] = r.split('|');
  try { const x = await photo(page, route, nom, { attente: 3500 }); console.log(nom.padEnd(18), '->', x.url.replace('http://localhost:3011', '')); }
  catch (e) { console.log(nom, 'ERREUR', String(e).slice(0, 120)); }
}
await browser.close();
