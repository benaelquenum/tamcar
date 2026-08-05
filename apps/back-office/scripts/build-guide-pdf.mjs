// Génère la version imprimable (A4) du guide TamCar Office.
// Source unique : apps/back-office/src/app/(bo)/guide/content.ts — le PDF et
// la page en ligne ne peuvent donc pas diverger.
//
// À relancer après toute modification du guide, en deux temps :
//
//   1) depuis apps/back-office :
//        node scripts/build-guide-pdf.mjs
//      → écrit scripts/guide_print.html
//
//   2) rendu PDF par Chrome sans en-tête ni pied de page :
//        "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
//          --headless=new --disable-gpu --no-pdf-header-footer ^
//          --run-all-compositor-stages-before-draw --virtual-time-budget=10000 ^
//          --print-to-pdf="public\guide-tamcar-office.pdf" ^
//          "file:///<chemin absolu>/scripts/guide_print.html"
//
//      Copier ensuite le PDF à la racine du dépôt si l'on veut la version
//      « bureau » : copy public\guide-tamcar-office.pdf ..\..\TamCar_Office_guide.pdf

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Racine du dépôt, déduite de l'emplacement du script (apps/back-office/scripts)
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '../../..');
const CONTENT_TS = path.join(
  ROOT,
  'apps/back-office/src/app/(bo)/guide/content.ts',
);
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.slice(1));
const OUT_HTML = path.join(SCRIPT_DIR, 'guide_print.html');

// --- 1. Extraire les données du fichier TypeScript ---------------------
const src = readFileSync(CONTENT_TS, 'utf8');
const start = src.indexOf('export const GUIDE_SECTIONS');
if (start < 0) throw new Error('GUIDE_SECTIONS introuvable');
const dataModule = src.slice(start).replace(': GuideSection[]', '');
const tmpModule = path.join(SCRIPT_DIR, '_guide_content.mjs');
writeFileSync(tmpModule, dataModule, 'utf8');
const { GUIDE_SECTIONS } = await import(pathToFileURL(tmpModule).href);

// --- 2. Logo en base64 -------------------------------------------------
const logo = readFileSync(
  path.join(ROOT, 'apps/back-office/public/logo.png'),
).toString('base64');

