'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useJourneyFrame } from './JourneyShell';
import { HUD_H, HUD_W, HudPanels, updateHud } from './JourneyHud';
import { HudPanelsPartner, updatePartnerHud } from './JourneyHudPartner';
import { SKY_BOT, SKY_TOP, TOTAL, lerp, mix, nightAt, partnerNight, travelAt } from './journey-shared';

/**
 * Version 2D de la route : un seul SVG (villes en parallaxe, chaussée, véhicule de profil, panneaux). Légère et
 * sans bibliothèque : c'est la version de repli de la 3D. Les valeurs sont écrites directement dans le DOM à
 * chaque image (pas de re-rendu React).
 */

const ROAD_TOP = 430; // haut de la chaussée (repère de la scène, le bas de la scène est à 560)
const ROAD_BOTTOM = 560;
const GROUND = 500; // ligne de contact des roues
const CAR_W = 250;
const TILE = 1600;

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

const FAR: [string, string] = ['#C3D7F0', '#12204A'];
const NEAR: [string, string] = ['#9DB5D6', '#0B1533'];
const ROAD: [string, string] = ['#475569', '#1B2433'];
const CURB: [string, string] = ['#CBD5E1', '#2B3A52'];
const BODY: [string, string] = ['#2563EB', '#1D4ED8'];
const GLASS: [string, string] = ['#CFE3FF', '#1B2F6B'];

export default function JourneyScene2D({ variant = 'clients' }: { variant?: 'clients' | 'partners' }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drawRef = useRef<((p: number) => void) | null>(null);
  const lastP = useRef(0);

  const far = useMemo(() => skyline(11, 50, 140, 40, 90, false), []);
  const near = useMemo(() => skyline(27, 80, 215, 46, 100, true), []);
  const stars = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 34 }, () => ({ x: r() * 1500, y: -320 + r() * 460, s: 0.8 + r() * 1.6 }));
  }, []);

  useJourneyFrame((p) => {
    lastP.current = p;
    drawRef.current?.(p);
  });

  useEffect(() => {
    const box = boxRef.current;
    const svg = svgRef.current;
    if (!box || !svg) return;

    const q = <T extends Element>(name: string) => svg.querySelector(`[data-j="${name}"]`) as T | null;
    const qa = <T extends Element>(name: string) => Array.from(svg.querySelectorAll(`[data-j="${name}"]`)) as T[];
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
      hudArrow: q('hudArrow'),
    };

    // Géométrie : dépend de la taille réelle de la zone dessinée
    const geo = { vw: 1200, vh: 560, carX: 160, hudX: 220, hudY: 118, endOff: 340, sunX: 1090 };
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
      geo.sunX = vw - 110;
      svg.setAttribute('viewBox', `0 ${ROAD_BOTTOM - vh} ${vw} ${vh}`);
      const ax = Math.min(HUD_W - 30, Math.max(30, geo.carX + CAR_W / 2 - geo.hudX));
      E.hudArrow?.setAttribute('transform', `translate(${ax} ${HUD_H})`);
    };

    const draw = (p: number) => {
      const night = variant === 'partners' ? partnerNight(p) : nightAt(p);
      const dist = TOTAL * travelAt(p);

      // Ciel, astres, étoiles
      E.skyTop?.setAttribute('stop-color', mix(SKY_TOP[0], SKY_TOP[1], night));
      E.skyBot?.setAttribute('stop-color', mix(SKY_BOT[0], SKY_BOT[1], night));
      E.sun?.setAttribute('transform', `translate(${geo.sunX} ${lerp(95, 270, night)})`);
      E.sun?.setAttribute('opacity', String(1 - night));
      E.moon?.setAttribute('transform', `translate(${geo.sunX} ${lerp(280, 95, night)})`);
      E.moon?.setAttribute('opacity', String(night));
      E.stars?.setAttribute('opacity', String(night * 0.95));

      // Décor qui défile en parallaxe
      E.farG?.setAttribute('transform', `translate(${-((dist * 0.1) % TILE)} 0)`);
      E.nearG?.setAttribute('transform', `translate(${-((dist * 0.3) % TILE)} 0)`);
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
      E.signStart?.setAttribute('transform', `translate(${geo.carX + CAR_W + 150 - dist} ${ROAD_TOP - 4})`);
      E.signEnd?.setAttribute('transform', `translate(${TOTAL * 0.95 + geo.carX + CAR_W + geo.endOff - dist} ${ROAD_TOP - 4})`);

      // Véhicule : suspension, roues, phares
      const bob = Math.sin(dist / 9) * (p < 0.995 ? 1.2 : 0);
      E.car?.setAttribute('transform', `translate(${geo.carX} ${GROUND + bob})`);
      const spin = ((dist / 24) * 180) / Math.PI;
      E.wheels.forEach((el) => el.setAttribute('transform', `rotate(${spin})`));
      E.body?.setAttribute('fill', mix(BODY[0], BODY[1], night));
      E.glass?.setAttribute('fill', mix(GLASS[0], GLASS[1], night));
      E.cone?.setAttribute('opacity', String(night * 0.85));
      E.tail?.setAttribute('opacity', String(0.55 + night * 0.45));

      // Panneaux d'information au-dessus du véhicule
      E.hud?.setAttribute('transform', `translate(${geo.hudX} ${geo.hudY})`);
      if (E.hud) E.hudArrow?.setAttribute('opacity', String(0.4 * (variant === 'partners' ? updatePartnerHud(E.hud, p) : updateHud(E.hud, p))));
    };

    layout();
    drawRef.current = draw;
    draw(lastP.current);
    const onResize = () => {
      layout();
      draw(lastP.current);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    ro?.observe(box);
    window.addEventListener('resize', onResize);
    return () => {
      drawRef.current = null;
      ro?.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [variant]);

  const lamp = (i: number) => (
    <g key={i} transform={`translate(${i * 420} 0)`}>
      <ellipse data-j="lampGlow" cx="14" cy={ROAD_TOP + 6} rx="120" ry="26" fill="url(#jGlow)" opacity="0" />
      <path d={`M0,${ROAD_TOP + 4} V${ROAD_TOP - 128} h30`} fill="none" stroke="#64748B" strokeWidth="5" strokeLinecap="round" />
      <rect data-j="lampHead" x="22" y={ROAD_TOP - 134} width="22" height="9" rx="4" fill="#94A3B8" />
      <path data-j="lampGlow" d={`M22,${ROAD_TOP - 125} L-34,${ROAD_TOP + 6} H80 L44,${ROAD_TOP - 125} Z`} fill="url(#jBeam)" opacity="0" />
    </g>
  );

  return (
    <div ref={boxRef} className="absolute inset-0">
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

        {/* Panneaux de départ et d'arrivée (route des clients seulement) */}
        {variant === 'clients' && (
        <>
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
        </>
        )}

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

        {/* Panneaux d'information au-dessus du véhicule */}
        <g data-j="hud" transform="translate(220 118)">
          {variant === 'partners' ? <HudPanelsPartner /> : <HudPanels />}
          <path data-j="hudArrow" d="M-9,0 h18 l-9,12 Z" fill="#0F172A" opacity="0" transform="translate(165 170)" />
        </g>
      </svg>
    </div>
  );
}
