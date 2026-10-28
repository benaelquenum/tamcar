'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './hooks';

/**
 * « Votre course, du clic à l'arrivée » : une scène qui avance quand on défile.
 *
 * Le défilement de la page est la manette : un véhicule roule sur une route de Cotonou à Porto-Novo, le jour
 * tombe, et six promesses TamCar se jouent en chemin (prix verrouillé, chauffeur vérifié, suivi, proche
 * prévenu, SOS, corridor à prix fixe).
 *
 * Léger : un seul SVG, aucune bibliothèque, aucun fichier d'image. Les valeurs sont écrites directement dans
 * le DOM à chaque image (pas de re-rendu React). Sans effet si la personne demande moins de mouvement : le
 * texte des promesses reste alors dans la grille de la page.
 */

export type JourneyStep = { title: string; text: string };

const ROAD_TOP = 430; // haut de la chaussée (repère de la scène, le bas de la scène est à 560)
const ROAD_BOTTOM = 560;
const GROUND = 500; // ligne de contact des roues
const CAR_W = 250;
const TOTAL = 7000; // distance parcourue (unités de la scène) du début à la fin
const HUD_W = 330;
const HUD_H = 170;
const RUNWAY_VH = 540; // longueur de défilement de la section, en hauteurs d'écran
const HEADER_PX = 64; // hauteur de l'en-tête collant du site
const EXAMPLE_PRICE = 1500; // prix d'exemple (illustration)

