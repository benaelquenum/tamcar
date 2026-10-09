// Génère le PDF du guide d'utilisation du back-office TamCar (console d'administration).
// Source unique : apps/client/src/app/admin/guide/content.ts — la fenêtre « Guide » du back-office et le PDF
// ne peuvent donc pas diverger.
//
// À relancer après toute modification de content.ts, depuis apps/client :
//
//     node scripts/build-admin-guide.mjs
//
// Le script (1) produit scripts/admin_guide_print.html, (2) le fait imprimer en PDF par Chrome (ou Edge) sans
// en-tête ni pied de page, (3) écrit le PDF dans src/app/admin/guide/guidePdf.ts (base64), que sert la route
// protégée /admin/guide/pdf (réservée aux administrateurs : le PDF n'est pas dans /public).
// Il écrit aussi une copie lisible à la racine du dépôt : TamCar_guide_back-office.pdf.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(SCRIPT_DIR, '..');
const ROOT = path.resolve(APP, '../..');
const CONTENT_TS = path.join(APP, 'src/app/admin/guide/content.ts');
const OUT_HTML = path.join(SCRIPT_DIR, 'admin_guide_print.html');
const OUT_PDF = path.join(SCRIPT_DIR, 'admin_guide.pdf');
const OUT_TS = path.join(APP, 'src/app/admin/guide/guidePdf.ts');
const OUT_COPY = path.join(ROOT, 'TamCar_guide_back-office.pdf');

const VERSION = 'Version d’octobre 2026';

// --- 1. Extraire les données du fichier TypeScript ---------------------
const src = readFileSync(CONTENT_TS, 'utf8');
const start = src.lastIndexOf("export const GUIDE_SECTIONS");
if (start < 0) throw new Error('GUIDE_SECTIONS introuvable');
const dataModule = src.slice(start).replace(': GuideSection[]', '');
const tmpModule = path.join(SCRIPT_DIR, '_admin_guide_content.mjs');
writeFileSync(tmpModule, dataModule, 'utf8');
const { GUIDE_SECTIONS } = await import(pathToFileURL(tmpModule).href);

// --- 2. Logo en base64 -------------------------------------------------
const logo = readFileSync(path.join(APP, 'public/logo.png')).toString('base64');

// --- 3. Rendu HTML -----------------------------------------------------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

