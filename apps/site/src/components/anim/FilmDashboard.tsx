'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { pulse, rise } from './film-timeline';

/**
 * Séquence 4 : le tableau de suivi, inspiré de l'espace partenaire TamCar (carte, véhicule en déplacement, informations
 * synthétiques). AUCUN chiffre, aucune statistique : seulement des états. Dessiné en SVG ; à remplacer par de vraies
 * captures de la plateforme dès qu'elles sont disponibles (voir `src/app/(public)/partenaires/film/page.tsx`).
 */

export type PanelApi = { update: (t: number) => void };

const ROUTE = 'M 34 214 C 80 206, 96 168, 140 160 S 214 152, 246 122 S 306 72, 366 44';
const BLOCKS: [number, number, number, number][] = [
  [20, 30, 44, 30], [74, 30, 52, 24], [136, 24, 40, 34], [186, 36, 58, 22], [254, 28, 46, 32], [310, 30, 62, 26],
  [20, 104, 36, 40], [66, 112, 50, 30], [186, 90, 42, 28], [238, 82, 36, 26], [320, 100, 52, 34],
  [24, 176, 52, 24], [96, 186, 44, 34], [190, 196, 56, 30], [262, 178, 44, 30], [324, 160, 48, 38],
];
const TILES: { t: string; d: string }[] = [
  { t: 'Position', d: 'Suivie en direct' },
  { t: 'Activité', d: 'Course après course' },
  { t: 'Contrat', d: 'Règles définies' },
];

export const FilmDashboard = forwardRef<PanelApi>(function FilmDashboard(_props, ref) {
  const root = useRef<HTMLDivElement>(null);
  const route = useRef<SVGPathElement>(null);
  const done = useRef<SVGPathElement>(null);
  const mark = useRef<SVGGElement>(null);
  const tiles = useRef<(HTMLDivElement | null)[]>([]);
  const len = useRef(0);

  useImperativeHandle(
    ref,
    () => ({
      update(t: number) {
        const el = root.current;
        if (!el) return;
        const o = pulse(t, 20.0, 21.2, 26.0, 27.0);
        el.style.opacity = String(o);
        el.style.visibility = o > 0.01 ? 'visible' : 'hidden';
        if (o <= 0.01) return;
        el.style.transform = `translateX(-50%) translateY(${(1 - o) * 14}px) scale(${0.97 + 0.03 * o})`;
        const path = route.current;
        if (!path) return;
        if (!len.current) len.current = path.getTotalLength();
        const k = rise(t, 21.4, 26.0);
        const L = len.current;
        done.current?.setAttribute('stroke-dasharray', `${L * k} ${L}`);
        const p = path.getPointAtLength(L * k);
        mark.current?.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
        tiles.current.forEach((tl, i) => {
          if (!tl) return;
          const v = rise(t, 22.2 + i * 0.9, 22.8 + i * 0.9);
          tl.style.opacity = String(v);
          tl.style.transform = `translateY(${(1 - v) * 8}px)`;
        });
      },
    }),
    [],
  );

  return (
    <div
      ref={root}
      className="absolute left-1/2 top-[12%] z-10 flex w-[min(92%,660px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-white/20"
      style={{ opacity: 0, visibility: 'hidden', height: 'min(54%, 400px)', transform: 'translateX(-50%)' }}
    >
      <div className="flex items-center justify-between gap-sm bg-[#0B1A3A] px-md py-sm text-white">
        <div className="flex items-center gap-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-blanc.png" alt="" className="h-7 w-auto" />
          <span className="text-xs font-bold tracking-wide sm:text-sm">Espace partenaire · Suivi du véhicule</span>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-sm py-0.5 text-[11px] font-bold sm:text-xs">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          En service
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] gap-0 sm:grid-cols-[1fr_190px] sm:grid-rows-1">
        <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" className="h-full w-full bg-[#EAF1FA]" focusable="false" aria-hidden="true">
          <path d="M0 0 H150 C130 30 110 60 60 74 C34 82 14 96 0 120 Z" fill="#BFD9F2" />
          {BLOCKS.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y + 14} width={w} height={h} rx="4" fill={i % 4 === 0 ? '#DCE8DA' : '#F6F8FB'} />
          ))}
          <g stroke="#FFFFFF" strokeLinecap="round" fill="none">
            <path d="M0 78 H400" strokeWidth="11" />
            <path d="M0 150 H400" strokeWidth="9" />
            <path d="M0 232 H400" strokeWidth="7" />
            <path d="M70 0 V260" strokeWidth="8" />
            <path d="M176 0 V260" strokeWidth="11" />
            <path d="M296 0 V260" strokeWidth="8" />
          </g>
          <path ref={route} d={ROUTE} fill="none" stroke="#9DB7E0" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 9" />
          <path ref={done} d={ROUTE} fill="none" stroke="#2563EB" strokeWidth="5.5" strokeLinecap="round" strokeDasharray="0 2000" />
          <g ref={mark} transform="translate(34 214)">
            <circle r="17" fill="#2563EB" opacity="0.2">
              <animate attributeName="r" values="12;22;12" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.28;0;0.28" dur="1.8s" repeatCount="indefinite" />
            </circle>
            <circle r="9.5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="3" />
            <path d="M-4 -2.4 h8 l1.4 2.6 v3 h-10.8 v-3 z" fill="#FFFFFF" />
          </g>
        </svg>
        <div className="flex gap-sm bg-white p-sm sm:flex-col sm:justify-center sm:p-md">
          {TILES.map((tl, i) => (
            <div
              key={tl.t}
              ref={(n) => {
                tiles.current[i] = n;
              }}
              className="flex-1 rounded-xl bg-neutral-100 px-sm py-sm sm:flex-none"
              style={{ opacity: 0 }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary-600">{tl.t}</p>
              <p className="mt-0.5 text-xs font-extrabold leading-tight text-neutral-900 sm:text-sm">{tl.d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