/** Fenêtres de progression (0 → 1) de chacun des six chapitres. */
const STEPS: [number, number][] = [
  [0.05, 0.2],
  [0.2, 0.36],
  [0.36, 0.52],
  [0.52, 0.68],
  [0.68, 0.83],
  [0.83, 1],
];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function rgb(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TILE = 1600;

/** Silhouette d'une rangée d'immeubles (une « tuile » qui se répète), avec fenêtres éclairées la nuit. */
function skyline(seed: number, minH: number, maxH: number, minW: number, maxW: number, withWindows: boolean) {
  const r = rng(seed);
  let body = '';
  let wins = '';
  let x = 0;
  while (x < TILE) {
    const w = Math.min(minW + r() * (maxW - minW), TILE - x);
    const h = minH + r() * (maxH - minH);
    body += `M${x.toFixed(0)},${ROAD_TOP} V${(ROAD_TOP - h).toFixed(0)} h${w.toFixed(0)} V${ROAD_TOP} Z `;
    if (withWindows) {
      for (let wy = ROAD_TOP - h + 12; wy < ROAD_TOP - 18; wy += 18) {
        for (let wx = x + 8; wx < x + w - 12; wx += 14) {
          if (r() < 0.42) wins += `M${wx.toFixed(0)},${wy.toFixed(0)} h6 v8 h-6 Z `;
        }
      }
    }
    x += w + r() * 14;
  }
  return { body, wins };
}

const fmtNum = (n: number) => n.toLocaleString('fr-FR');

export function RoadJourney({ steps, appUrl }: { steps: JourneyStep[]; appUrl: string }) {
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => setMounted(true), []);

  const far = useMemo(() => skyline(11, 50, 140, 40, 90, false), []);
  const near = useMemo(() => skyline(27, 80, 215, 46, 100, true), []);
  const stars = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 34 }, () => ({ x: r() * 1500, y: -320 + r() * 460, s: 0.8 + r() * 1.6 }));
  }, []);

  useEffect(() => {
    if (!mounted || reduced) return;
    const root = rootRef.current;
    const stage = stageRef.current;
    const box = boxRef.current;
    const svg = svgRef.current;
    if (!root || !stage || !box || !svg) return;

    const q = <T extends Element>(name: string) => svg.querySelector(`[data-j="${name}"]`) as T | null;
    const qa = <T extends Element>(name: string) => Array.from(svg.querySelectorAll(`[data-j="${name}"]`)) as T[];
    const cards = Array.from(stage.querySelectorAll<HTMLElement>('[data-card]'));
    const dots = Array.from(stage.querySelectorAll<HTMLElement>('[data-dot]'));
    const hint = stage.querySelector<HTMLElement>('[data-hint]');
    const cta = stage.querySelector<HTMLElement>('[data-cta]');

    const E = {
      skyTop: q('skyTop'),
      skyBot: q('skyBot'),
      sun: q('sun'),
      moon: q('moon'),
      stars: q('stars'),
      farG: q('farG'),
      farP: qa('farP'),
      nearG: q('nearG'),
      nearP: qa('nearP'),
      wins: qa('wins'),
      lampG: q('lampG'),
      lampGlow: qa('lampGlow'),
      lampHead: qa('lampHead'),
      road: q('road'),
      curb: q('curb'),
      dash: q('dashPattern'),
      car: q('car'),
      body: q('carBody'),
      glass: q('carGlass'),
      wheels: qa('wheel'),
      cone: q('cone'),
      tail: q('tail'),
      signStart: q('signStart'),
      signEnd: q('signEnd'),
      hud: q('hud'),
      hudPanels: qa('hudPanel'),
      hudArrow: q('hudArrow'),
      d1Num: q('d1Num'),
      d1Shackle: q('d1Shackle'),
      d1Locked: q('d1Locked'),
      d2Pill: q('d2Pill'),
      d2Badge: q('d2Badge'),
      d3Fill: q('d3Fill'),
      d3Dot: q('d3Dot'),
      d3Eta: q('d3Eta'),
      d3ShareTxt: q('d3ShareTxt'),
      d4Clock: q('d4Clock'),
      d4Bubble: q('d4Bubble'),
      d4Yes: q('d4Yes'),
      d4Done: q('d4Done'),
      d5Sent: q('d5Sent'),
    };

    // Géométrie : dépend de la taille réelle de la zone dessinée
    const geo = { vw: 1200, vh: 560, carX: 160, hudX: 220, hudY: 118, endOff: 330 };
    const layout = () => {
      const w = box.clientWidth || 1;
      const h = box.clientHeight || 1;
      let vw = (560 * w) / h;
      vw = Math.min(1400, Math.max(560, vw));
      const vh = (vw * h) / w;
      geo.vw = vw;
      geo.vh = vh;
      geo.carX = vw >= 900 ? 160 : 20;
      geo.hudX = vw >= 900 ? geo.carX + 60 : Math.max(16, geo.carX + CAR_W / 2 - HUD_W / 2);
      geo.hudY = 118;
      geo.endOff = vw >= 900 ? 340 : 170;
      svg.setAttribute('viewBox', `0 ${ROAD_BOTTOM - vh} ${vw} ${vh}`);
      // éléments dont la position dépend de la largeur
      E.sun?.setAttribute('data-x', String(vw - 110));
      E.moon?.setAttribute('data-x', String(vw - 110));
      const ax = clamp01(1) * Math.min(HUD_W - 30, Math.max(30, geo.carX + CAR_W / 2 - geo.hudX));
      E.hudArrow?.setAttribute('transform', `translate(${ax} ${HUD_H})`);
    };

    const SKY_TOP: [string, string] = ['#7FBBFF', '#050A1E'];
    const SKY_BOT: [string, string] = ['#EAF4FF', '#1C2C60'];
    const FAR: [string, string] = ['#C3D7F0', '#12204A'];
    const NEAR: [string, string] = ['#9DB5D6', '#0B1533'];
    const ROAD: [string, string] = ['#475569', '#1B2433'];
    const CURB: [string, string] = ['#CBD5E1', '#2B3A52'];
    const BODY: [string, string] = ['#2563EB', '#1D4ED8'];
    const GLASS: [string, string] = ['#CFE3FF', '#1B2F6B'];

    const win = (p: number, k: number) => {
      const [a, b] = STEPS[k];
      const loc = clamp01((p - a) / (b - a));
      const last = k === STEPS.length - 1;
      const v = Math.min(clamp01(loc / 0.14), last ? 1 : clamp01((1 - loc) / 0.14));
      return { loc, v: p < a ? 0 : v };
    };

    const draw = (p: number) => {
      const night = smooth((p - 0.5) / 0.1);
      const travel = p < 0.9 ? p : 0.9 + 0.1 * ((p - 0.9) / 0.1 - Math.pow((p - 0.9) / 0.1, 2) / 2);
      const dist = TOTAL * travel;

      // Ciel, astres, étoiles
      const skyTop = mix(SKY_TOP[0], SKY_TOP[1], night);
      stage.style.backgroundColor = skyTop;
      stage.style.color = mix('#0F172A', '#F8FAFC', night);
      E.skyTop?.setAttribute('stop-color', skyTop);
      E.skyBot?.setAttribute('stop-color', mix(SKY_BOT[0], SKY_BOT[1], night));
      const sx = Number(E.sun?.getAttribute('data-x') ?? 1090);
      E.sun?.setAttribute('transform', `translate(${sx} ${lerp(95, 270, night)})`);
      E.sun?.setAttribute('opacity', String(1 - night));
      E.moon?.setAttribute('transform', `translate(${sx} ${lerp(280, 95, night)})`);
      E.moon?.setAttribute('opacity', String(night));
      E.stars?.setAttribute('opacity', String(night * 0.95));

      // Décor qui défile en parallaxe
      const farOff = (dist * 0.1) % TILE;
      const nearOff = (dist * 0.3) % TILE;
      E.farG?.setAttribute('transform', `translate(${-farOff} 0)`);
      E.nearG?.setAttribute('transform', `translate(${-nearOff} 0)`);
      const farFill = mix(FAR[0], FAR[1], night);
      const nearFill = mix(NEAR[0], NEAR[1], night);
      E.farP.forEach((el) => el.setAttribute('fill', farFill));
      E.nearP.forEach((el) => el.setAttribute('fill', nearFill));
      E.wins.forEach((el) => el.setAttribute('opacity', String(night * 0.95)));

      // Lampadaires (au rythme de la route) : s'allument la nuit
      E.lampG?.setAttribute('transform', `translate(${-(dist % 420)} 0)`);
      E.lampGlow.forEach((el) => el.setAttribute('opacity', String(night * 0.9)));
      E.lampHead.forEach((el) => el.setAttribute('fill', mix('#94A3B8', '#FDE68A', night)));

      // Chaussée
      E.road?.setAttribute('fill', mix(ROAD[0], ROAD[1], night));
      E.curb?.setAttribute('fill', mix(CURB[0], CURB[1], night));
      E.dash?.setAttribute('patternTransform', `translate(${-(dist % 140)} 0)`);

      // Panneaux de départ et d'arrivée (dans le repère de la route)
      const sStart = geo.carX + CAR_W + 150 - dist;
      const sEnd = TOTAL * 0.95 + geo.carX + CAR_W + geo.endOff - dist;
      E.signStart?.setAttribute('transform', `translate(${sStart} ${ROAD_TOP - 4})`);
      E.signEnd?.setAttribute('transform', `translate(${sEnd} ${ROAD_TOP - 4})`);

      // Véhicule : suspension, roues, phares
      const bob = Math.sin(dist / 9) * (p < 0.995 ? 1.2 : 0);
      E.car?.setAttribute('transform', `translate(${geo.carX} ${GROUND + bob})`);
      const spin = ((dist / 24) * 180) / Math.PI;
      E.wheels.forEach((el) => el.setAttribute('transform', `rotate(${spin})`));
      E.body?.setAttribute('fill', mix(BODY[0], BODY[1], night));
      E.glass?.setAttribute('fill', mix(GLASS[0], GLASS[1], night));
      E.cone?.setAttribute('opacity', String(night * 0.85));
      E.tail?.setAttribute('opacity', String(0.55 + night * 0.45));

      // Chapitres : textes, panneau d'information, repères
      let best = 0;
      let bestV = -1;
      STEPS.forEach((_, k) => {
        const { loc, v } = win(p, k);
        if (v > bestV) {
          bestV = v;
          best = k;
        }
        const card = cards[k];
        if (card) {
          card.style.opacity = String(v);
          card.style.transform = `translateY(${(1 - v) * 14}px)`;
          card.style.visibility = v > 0.01 ? 'visible' : 'hidden';
        }
        const panel = E.hudPanels[k];
        if (panel) {
          panel.setAttribute('opacity', String(v));
          panel.setAttribute('transform', `translate(0 ${(1 - v) * 16})`);
        }
        if (k === 0) {
          // Prix : les chiffres montent, puis le cadenas se ferme et le prix ne bouge plus
          const cp = 1 - Math.pow(1 - clamp01(loc / 0.5), 3);
          const val = Math.round((EXAMPLE_PRICE * cp) / 50) * 50;
          const lock = smooth((loc - 0.55) / 0.15);
          if (E.d1Num) {
            E.d1Num.textContent = fmtNum(val);
            E.d1Num.setAttribute('fill', lock > 0.5 ? '#4ADE80' : '#FDE68A');
          }
          E.d1Shackle?.setAttribute('transform', `translate(0 ${-9 * (1 - lock)})`);
          E.d1Locked?.setAttribute('opacity', String(lock));
        } else if (k === 1) {
          // Chauffeur : le badge « photo vérifiée » apparaît
          const pop = smooth((loc - 0.3) / 0.2);
          const sc = 0.6 + 0.4 * pop + Math.sin(pop * Math.PI) * 0.12;
          E.d2Pill?.setAttribute('opacity', String(pop));
          E.d2Pill?.setAttribute('transform', `translate(24 128) scale(${sc})`);
          E.d2Badge?.setAttribute('opacity', String(pop));
        } else if (k === 2) {
          // Suivi : le chauffeur se rapproche, l'arrivée se précise
          const e = smooth(loc / 0.85);
          const x = lerp(30, 296, e);
          E.d3Fill?.setAttribute('x2', String(x));
          E.d3Dot?.setAttribute('transform', `translate(${x} 100)`);
          if (E.d3Eta) E.d3Eta.textContent = `${Math.max(1, Math.round(6 - 5 * e))} min`;
          if (E.d3ShareTxt) E.d3ShareTxt.textContent = loc > 0.72 ? 'Lien envoyé' : 'Partager le suivi';
        } else if (k === 3) {
          // Nuit : l'horloge passe 21 h, l'application propose de prévenir un proche
          const e = smooth(loc / 0.9);
          const mins = 20 * 60 + 52 + Math.floor(20 * e);
          if (E.d4Clock) E.d4Clock.textContent = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
          const show = smooth((mins - 21 * 60) / 3);
          E.d4Bubble?.setAttribute('opacity', String(show));
          const done = smooth((loc - 0.8) / 0.12);
          E.d4Yes?.setAttribute('opacity', String(1 - done));
          E.d4Done?.setAttribute('opacity', String(done));
        } else if (k === 4) {
          E.d5Sent?.setAttribute('opacity', String(smooth((loc - 0.35) / 0.2)));
        }
      });
      E.hud?.setAttribute('transform', `translate(${geo.hudX} ${geo.hudY})`);
      E.hudArrow?.setAttribute('opacity', String(0.4 * Math.max(0, bestV)));
      dots.forEach((d, i) => d.setAttribute('data-on', i === best && p > 0.04 ? '1' : '0'));
      if (hint) {
        const hv = 1 - smooth(p / 0.045);
        hint.style.opacity = String(hv);
        hint.style.visibility = hv > 0.01 ? 'visible' : 'hidden';
      }
      if (cta) {
        const v6 = win(p, 5).v;
        cta.style.opacity = String(v6);
        cta.style.visibility = v6 > 0.5 ? 'visible' : 'hidden';
      }
    };

    // Progression cible (défilement) et progression affichée (rattrape avec un peu d'inertie)
    let target = 0;
    let shown = -1;
    let raf = 0;
    const measure = () => {
      const r = root.getBoundingClientRect();
      const runway = r.height - (window.innerHeight - HEADER_PX);
      target = runway > 0 ? clamp01((HEADER_PX - r.top) / runway) : 0;
    };
    const tick = () => {
      raf = 0;
      measure();
      const d = target - shown;
      shown = shown < 0 || Math.abs(d) < 0.0004 ? target : shown + d * 0.18;
      draw(shown);
      if (Math.abs(target - shown) >= 0.0004) raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onResize = () => {
      layout();
      shown = -1;
      kick();
    };

    layout();
    shown = -1;
    kick();
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    ro?.observe(box);
    return () => {
      window.removeEventListener('scroll', kick);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mounted, reduced]);

  if (!mounted || reduced) return null;

  const lamp = (i: number) => (
    <g key={i} transform={`translate(${i * 420} 0)`}>
      <ellipse data-j="lampGlow" cx="14" cy={ROAD_TOP + 6} rx="120" ry="26" fill="url(#jGlow)" opacity="0" />
      <path d={`M0,${ROAD_TOP + 4} V${ROAD_TOP - 128} h30`} fill="none" stroke="#64748B" strokeWidth="5" strokeLinecap="round" />
      <rect data-j="lampHead" x="22" y={ROAD_TOP - 134} width="22" height="9" rx="4" fill="#94A3B8" />
      <path data-j="lampGlow" d={`M22,${ROAD_TOP - 125} L-34,${ROAD_TOP + 6} H80 L44,${ROAD_TOP - 125} Z`} fill="url(#jBeam)" opacity="0" />
    </g>
  );

  return (
    <div ref={rootRef} role="group" className="relative" style={{ height: `${RUNWAY_VH}vh` }} aria-label="Votre course, du clic à l’arrivée">
      <div
        ref={stageRef}
        className="sticky flex flex-col overflow-hidden"
        style={{ top: HEADER_PX, height: `calc(100vh - ${HEADER_PX}px)`, backgroundColor: '#7FBBFF', color: '#0F172A' }}
      >
        {/* Texte du chapitre en cours : les six s'empilent au même endroit, un seul est visible */}
        <div className="relative z-10 mx-auto w-full max-w-2xl px-lg pt-lg text-center sm:pt-xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-70">Votre course, du clic à l’arrivée</p>
          <div className="mt-sm grid">
            <div data-hint className="col-start-1 row-start-1" aria-hidden="true">
              <h2 className="text-2xl font-extrabold leading-tight sm:text-3xl">Montez à bord.</h2>
              <p className="mx-auto mt-sm max-w-xl text-base leading-relaxed opacity-85 sm:text-lg">Faites défiler : la route avance avec vous.</p>
            </div>
            {steps.map((s) => (
              <div key={s.title} data-card className="col-start-1 row-start-1" style={{ opacity: 0, visibility: 'hidden' }} aria-hidden="true">
                <h2 className="text-2xl font-extrabold leading-tight sm:text-3xl">{s.title}</h2>
                <p className="mx-auto mt-sm max-w-xl text-base leading-relaxed opacity-85 sm:text-lg">{s.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Scène */}
        <div ref={boxRef} className="relative min-h-0 flex-1">
          <svg ref={svgRef} className="absolute inset-0 h-full w-full font-sans" viewBox="0 -300 1200 860" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="jSky" x1="0" y1="0" x2="0" y2="1">
                <stop data-j="skyTop" offset="0" stopColor="#7FBBFF" />
                <stop data-j="skyBot" offset="1" stopColor="#EAF4FF" />
              </linearGradient>
              <radialGradient id="jGlow">
                <stop offset="0" stopColor="#FDE68A" stopOpacity="0.7" />
                <stop offset="1" stopColor="#FDE68A" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="jBeam" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#FDE68A" stopOpacity="0.55" />
                <stop offset="1" stopColor="#FDE68A" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="jCone" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#FEF9C3" stopOpacity="0.85" />
                <stop offset="1" stopColor="#FEF9C3" stopOpacity="0" />
              </linearGradient>
              <pattern id="jDash" data-j="dashPattern" width="140" height="10" patternUnits="userSpaceOnUse">
                <rect x="0" y="2" width="70" height="6" rx="3" fill="#FACC15" />
              </pattern>
            </defs>

            {/* Ciel */}
            <rect x="-300" y="-2000" width="2400" height="2560" fill="url(#jSky)" />
            <g data-j="stars" opacity="0">
              {stars.map((s, i) => (
                <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#fff" />
              ))}
            </g>
            <g data-j="sun" opacity="1">
              <circle r="54" fill="#FEF3C7" opacity="0.5" />
              <circle r="34" fill="#FDE68A" />
            </g>
            <g data-j="moon" opacity="0">
              <circle r="30" fill="#F1F5F9" />
              <circle cx="-9" cy="-6" r="6" fill="#CBD5E1" />
              <circle cx="10" cy="9" r="4.5" fill="#CBD5E1" />
            </g>

            {/* Villes en parallaxe */}
            <g data-j="farG">
              <path data-j="farP" d={far.body} fill="#C3D7F0" />
              <path data-j="farP" transform={`translate(${TILE} 0)`} d={far.body} fill="#C3D7F0" />
            </g>
            <g data-j="nearG">
              <path data-j="nearP" d={near.body} fill="#9DB5D6" />
              <path data-j="nearP" transform={`translate(${TILE} 0)`} d={near.body} fill="#9DB5D6" />
              <path data-j="wins" d={near.wins} fill="#FDE68A" opacity="0" />
              <path data-j="wins" transform={`translate(${TILE} 0)`} d={near.wins} fill="#FDE68A" opacity="0" />
            </g>

            {/* Chaussée */}
            <rect data-j="curb" x="-300" y={ROAD_TOP - 6} width="2400" height="14" fill="#CBD5E1" />
            <rect data-j="road" x="-300" y={ROAD_TOP + 8} width="2400" height={ROAD_BOTTOM - ROAD_TOP + 300} fill="#475569" />
            <rect x="-300" y={GROUND + 44} width="2400" height="10" fill="url(#jDash)" />
            <g data-j="lampG">{[0, 1, 2, 3, 4, 5].map(lamp)}</g>

            {/* Panneaux de départ et d'arrivée */}
            <g data-j="signStart" transform="translate(500 426)">
              <rect x="-4" y="-120" width="8" height="120" rx="3" fill="#64748B" />
              <rect x="-96" y="-168" width="192" height="58" rx="10" fill="#1D4ED8" stroke="#fff" strokeWidth="3" />
              <text x="0" y="-132" textAnchor="middle" fontSize="26" fontWeight="800" fill="#fff">Cotonou</text>
            </g>
            <g data-j="signEnd" transform="translate(9000 426)">
              <rect x="-4" y="-120" width="8" height="120" rx="3" fill="#64748B" />
              <rect x="-110" y="-168" width="220" height="58" rx="10" fill="#15803D" stroke="#fff" strokeWidth="3" />
              <text x="0" y="-132" textAnchor="middle" fontSize="26" fontWeight="800" fill="#fff">Porto-Novo</text>
            </g>

            {/* Véhicule (vu de profil, vers la droite) : l'origine est au contact des roues, à l'arrière */}
            <g data-j="car" transform={`translate(160 ${GROUND})`}>
              <path data-j="cone" d="M246,-52 L640,-120 V4 Z" fill="url(#jCone)" opacity="0" />
              <ellipse cx="125" cy="2" rx="118" ry="7" fill="#000" opacity="0.28" />
              <path
                data-j="carBody"
                d="M6,-26 V-50 Q6,-62 20,-66 L62,-74 L92,-100 Q97,-104 104,-104 H172 Q181,-104 187,-97 L208,-72 L232,-66 Q246,-63 246,-50 V-26 Q246,-22 242,-22 H6 Z"
                fill="#2563EB"
              />
              <path data-j="carGlass" d="M70,-72 L96,-94 H170 Q176,-94 180,-89 L198,-70 Z" fill="#CFE3FF" />
              <path d="M133,-94 V-70" stroke="#2563EB" strokeWidth="4" />
              <circle cx="152" cy="-83" r="9" fill="#1E293B" opacity="0.85" />
              <path d="M138,-70 Q152,-86 166,-70 Z" fill="#1E293B" opacity="0.85" />
              <text x="124" y="-40" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" letterSpacing="1">TamCar</text>
              <rect x="236" y="-58" width="10" height="9" rx="3" fill="#FEF9C3" />
              <rect data-j="tail" x="4" y="-56" width="8" height="10" rx="3" fill="#EF4444" opacity="0.6" />
              {[56, 196].map((cx) => (
                <g key={cx} transform={`translate(${cx} -24)`}>
                  <circle r="25" fill="#0F172A" />
                  <g data-j="wheel">
                    <circle r="15" fill="#94A3B8" />
                    {[0, 72, 144, 216, 288].map((a) => (
                      <line key={a} x1="0" y1="0" x2="0" y2="-14" stroke="#475569" strokeWidth="3" transform={`rotate(${a})`} />
                    ))}
                    <circle r="4" fill="#E2E8F0" />
                  </g>
                </g>
              ))}
            </g>

            {/* Panneau d'information au-dessus du véhicule : un par chapitre */}
            <g data-j="hud" transform="translate(220 118)">
              {/* 1 · Le prix avant de partir : les chiffres montent, le cadenas se ferme */}
              <g data-j="hudPanel" opacity="0">
                <rect width={HUD_W} height={HUD_H} rx="22" fill="#0B1220" stroke="#1E293B" strokeWidth="2" />
                <text x="24" y="38" fontSize="12" fontWeight="700" fill="#94A3B8" letterSpacing="2">EXEMPLE DE COURSE</text>
                <text data-j="d1Num" x="24" y="104" fontSize="58" fontWeight="800" fill="#FDE68A" style={{ fontVariantNumeric: 'tabular-nums' }}>0</text>
                <text x="214" y="104" fontSize="28" fontWeight="700" fill="#94A3B8">F</text>
                <g transform="translate(262 62)">
                  <g data-j="d1Shackle">
                    <path d="M8,14 V8 a12,12 0 0 1 24,0 V14" fill="none" stroke="#E2E8F0" strokeWidth="5" strokeLinecap="round" />
                  </g>
                  <rect x="0" y="14" width="40" height="32" rx="7" fill="#E2E8F0" />
                  <circle cx="20" cy="30" r="4.5" fill="#0B1220" />
                </g>
                <g data-j="d1Locked" opacity="0">
                  <rect x="24" y="126" width="196" height="30" rx="15" fill="#052E16" />
                  <text x="122" y="146" textAnchor="middle" fontSize="14" fontWeight="800" fill="#4ADE80">Prix verrouillé</text>
                </g>
              </g>

              {/* 2 · Un chauffeur que vous reconnaissez */}
              <g data-j="hudPanel" opacity="0">
                <rect width={HUD_W} height={HUD_H} rx="22" fill="#fff" stroke="#E2E8F0" strokeWidth="2" />
                <circle cx="70" cy="66" r="38" fill="#DBEAFE" />
                <circle cx="70" cy="56" r="13" fill="#2563EB" />
                <path d="M42,96 Q70,64 98,96 Q98,102 92,102 H48 Q42,102 42,96 Z" fill="#2563EB" />
                <g data-j="d2Badge" opacity="0">
                  <circle cx="100" cy="98" r="13" fill="#16A34A" stroke="#fff" strokeWidth="3" />
                  <path d="M93,98 l5,5 l9,-10" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                </g>
                <text x="132" y="62" fontSize="20" fontWeight="800" fill="#0F172A">Votre chauffeur</text>
                <rect x="132" y="76" width="150" height="9" rx="4.5" fill="#E2E8F0" />
                <rect x="132" y="92" width="104" height="9" rx="4.5" fill="#E2E8F0" />
                <g data-j="d2Pill" opacity="0" transform="translate(24 128)">
                  <rect width="190" height="30" rx="15" fill="#DCFCE7" />
                  <text x="95" y="20" textAnchor="middle" fontSize="14" fontWeight="800" fill="#15803D">Photo vérifiée</text>
                </g>
              </g>

              {/* 3 · Le suivi en direct */}
              <g data-j="hudPanel" opacity="0">
                <rect width={HUD_W} height={HUD_H} rx="22" fill="#0F172A" stroke="#1E293B" strokeWidth="2" />
                <text x="24" y="36" fontSize="12" fontWeight="700" fill="#94A3B8" letterSpacing="2">ARRIVÉE ESTIMÉE</text>
                <text data-j="d3Eta" x="306" y="40" textAnchor="end" fontSize="26" fontWeight="800" fill="#38BDF8" style={{ fontVariantNumeric: 'tabular-nums' }}>6 min</text>
                <line x1="30" y1="100" x2="300" y2="100" stroke="#334155" strokeWidth="6" strokeLinecap="round" strokeDasharray="2 12" />
                <line data-j="d3Fill" x1="30" y1="100" x2="30" y2="100" stroke="#38BDF8" strokeWidth="6" strokeLinecap="round" />
                <path d="M300,84 a12,12 0 1 1 0.1,0 L300,112 Z" transform="translate(0 -2)" fill="#EF4444" />
                <circle cx="300" cy="82" r="4" fill="#fff" />
                <g data-j="d3Dot" transform="translate(30 100)">
                  <circle r="13" fill="#38BDF8" opacity="0.3" />
                  <circle r="8" fill="#fff" stroke="#38BDF8" strokeWidth="4" />
                </g>
                <rect x="24" y="126" width="200" height="30" rx="15" fill="#1E293B" />
                <text data-j="d3ShareTxt" x="124" y="146" textAnchor="middle" fontSize="14" fontWeight="700" fill="#E2E8F0">Partager le suivi</text>
              </g>

              {/* 4 · La nuit, un proche prévenu */}
              <g data-j="hudPanel" opacity="0">
                <rect width={HUD_W} height={HUD_H} rx="22" fill="#111C3A" stroke="#223059" strokeWidth="2" />
                <text data-j="d4Clock" x="24" y="64" fontSize="46" fontWeight="800" fill="#E0E7FF" style={{ fontVariantNumeric: 'tabular-nums' }}>20:52</text>
                <circle cx="286" cy="44" r="16" fill="#F1F5F9" />
                <circle cx="294" cy="38" r="14" fill="#111C3A" />
                <g data-j="d4Bubble" opacity="0">
                  <rect x="24" y="84" width="282" height="64" rx="16" fill="#1D4ED8" />
                  <text x="40" y="108" fontSize="14" fontWeight="800" fill="#fff">Prévenir un proche ?</text>
                  <g data-j="d4Yes">
                    <rect x="40" y="116" width="64" height="24" rx="12" fill="#fff" />
                    <text x="72" y="133" textAnchor="middle" fontSize="13" fontWeight="800" fill="#1D4ED8">Oui</text>
                    <rect x="112" y="116" width="64" height="24" rx="12" fill="#1E40AF" />
                    <text x="144" y="133" textAnchor="middle" fontSize="13" fontWeight="700" fill="#BFDBFE">Non</text>
                  </g>
                  <g data-j="d4Done" opacity="0">
                    <rect x="40" y="116" width="150" height="24" rx="12" fill="#16A34A" />
                    <text x="115" y="133" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">Proche prévenu</text>
                  </g>
                </g>
              </g>

              {/* 5 · Un bouton SOS */}
              <g data-j="hudPanel" opacity="0">
                <rect width={HUD_W} height={HUD_H} rx="22" fill="#2A0D10" stroke="#5B1B22" strokeWidth="2" />
                <g transform="translate(86 82)">
                  <circle className="tc-sos-ring" r="40" fill="#EF4444" />
                  <circle className="tc-sos-ring" r="40" fill="#EF4444" style={{ animationDelay: '0.9s' }} />
                  <circle r="40" fill="#DC2626" stroke="#FCA5A5" strokeWidth="3" />
                  <text y="9" textAnchor="middle" fontSize="26" fontWeight="900" fill="#fff">SOS</text>
                </g>
                <g data-j="d5Sent" opacity="0">
                  <text x="146" y="70" fontSize="16" fontWeight="800" fill="#FECACA">Alerte envoyée</text>
                  <text x="146" y="94" fontSize="13" fontWeight="600" fill="#FCA5A5">L’équipe TamCar est</text>
                  <text x="146" y="112" fontSize="13" fontWeight="600" fill="#FCA5A5">prévenue tout de suite.</text>
                  <circle cx="302" cy="62" r="12" fill="#16A34A" />
                  <path d="M296,62 l4,4 l8,-9" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </g>

              {/* 6 · Le corridor Cotonou ↔ Porto-Novo : prix fixe */}
              <g data-j="hudPanel" opacity="0">
                <rect width={HUD_W} height={HUD_H} rx="22" fill="#1D4ED8" />
                <rect x="9" y="9" width={HUD_W - 18} height={HUD_H - 18} rx="15" fill="none" stroke="#fff" strokeWidth="3" />
                <text x="165" y="70" textAnchor="middle" fontSize="28" fontWeight="800" fill="#fff">Cotonou</text>
                <text x="165" y="104" textAnchor="middle" fontSize="28" fontWeight="800" fill="#fff">Porto-Novo</text>
                <path d="M34,76 h30 m-8,-8 l8,8 l-8,8" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M296,98 h-30 m8,-8 l-8,8 l8,8" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="95" y="118" width="140" height="28" rx="14" fill="#FACC15" />
                <text x="165" y="137" textAnchor="middle" fontSize="14" fontWeight="900" fill="#1E293B" letterSpacing="2">PRIX FIXE</text>
              </g>
              <path data-j="hudArrow" d="M-9,0 h18 l-9,12 Z" fill="#0F172A" opacity="0.4" transform="translate(165 170)" />
            </g>
          </svg>
        </div>

        {/* Repères : chapitre en cours, invitation à défiler, appel à l'action final */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[14px] z-10 flex flex-col items-end gap-sm px-lg sm:items-center sm:px-0">
          <a
            data-cta
            href={appUrl}
            className="pointer-events-auto rounded-full bg-gradient-to-r from-primary-500 to-primary-700 px-xl py-sm text-sm font-bold text-white shadow-glow transition hover:brightness-110 sm:px-2xl sm:py-md sm:text-base"
            style={{ opacity: 0, visibility: 'hidden' }}
          >
            <span className="sm:hidden">Ouvrir l’appli</span>
            <span className="hidden sm:inline">Ouvrir l’application TamCar</span>
          </a>
          <div className="flex gap-sm self-center" aria-hidden="true">
            {steps.map((s) => (
              <span key={s.title} data-dot data-on="0" className="tc-journey-dot h-2 w-6 rounded-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
