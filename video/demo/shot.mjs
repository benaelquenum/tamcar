// Photographie une page de l'app de demonstration dans un smartphone (390 x 844, x3) avec la session fictive.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { session } from './fixtures.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const BASE = process.env.DEMO_BASE || 'http://localhost:3011';
export const SHOTS = path.join(ICI, 'shots');

export async function ouvrir({ largeur = 390, hauteur = 844, echelle = 3, id, base = BASE, heureUTC = 9, minute = 40 } = {}) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await browser.defaultBrowserContext().overridePermissions(base, ['geolocation']);
  await page.setGeolocation({ latitude: 6.3555, longitude: 2.3925, accuracy: 20 });
  await page.setViewport({ width: largeur, height: hauteur, deviceScaleFactor: echelle, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
  // Heure fixee a 10 h 40 a Porto-Novo (les invites de nuit ne s'affichent pas ; memes dates que le serveur de demonstration)
  await page.emulateTimezone('Africa/Porto-Novo');
  await page.evaluateOnNewDocument((h, m) => {
    const Reel = Date; const n = new Reel();
    const cible = Reel.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), h, m, 0);
    const decalage = cible - n.getTime();
    class Faux extends Reel {
      constructor(...a) { if (a.length === 0) super(Reel.now() + decalage); else super(...a); }
      static now() { return Reel.now() + decalage; }
    }
    window.Date = Faux;
  }, heureUTC, minute);
  const val = 'base64-' + Buffer.from(JSON.stringify(session(id))).toString('base64url');
  await page.setCookie({ name: 'sb-localhost-auth-token', value: val, url: base });
  // pas de bannière « Installer TamCar » ni de languette de rafraîchissement sur les photos
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('tamcar-install-dismissed-at', String(Date.now())); } catch {} });
  await page.evaluateOnNewDocument(() => {
    const st = document.createElement('style');
    st.textContent = 'button[aria-label="Rafraîchir la page"]{display:none!important} nextjs-portal{display:none!important}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
  });
  return { browser, page };
}

export async function photo(page, route, nom, { attente = 2500, plein = false } = {}) {
  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 180000 });
  await new Promise((r) => setTimeout(r, attente));
  const f = path.join(SHOTS, nom + '.png');
  await page.screenshot({ path: f, fullPage: plein });
  return { url: page.url(), f };
}

if (process.argv[1] && process.argv[1].endsWith('shot.mjs')) {
  const [route = '/', nom = 'test'] = process.argv.slice(2);
  const { browser, page } = await ouvrir();
  page.on('console', (m) => { if (['error'].includes(m.type())) console.log('[console]', m.text().slice(0, 160)); });
  const r = await photo(page, route, nom);
  console.log('URL finale :', r.url, '->', r.f);
  await browser.close();
}
