'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { SKY_BOT, SKY_TOP, lerp, mix } from './journey-shared';
import { BAY_X, T_GO, carX, filmNight, rise, pulse } from './film-timeline';

/**
 * La version allégée du film : une ville dessinée à plat (SVG) et un véhicule qui roule, s'arrête, repart. Elle sert
 * d'attente pendant que la 3D se charge, et de repli : appareil modeste, économie de données, WebGL absent ou saccadé.
 * Les textes, icônes, carte du chauffeur et tableau de suivi sont les mêmes (voir `FilmOverlays`).
 */

export type LiteApi = { update: (t: number) => void };

const BUILDINGS: [number, number, number][] = [
  [0, 70, 120], [74, 54, 160], [134, 80, 110], [220, 60, 190], [286, 72, 135], [364, 56, 170], [426, 84, 118], [516, 62, 205], [584, 70, 142], [660, 58, 176], [724, 76, 124],
];

export const FilmLite = forwardRef<LiteApi>(function FilmLite(_p, ref) {
  const sky = useRef<HTMLDivElement>(null);
  const car = useRef<SVGGElement>(null);
  const wheels = useRef<SVGGElement[]>([]);
  const office = useRef<HTMLDivElement>(null);
  const city = useRef<SVGSVGElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      update(t) {
        const night = filmNight(t);
        if (sky.current) sky.current.style.background = `linear-gradient(to bottom, ${mix(SKY_TOP[0], SKY_TOP[1], night)}, ${mix(SKY_BOT[0], SKY_BOT[1], night)})`;
        // le véhicule : même trajet que la 3D (x en mètres → coordonnées du dessin)
        const back = t >= 33.9; // retour à la ville : le véhicule repasse de gauche à droite
        const x = back ? lerp(-200, 760, rise(t, 33.9, 42)) : 120 + (carX(t) - (BAY_X - 47)) * 5.2;
        const dy = back ? 0 : lerp(0, 18, rise(t, 4.9, 7.2)) * (1 - rise(t, T_GO, T_GO + 3.4));
        if (car.current) {
          car.current.setAttribute('transform', `translate(${Math.min(1100, x).toFixed(1)} ${dy.toFixed(1)})`);
          car.current.style.opacity = t < 24 || back ? '1' : '0';
        }
        wheels.current.forEach((w) => w && w.setAttribute('transform', `rotate(${(carX(t) * 80).toFixed(0)})`));
        if (city.current) city.current.style.opacity = String(1 - pulse(t, 24.0, 24.8, 33.3, 34.0));
        if (office.current) office.current.style.opacity = String(pulse(t, 24.0, 24.8, 33.3, 34.0));
      },
    }),
    [],
  );

  return (
    <div className="absolute inset-0" aria-hidden="true">
      <div ref={sky} className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, #8FB9E8, #F0E2C8)' }} />
      <svg ref={city} viewBox="0 0 800 400" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" focusable="false">
        <g>
          {BUILDINGS.map(([x, w, h], i) => (
            <g key={i}>
              <rect x={x} y={236 - h} width={w} height={h} fill={i % 2 ? '#C9B79C' : '#D8C6A8'} />
              {Array.from({ length: Math.floor(h / 34) }).map((_, r) => (
                <rect key={r} x={x + 10} y={236 - h + 12 + r * 34} width={w - 20} height="14" fill="#6B7C99" opacity="0.55" />
              ))}
            </g>
          ))}
        </g>
        <rect x="0" y="236" width="800" height="164" fill="#4B5565" />
        <rect x="0" y="232" width="800" height="6" fill="#E7E0D2" />
        <g stroke="#F3F4F6" strokeWidth="4" strokeDasharray="30 26" opacity="0.7">
          <path d="M0 306 H800" />
        </g>
        <g ref={car}>
          <g transform="translate(0 248)">
            <rect x="0" y="22" width="150" height="34" rx="9" fill="#F4F6FA" />
            <path d="M28 22 L48 -2 H104 L126 22 Z" fill="#DCE3EE" />
            <path d="M40 22 L54 4 H72 V22 Z M78 22 V4 H100 L116 22 Z" fill="#2A3440" />
            <rect x="60" y="30" width="34" height="8" rx="3" fill="#2563EB" />
            {[34, 118].map((cx, i) => (
              <g key={cx} transform={`translate(${cx} 56)`}>
                <circle r="14" fill="#15171B" />
                <g
                  ref={(n) => {
                    if (n) wheels.current[i] = n;
                  }}
                >
                  <circle r="7.5" fill="#D5DAE1" />
                  <path d="M0 -7 V7 M-7 0 H7" stroke="#8B93A1" strokeWidth="2" />
                </g>
              </g>
            ))}
          </g>
        </g>
      </svg>
      <div ref={office} className="absolute inset-0 grid place-items-center" style={{ opacity: 0, background: 'linear-gradient(160deg, #12306F, #0B1A3A)' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" className="h-1/2 w-1/2 opacity-20" focusable="false">
          <circle cx="9" cy="8" r="3" />
          <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" />
          <circle cx="17" cy="9" r="2.2" />
          <path d="M16.2 14.2c2.8.2 4.8 1.9 4.8 4.8" />
        </svg>
      </div>
    </div>
  );
});
