// Rendu de la video de presentation : une image par pas de temps, assemblees par ffmpeg (H.264, 1920 x 1080, 30 i/s).
// Usage :
//   node render.mjs --frame 12.5 [sortie.png]     une image (pour controler la mise en page)
//   node render.mjs --frames 6,16,27 [dossier]    plusieurs images
//   node render.mjs --video [sortie.mp4]          la video complete
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve(ICI, '..', 'out');
fs.mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const mode = args[0];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--allow-file-access-from-files', '--force-device-scale-factor=1', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text().slice(0, 160)); });
page.on('pageerror', (e) => console.log('[erreur page]', String(e).slice(0, 200)));
await page.goto(pathToFileURL(path.join(ICI, 'compo.html')).href, { waitUntil: 'load' });
await page.waitForFunction('window.pret === true', { timeout: 120000 });
const DUREE = await page.evaluate('window.DUREE');
const FPS = await page.evaluate('window.FPS');

async function image(t, fichier, type = 'png') {
  await page.evaluate((x) => window.render(x), t);
  await page.screenshot({ path: fichier, type });
}

if (mode === '--frame') {
  const t = Number(args[1]);
  const f = args[2] || path.join(OUT, `frame-${String(t).replace('.', '_')}.png`);
  await image(t, f); console.log('image', t, '->', f);
} else if (mode === '--frames') {
  const dossier = args[2] || OUT;
  for (const t of args[1].split(',').map(Number)) { const f = path.join(dossier, `frame-${String(t).replace('.', '_')}.png`); await image(t, f); console.log('image', t, '->', f); }
} else if (mode === '--video') {
  const sortie = args[1] || path.join(OUT, 'TamCar_presentation.mp4');
  const total = Math.round(DUREE * FPS);
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-r', String(FPS), sortie], { stdio: ['pipe', 'ignore', 'inherit'] });
  const debut = Date.now();
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    await page.evaluate((x) => window.render(x), t);
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`image ${i}/${total} (${(t).toFixed(1)} s) — ${Math.round((Date.now() - debut) / 1000)} s ecoulees`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('video ->', sortie, `(${Math.round((Date.now() - debut) / 1000)} s de rendu)`);
}
await browser.close();
