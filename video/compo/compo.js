// Video de presentation TamCar : tout est fonction du temps t (secondes). Aucune animation CSS : le rendu image par image est deterministe.
const FPS = 30;
const SHOTS = '../demo/shots/';
const T_ENTREE = 5.1;     // le smartphone entre
const T_SORTIE = 90.0;    // le smartphone sort
const T_OUTRO = 90.4;     // ecran final
const DUREE = 100;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, x) => a + (b - a) * x;
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const outCubic = (x) => 1 - Math.pow(1 - x, 3);
const outBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const ramp = (t, a, d) => clamp((t - a) / d);

// ------------------------------------------------------------------ contenu
// side : cote du smartphone ; titre : "|" saute une ligne, *mot* = mot en couleur
const SCENES = [
  { id: 's1', t0: 5.8, t1: 15.8, side: 'right', kicker: 'Commander', title: 'Où allez-vous ?|*Commandez* *en* *quelques* secondes.',
    bullets: ['Un seul champ pour votre destination', 'Maison, travail, favoris : vos lieux sous la main', 'Itinéraire et durée estimés immédiatement'],
    badge: { text: '3 taps pour commander', u: 3.4, dx: 390, dy: -290 } },
  { id: 's2', t0: 15.8, t1: 25.8, side: 'left', kicker: 'Tarifs clairs', title: 'Le prix est annoncé|*avant* la course.',
    sub: 'Le prix affiché est le prix payé : aucune majoration aux heures de pointe.',
    chips: ['Moto', 'Tricycle', 'Essentiel', 'Confort', 'VIP'], bullets: ['Arrivée estimée pour chaque véhicule'],
    badge: { text: 'Prix fixe garanti', u: 3.2, dx: 270, dy: 330 } },
  { id: 's3', t0: 25.8, t1: 36.3, side: 'right', kicker: 'Suivi en direct', title: 'Votre chauffeur arrive.|*Vous* *le* *voyez.*',
    bullets: ['Sa position en direct sur la carte', 'Plaque, véhicule et note du chauffeur', 'Message, appel ou WhatsApp en un geste'],
    badge: { text: 'Arrivée dans ~3 min', u: 1.6, dx: 300, dy: -330, dot: true } },
  { id: 's4', t0: 36.3, t1: 44.8, side: 'left', kicker: 'Paiement', title: 'Payez comme|*vous* *voulez.*',
    chips: ['Espèces', 'Mobile Money', 'TamCar Crédit'], bullets: ['Rechargez votre portefeuille en quelques secondes', 'Un reçu pour chaque course'],
    badge: { text: 'Solde en temps réel', u: 3.0, dx: 290, dy: -300 } },
  { id: 's5', t0: 44.8, t1: 54.3, side: 'right', kicker: 'Réservation et TamPass', title: 'Planifiez vos trajets.|*Abonnez-vous.*',
    bullets: ['Réservez une course à l’avance', 'TamPass : jusqu’à −15 % sur vos trajets réguliers', 'Créneau garanti, avec votre chauffeur habituel'],
    badge: { text: 'Jusqu’à −15 % avec TamPass', u: 4.8, dx: 300, dy: 330 } },
  { id: 's6', t0: 54.3, t1: 62.0, side: 'left', kicker: 'Cotonou ↔ Porto-Novo', title: 'Le corridor,|*sans* *négocier.*',
    sub: 'Un tarif fixe, un départ à l’heure, une voiture privée.', bullets: ['Fini de négocier au taxi', 'Réservez, puis voyagez tranquille'],
    badge: { text: 'Un départ à l’heure', u: 2.6, dx: 280, dy: -320 } },
  { id: 's7', t0: 62.0, t1: 71.0, side: 'right', kicker: 'Sécurité', title: 'Votre sécurité,|*d’abord.*',
    bullets: ['Chauffeurs et véhicules vérifiés', 'Bouton SOS pendant la course', 'Prévenez un proche : il suit votre trajet en direct', 'Notez chaque course'],
    badge: { text: 'SOS en un geste', u: 2.4, dx: 300, dy: -330 } },
  { id: 's8', t0: 71.0, t1: 79.0, side: 'left', kicker: 'Et aussi', title: 'Pensé pour|*votre* *quotidien.*',
    bullets: ['Commander pour un proche', 'Retrouver vos chauffeurs de confiance', 'Inviter vos amis, gagner du crédit TamCar'],
    badge: { text: 'Invitez, gagnez du crédit', u: 4.8, dx: 290, dy: 330 } },
  { id: 's9', t0: 79.0, t1: 90.0, side: 'right', kicker: 'Pour les chauffeurs', title: 'TamCar Pro :|*roulez,* *gagnez,*|*devenez* *propriétaire.*',
    bullets: ['Acceptez les courses autour de vous', 'Vos gains toujours visibles', 'TamAssur : une épargne pour demain', 'Le véhicule devient le vôtre en fin de contrat'],
    badge: { text: 'Courses autour de vous', u: 2.0, dx: 340, dy: -390, dot: true } },
];