function renderBlock(b) {
  switch (b.type) {
    case 'p':
      return `<p>${rich(b.text)}</p>`;
    case 'h3':
      return `<h3>${esc(b.text)}</h3>`;
    case 'ul':
      return `<ul>${b.items.map((i) => `<li>${rich(i)}</li>`).join('')}</ul>`;
    case 'steps':
      return `<ol>${b.items.map((i) => `<li>${rich(i)}</li>`).join('')}</ol>`;
    case 'table':
      return `<table>
        <thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${b.rows
          .map((r) => `<tr>${r.map((c, i) => `<td class="${i === 0 ? 'k' : ''}">${rich(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody>
      </table>`;
    case 'note':
      return `<div class="note ${b.tone}"><p class="nt">${esc(b.title)}</p><p class="nb">${rich(b.text)}</p></div>`;
    default:
      return '';
  }
}

const num = (i) => String(i + 1).padStart(2, '0');

// Sommaire groupé par rubrique
let toc = '';
let lastGroup = '';
GUIDE_SECTIONS.forEach((s, i) => {
  if (s.group !== lastGroup) {
    toc += `<li class="grp">${esc(s.group)}</li>`;
    lastGroup = s.group;
  }
  toc += `<li><span class="n">${num(i)}</span>${esc(s.title)}${s.path ? `<span class="p">${esc(s.path)}</span>` : ''}</li>`;
});

// Corps : une rubrique commence sur une nouvelle page, les onglets d'une même rubrique s'enchaînent
lastGroup = '';
const body = GUIDE_SECTIONS.map((s, i) => {
  const newGroup = s.group !== lastGroup;
  lastGroup = s.group;
  return `<section class="${newGroup ? 'grp-start' : ''}">
    ${newGroup ? `<p class="grp-label">${esc(s.group)}</p>` : ''}
    <h2><span class="n">${num(i)}</span>${esc(s.title)}${s.path ? `<span class="path">${esc(s.path)}</span>` : ''}</h2>
    ${s.blocks.map(renderBlock).join('\n')}
  </section>`;
}).join('\n');

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Back-office TamCar — Guide d'utilisation</title>
<style>
  :root { --blue:#2563EB; --blue-d:#1D4ED8; --ink:#0F172A; --gray:#475569; --line:#E2E8F0; --soft:#F8FAFC; }
  @page { size: A4; margin: 14mm 15mm 16mm 15mm; @bottom-center { content: counter(page); font: 8pt 'Segoe UI', sans-serif; color: #64748B; } }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', 'Sora', system-ui, sans-serif;
    font-size: 10pt; line-height: 1.5; color: var(--ink); margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .cover img { width: 46mm; margin-bottom: 14mm; }
  .cover h1 { font-size: 30pt; line-height: 1.1; margin: 0 0 5mm; font-weight: 800; letter-spacing: -0.5pt; }
  .cover h1 span { color: var(--blue); }
  .cover .sub { font-size: 12pt; color: var(--gray); max-width: 135mm; line-height: 1.6; }
  .cover .meta { margin-top: 18mm; padding-top: 5mm; border-top: 2px solid var(--blue); font-size: 8.5pt; color: var(--gray); }

  .toc { page-break-after: always; }
  .toc h2 { font-size: 15pt; margin: 0 0 5mm; font-weight: 800; }
  .toc ol { list-style: none; padding: 0; margin: 0; }
  .toc li { padding: 1.6mm 0; border-bottom: 1px solid var(--line); font-size: 10.5pt; font-weight: 600; }
  .toc li.grp { border-bottom: none; padding: 4mm 0 1mm; font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7pt; color: var(--blue-d); }
  .toc .p { float: right; font-family: Consolas, monospace; font-weight: 400; font-size: 8pt; color: #64748B; }
  .n { display: inline-block; width: 11mm; color: var(--blue); font-weight: 700; }

  section { margin-bottom: 9mm; }
  section.grp-start { page-break-before: always; }
  .grp-label { font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8pt; color: var(--blue-d); margin: 0 0 2mm; }
  h2 { font-size: 15pt; font-weight: 800; margin: 0 0 3.5mm; padding-bottom: 2mm; border-bottom: 2px solid var(--blue); page-break-after: avoid; }
  h2 .path { float: right; font-family: Consolas, monospace; font-size: 8pt; font-weight: 400; color: #64748B; margin-top: 2.5mm; }
  h3 { font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6pt; color: var(--blue-d); margin: 4.5mm 0 2mm; page-break-after: avoid; }
  p { margin: 0 0 2.8mm; }
  strong { font-weight: 700; }

  ul, ol { margin: 0 0 3.2mm; padding-left: 6mm; }
  li { margin-bottom: 1.5mm; page-break-inside: avoid; }
  section ol { counter-reset: step; list-style: none; padding-left: 0; }
  section ol li { position: relative; padding-left: 8.5mm; counter-increment: step; }
  section ol li::before {
    content: counter(step); position: absolute; left: 0; top: 0.3mm; width: 5.4mm; height: 5.4mm; border-radius: 50%;
    background: #EFF6FF; color: var(--blue-d); font-size: 7.5pt; font-weight: 700; text-align: center; line-height: 5.4mm;
  }
  section ul { list-style: none; padding-left: 0; }
  section ul li { position: relative; padding-left: 5mm; }
  section ul li::before { content: ''; position: absolute; left: 0.6mm; top: 2mm; width: 1.6mm; height: 1.6mm; border-radius: 50%; background: var(--blue); }

  table { width: 100%; border-collapse: collapse; margin: 0 0 3.5mm; font-size: 9pt; }
  th { background: var(--soft); text-align: left; padding: 2.2mm 3mm; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5pt; color: var(--gray); border-bottom: 1.5px solid var(--line); }
  td { padding: 2.2mm 3mm; border-bottom: 1px solid var(--line); vertical-align: top; }
  td.k { font-weight: 700; width: 32%; }
  tr { page-break-inside: avoid; }

  .note { padding: 3mm 4mm; border-radius: 2mm; margin: 0 0 3.5mm; page-break-inside: avoid; border-left: 3px solid; }
  .note.info { background: #EFF6FF; border-color: var(--blue); }
  .note.warn { background: #FFFBEB; border-color: #D97706; }
  .note .nt { font-weight: 800; font-size: 9.5pt; margin: 0 0 1.2mm; }
  .note.info .nt { color: var(--blue-d); }
  .note.warn .nt { color: #B45309; }
  .note .nb { margin: 0; font-size: 9.5pt; }

  .end { margin-top: 8mm; padding-top: 4mm; border-top: 1px solid var(--line); font-size: 8pt; color: var(--gray); text-align: center; }
</style>
</head>
<body>

<div class="cover">
  <img src="data:image/png;base64,${logo}" alt="TamCar">
  <h1>Back-office TamCar<br><span>Guide d'utilisation</span></h1>
  <p class="sub">À quoi sert chaque onglet du back-office, et où aller pour chaque tâche :
  enregistrer un chauffeur, un véhicule, un partenaire, payer un retrait, régler les bonus…
  Ce guide se lit une fois en entier, puis se consulte au besoin.</p>
  <div class="meta">
    Document interne — TamCar · ${VERSION}<br>
    La version à jour est consultable dans le back-office : bouton « Guide d'utilisation » en bas du menu.
  </div>
</div>

<div class="toc">
  <h2>Sommaire</h2>
  <ol>${toc}</ol>
</div>

${body}

<p class="end">Une question que ce guide ne couvre pas ? Notez-la et transmettez-la au fondateur : le guide sera complété.</p>

</body>
</html>`;

writeFileSync(OUT_HTML, html, 'utf8');
console.log('HTML écrit :', OUT_HTML, `(${GUIDE_SECTIONS.length} sections)`);

// --- 4. Rendu PDF par Chrome / Edge --------------------------------------
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const browser = CANDIDATES.find((p) => existsSync(p));
if (!browser) throw new Error('Chrome ou Edge introuvable (définir CHROME_PATH)');
execFileSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=10000',
    `--print-to-pdf=${OUT_PDF}`,
    pathToFileURL(OUT_HTML).href,
  ],
  { stdio: 'ignore', timeout: 120000 },
);
if (!existsSync(OUT_PDF)) throw new Error('Le PDF n’a pas été produit');

// --- 5. Embarquer le PDF (route protégée) + copie à la racine -----------------
const pdf = readFileSync(OUT_PDF);
writeFileSync(
  OUT_TS,
  `// Fichier GÉNÉRÉ par scripts/build-admin-guide.mjs — ne pas modifier à la main.\n` +
    `// PDF du guide d'utilisation du back-office, servi par la route protégée /admin/guide/pdf.\n` +
    `export const GUIDE_PDF_BASE64 =\n  '${pdf.toString('base64')}';\n`,
  'utf8',
);
mkdirSync(path.dirname(OUT_COPY), { recursive: true });
copyFileSync(OUT_PDF, OUT_COPY);
console.log(`PDF : ${(pdf.length / 1024).toFixed(0)} Ko → ${path.relative(ROOT, OUT_TS)} et ${path.relative(ROOT, OUT_COPY)}`);