// --- 3. Rendu ----------------------------------------------------------
const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const rich = (s) =>
  esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

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
          .map(
            (r) =>
              `<tr>${r
                .map((c, i) => `<td class="${i === 0 ? 'k' : ''}">${rich(c)}</td>`)
                .join('')}</tr>`,
          )
          .join('')}</tbody>
      </table>`;
    case 'note':
      return `<div class="note ${b.tone}">
        <p class="nt">${esc(b.title)}</p>
        <p class="nb">${rich(b.text)}</p>
      </div>`;
    default:
      return '';
  }
}

const num = (i) => String(i + 1).padStart(2, '0');

const toc = GUIDE_SECTIONS.map(
  (s, i) => `<li><span class="n">${num(i)}</span>${esc(s.title)}</li>`,
).join('');

const body = GUIDE_SECTIONS.map(
  (s, i) => `<section>
    <h2><span class="n">${num(i)}</span>${esc(s.title)}</h2>
    ${s.blocks.map(renderBlock).join('\n')}
  </section>`,
).join('\n');

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>TamCar Office — Guide d'utilisation</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  :root { --blue:#2563EB; --blue-d:#1D4ED8; --ink:#0F172A; --gray:#475569; --line:#E2E8F0; --soft:#F8FAFC; }
  @page { size: A4; margin: 14mm 15mm 13mm 15mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Sora', 'Segoe UI', system-ui, sans-serif;
    font-size: 10pt; line-height: 1.55; color: var(--ink); margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* ---------- Couverture ---------- */
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .cover img { width: 46mm; margin-bottom: 14mm; }
  .cover h1 { font-size: 30pt; line-height: 1.1; margin: 0 0 5mm; font-weight: 800; letter-spacing: -0.5pt; }
  .cover h1 span { color: var(--blue); }
  .cover .sub { font-size: 12pt; color: var(--gray); max-width: 130mm; line-height: 1.6; }
  .cover .meta { margin-top: 18mm; padding-top: 5mm; border-top: 2px solid var(--blue); font-size: 8.5pt; color: var(--gray); }

  /* ---------- Sommaire ---------- */
  .toc { page-break-after: always; }
  .toc h2 { font-size: 15pt; margin: 0 0 6mm; font-weight: 800; }
  .toc ol { list-style: none; padding: 0; margin: 0; counter-reset: none; }
  .toc li { padding: 2.6mm 0; padding-left: 0; border-bottom: 1px solid var(--line); font-size: 11pt; font-weight: 600; position: static; }
  .toc li::before { content: none; }
  .n { display: inline-block; width: 11mm; color: var(--blue); font-weight: 700; }

  /* ---------- Sections ---------- */
  section { page-break-before: always; }
  h2 { font-size: 16pt; font-weight: 800; margin: 0 0 4mm; padding-bottom: 2.5mm; border-bottom: 2px solid var(--blue); page-break-after: avoid; }
  h3 { font-size: 9.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6pt; color: var(--blue-d); margin: 5.5mm 0 2.5mm; page-break-after: avoid; }
  p { margin: 0 0 3mm; text-align: justify; }
  strong { font-weight: 700; }

  ul, ol { margin: 0 0 3.5mm; padding-left: 6mm; }
  li { margin-bottom: 1.6mm; text-align: justify; page-break-inside: avoid; }
  section ol { counter-reset: step; list-style: none; padding-left: 0; }
  section ol li { position: relative; padding-left: 9mm; counter-increment: step; }
  section ol li::before {
    content: counter(step); position: absolute; left: 0; top: 0.3mm;
    width: 5.4mm; height: 5.4mm; border-radius: 50%;
    background: #EFF6FF; color: var(--blue-d);
    font-size: 7.5pt; font-weight: 700; text-align: center; line-height: 5.4mm;
  }
  section ul { list-style: none; padding-left: 0; }
  section ul li { position: relative; padding-left: 5mm; }
  section ul li::before { content: ''; position: absolute; left: 0.6mm; top: 2.1mm; width: 1.6mm; height: 1.6mm; border-radius: 50%; background: var(--blue); }

  /* ---------- Tableaux ---------- */
  table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9pt; }
  th { background: var(--soft); text-align: left; padding: 2.4mm 3mm; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5pt; color: var(--gray); border-bottom: 1.5px solid var(--line); }
  td { padding: 2.6mm 3mm; border-bottom: 1px solid var(--line); vertical-align: top; text-align: justify; }
  td.k { font-weight: 700; white-space: normal; width: 32%; text-align: left; }
  tr { page-break-inside: avoid; }

  /* ---------- Encarts ---------- */
  .note { padding: 3.2mm 4mm; border-radius: 2mm; margin: 0 0 4mm; page-break-inside: avoid; border-left: 3px solid; }
  .note.info { background: #EFF6FF; border-color: var(--blue); }
  .note.warn { background: #FFFBEB; border-color: #D97706; }
  .note .nt { font-weight: 800; font-size: 9.5pt; margin: 0 0 1.5mm; }
  .note.info .nt { color: var(--blue-d); }
  .note.warn .nt { color: #B45309; }
  .note .nb { margin: 0; font-size: 9.5pt; }

  .end { margin-top: 8mm; padding-top: 4mm; border-top: 1px solid var(--line); font-size: 8pt; color: var(--gray); text-align: center; }
</style>
</head>
<body>

<div class="cover">
  <img src="data:image/png;base64,${logo}" alt="TamCar">
  <h1>TamCar Office<br><span>Guide d'utilisation</span></h1>
  <p class="sub">Le bureau administratif de TamCar : le courrier, les documents,
  les échéances, l'argent qui sort et qui entre, et la comptabilité.
  Ce guide se lit une fois en entier, puis se consulte au besoin.
  Il ne suppose aucune connaissance en comptabilité.</p>
  <div class="meta">
    Document interne — TamCar SARL · Version d'août 2026<br>
    Version à jour consultable dans l'application : rubrique « Guide d'utilisation ».
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