// ecrans du smartphone (calendrier global). hl : zones mises en valeur (coordonnees de l'ecran 390 x 844) ; taps : appuis.
const LAYERS = [
  { img: 'c-accueil', t0: 4.9, t1: 10.5, taps: [{ x: 169, y: 349, t: 9.1 }] },
  { img: 'c-trajet', t0: 10.15, t1: 16.9 },
  { img: 'c-vehicules', t0: 16.55, t1: 26.5,
    hl: [[18.8, 184], [20.0, 285], [21.2, 388], [22.4, 500], [23.6, 591]].map(([t, cy]) => ({ x: 276, y: cy - 30, w: 96, h: 60, t0: t, t1: t + 1.2 })) },
  { img: 'c-suivi-route-carte', t0: 26.15, t1: 31.8 },
  { img: 'c-suivi-route', t0: 31.45, t1: 37.2 },
  { img: 'c-portefeuille', t0: 36.85, t1: 45.4, taps: [{ x: 89, y: 262, t: 41.4 }] },
  { img: 'c-reservations', t0: 45.05, t1: 49.9 },
  { img: 'c-tampass', t0: 49.55, t1: 55.0 },
  { img: 'c-corridor', t0: 54.65, t1: 62.7 },
  { img: 'c-suivi-nuit', t0: 62.35, t1: 66.9 },
  { img: 'c-fin', t0: 66.55, t1: 71.7 },
  { img: 'c-menu', t0: 71.35, t1: 75.2 },
  { img: 'c-chauffeurs', t0: 74.85, t1: 77.9 },
  { img: 'c-parrainer', t0: 77.55, t1: 79.7 },
  { img: 'd-accueil-en-ligne', t0: 79.35, t1: 85.3 },
  { img: 'd-tableau-plein', t0: 84.95, t1: 91.5, scroll: [[84.95, 350], [86.5, 360], [89.6, 840]] },
];

// ------------------------------------------------------------------ construction du decor
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function titreHtml(s) {
  return s.split('|').map((ligne) => ligne.split(' ').filter(Boolean).map((m) => {
    const acc = /^\*(.*)\*$/.exec(m);
    return `<span class="w">${acc ? `<em>${acc[1]}</em>` : m}</span>`;
  }).join(' ')).join('<br>');
}

function build() {
  const copies = $('copies');
  SCENES.forEach((s) => {
    const c = el('div', 'copy', '', copies);
    c.style.left = (s.side === 'right' ? 140 : 960) + 'px';
    s.e = { root: c };
    s.e.kicker = el('div', 'kicker', `<i></i>${s.kicker}`, c);
    s.e.title = el('div', 'title', titreHtml(s.title), c);
    s.e.words = [...s.e.title.querySelectorAll('.w')];
    if (s.sub) s.e.sub = el('div', 'sub', s.sub, c);
    if (s.chips) { s.e.chipsBox = el('div', 'chips', '', c); s.e.chips = s.chips.map((t) => el('span', 'chip', t, s.e.chipsBox)); }
    if (s.bullets) { s.e.bulletsBox = el('div', 'bullets', '', c); s.e.bullets = s.bullets.map((t) => el('div', 'bullet', `<span class="ck">${CHECK}</span><span>${t}</span>`, s.e.bulletsBox)); }
    if (s.badge) { s.e.badge = el('div', 'badge', (s.badge.dot ? '<b></b>' : '') + s.badge.text, $('badges')); }
  });
  const screen = $('screen');
  LAYERS.forEach((L) => {
    L.e = el('div', 'layer', `<img src="${SHOTS}${L.img}.png" alt="">`, screen);
    L.e.style.zIndex = 2;
    (L.hl || []).forEach((h) => { h.e = el('div', 'hl', '', screen); h.e.style.cssText += `left:${h.x}px;top:${h.y}px;width:${h.w}px;height:${h.h}px;`; });
    (L.taps || []).forEach((tp) => { tp.e = el('div', 'tap', '', screen); tp.e.style.left = tp.x + 'px'; tp.e.style.top = tp.y + 'px'; });
  });
  const dots = $('dots');
  SCENES.forEach(() => el('i', '', '', dots));
  const cats = $('cats');
  [['moto', 'Moto'], ['tricycle', 'Tricycle'], ['essentiel', 'Essentiel'], ['confort', 'Confort'], ['premium', 'VIP']].forEach(([k, n]) => {
    el('div', 'c', `<img src="assets/cat-${k}.webp" alt="">${n}`, cats);
  });
}

// ------------------------------------------------------------------ position du smartphone
const X_DROITE = 1420, X_GAUCHE = 500;
function phoneX(t) {
  const xs = SCENES.map((s) => (s.side === 'right' ? X_DROITE : X_GAUCHE));
  let x = 2350; // hors champ avant l'entree
  if (t >= T_ENTREE) x = lerp(2350, xs[0], outCubic(ramp(t, T_ENTREE, 1.3)));
  for (let i = 1; i < SCENES.length; i++) {
    if (t >= SCENES[i].t0 - 0.3) x = lerp(xs[i - 1], xs[i], inOut(ramp(t, SCENES[i].t0 - 0.3, 1.2)));
  }
  if (t >= T_SORTIE) x = lerp(xs[xs.length - 1], 2450, inOut(ramp(t, T_SORTIE, 1.3)));
  return x;
}

// ------------------------------------------------------------------ rendu d'une image
function render(t) {
  // fond anime
  const b1 = $('b1'), b2 = $('b2'), b3 = $('b3');
  b1.style.cssText = `width:900px;height:900px;left:${-150 + Math.sin(t * 0.21) * 140}px;top:${-120 + Math.cos(t * 0.17) * 100}px;background:#06B6D4`;
  b2.style.cssText = `width:800px;height:800px;left:${1200 + Math.cos(t * 0.19) * 150}px;top:${380 + Math.sin(t * 0.23) * 120}px;background:#8B5CF6;opacity:.42`;
  b3.style.cssText = `width:520px;height:520px;left:${760 + Math.sin(t * 0.27) * 200}px;top:${760 + Math.cos(t * 0.2) * 90}px;background:#EAB308;opacity:.18`;

  // intro
  const introOut = ramp(t, 4.7, 0.8);
  const intro = $('intro');
  intro.style.opacity = String(ramp(t, 0, 0.8) * (1 - introOut));
  intro.style.transform = `translateY(${-50 * outCubic(introOut)}px)`;
  $('welcome').style.transform = `scale(${lerp(1.08, 1.0, ramp(t, 0, 5.5))})`;
  $('brandTop').style.opacity = String(ramp(t, 0.7, 0.6));
  $('introTag').style.opacity = String(ramp(t, 2.0, 0.7));
  $('introTag').style.transform = `translateY(${lerp(16, 0, outCubic(ramp(t, 2.0, 0.7)))}px)`;

  // smartphone
  const x = phoneX(t);
  const rampSide = clamp((x - X_GAUCHE) / (X_DROITE - X_GAUCHE));
  const ry = lerp(11, -11, rampSide) + Math.sin(t * 0.5) * 2.2;
  const y = 540 + Math.sin(t * 0.9) * 8;
  const entree = ramp(t, T_ENTREE, 1.3), sortie = ramp(t, T_SORTIE, 1.3);
  const rz = lerp(7, 0, outCubic(entree)) + lerp(0, 5, inOut(sortie));
  const sc = 1.0 + 0.012 * Math.sin(t * 0.6);
  const ph = $('phone');
  ph.style.transform = `translate3d(${x}px, ${y}px, 0) rotateY(${ry}deg) rotateX(2deg) rotateZ(${rz}deg) scale(${sc})`;
  ph.style.opacity = String(entree * (1 - sortie));

  // ecrans
  LAYERS.forEach((L) => {
    let a = ramp(t, L.t0, 0.35);
    if (t >= L.t1) a = 0;
    L.e.style.opacity = String(a);
    L.e.style.display = a <= 0 ? 'none' : 'block';
    if (L.scroll) {
      const k = L.scroll; let sy = k[0][1];
      for (let i = 1; i < k.length; i++) if (t >= k[i - 1][0]) sy = lerp(k[i - 1][1], k[i][1], inOut(clamp((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]))));
      L.e.style.transform = `translateY(${-sy}px)`;
    }
    (L.hl || []).forEach((h) => {
      const u = (t - h.t0) / (h.t1 - h.t0);
      const a2 = u < 0 || u > 1 ? 0 : Math.min(1, u * 5, (1 - u) * 5) * (0.8 + 0.2 * Math.sin(t * 9));
      h.e.style.opacity = String(a2);
    });
    (L.taps || []).forEach((tp) => {
      const u = (t - tp.t) / 0.75;
      if (u < 0 || u > 1) { tp.e.style.opacity = '0'; return; }
      tp.e.style.opacity = String(0.95 * (1 - u));
      tp.e.style.transform = `scale(${lerp(0.5, 1.7, outCubic(u))})`;
    });
  });

  // textes de chaque scene
  SCENES.forEach((s) => {
    const u = t - s.t0;
    const visible = t > s.t0 - 0.1 && t < s.t1 + 0.1;
    s.e.root.style.display = visible ? 'flex' : 'none';
    const sortieS = ramp(t, s.t1 - 0.5, 0.5);
    const dirSortie = s.side === 'right' ? -1 : 1;
    s.e.root.style.opacity = String(1 - sortieS);
    s.e.root.style.transform = `translateX(${dirSortie * 60 * inOut(sortieS)}px)`;
    s.e.kicker.style.opacity = String(ramp(u, 0.25, 0.5));
    s.e.kicker.style.transform = `translateY(${lerp(14, 0, outCubic(ramp(u, 0.25, 0.5)))}px)`;
    s.e.words.forEach((w, k) => {
      const p = outCubic(ramp(u, 0.5 + k * 0.07, 0.5));
      w.style.opacity = String(p);
      w.style.transform = `translateY(${lerp(34, 0, p)}px)`;
    });
    if (s.e.sub) {
      const p = ramp(u, 1.25, 0.6);
      s.e.sub.style.opacity = String(p); s.e.sub.style.transform = `translateY(${lerp(14, 0, outCubic(p))}px)`;
    }
    if (s.e.chips) s.e.chips.forEach((c, k) => {
      const p = outBack(ramp(u, 1.7 + k * 0.2, 0.5));
      c.style.opacity = String(clamp(p * 1.4)); c.style.transform = `scale(${lerp(0.6, 1, clamp(p, 0, 1.15))})`;
      // la puce du vehicule mise en avant, en phase avec la zone de prix du smartphone
      const on = s.id === 's2' ? (t > 18.6 + k * 1.2 && t < 18.6 + k * 1.2 + 1.2) : false;
      c.classList.toggle('on', on);
    });
    if (s.e.bullets) s.e.bullets.forEach((b, k) => {
      const start = (s.chips ? 2.0 + s.chips.length * 0.2 : 1.7) + k * 0.6;
      const p = ramp(u, start, 0.5);
      b.style.opacity = String(p); b.style.transform = `translateX(${lerp(-26, 0, outCubic(p))}px)`;
    });
    if (s.e.badge) {
      const bu = u - s.badge.u;
      const p = outBack(clamp(bu / 0.55)) * (1 - ramp(t, s.t1 - 0.6, 0.5));
      const dir = s.side === 'right' ? -1 : 1;
      const b = s.e.badge;
      b.style.opacity = bu < 0 ? '0' : String(clamp(p));
      b.style.left = (x + dir * s.badge.dx) + 'px'; b.style.top = (y + s.badge.dy) + 'px';
      b.style.transform = `translate(-50%, -50%) scale(${lerp(0.6, 1, clamp(p, 0, 1.1))})`;
    }
  });

  // pastilles de progression
  const idx = SCENES.findIndex((s) => t >= s.t0 && t < s.t1);
  [...$('dots').children].forEach((d, i) => {
    d.style.background = i === idx ? '#fff' : 'rgba(255,255,255,.3)';
    d.style.transform = i === idx ? 'scale(1.35)' : 'scale(1)';
  });
  $('dots').style.opacity = String(ramp(t, 6.0, 0.6) * (1 - ramp(t, T_SORTIE, 0.6)));

  // final
  const o = $('outro');
  o.style.opacity = String(ramp(t, T_OUTRO, 0.9));
  const car = $('car');
  const cp = outCubic(ramp(t, T_OUTRO + 0.4, 1.5));
  car.style.transform = `translateX(${lerp(420, 0, cp)}px) scale(${lerp(0.94, 1, cp)})`;
  car.style.opacity = String(cp);
  const logo = o.querySelector('.logo'), slogan = o.querySelector('.slogan'), where = o.querySelector('.where'), url = o.querySelector('.url'), who = o.querySelector('.who');
  [[logo, 0.4], [slogan, 0.9], [where, 1.6], [url, 2.0], [who, 2.4]].forEach(([e, a]) => {
    const p = outCubic(ramp(t, T_OUTRO + a, 0.7)); e.style.opacity = String(p); e.style.transform = `translateY(${lerp(24, 0, p)}px)`;
  });
  [...$('cats').children].forEach((c, k) => {
    const p = outBack(ramp(t, T_OUTRO + 2.8 + k * 0.18, 0.6));
    c.style.opacity = String(clamp(p * 1.3)); c.style.transform = `translateY(${lerp(40, 0, clamp(p, 0, 1.1))}px)`;
  });
  // fondu final doux
  $('stage').style.opacity = String(1 - ramp(t, DUREE - 0.8, 0.8));
}

build();
window.render = render;
window.DUREE = DUREE;
window.FPS = FPS;
Promise.all([document.fonts.ready, ...[...document.images].map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = r; })))]).then(() => { window.pret = true; });
render(0);
