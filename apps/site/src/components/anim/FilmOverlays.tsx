'use client';

import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import type { AnchorPoint, FilmAnchors } from './FilmScene3D';
import { FilmDashboard, type PanelApi } from './FilmDashboard';
import { CTA_LABEL, FINAL_LINE, SEQS, T_BOARD, T_BOARDED, pulse, rise } from './film-timeline';

/**
 * Tout ce qui se superpose à la scène : textes de chaque séquence (en bas, jamais autour des véhicules), les trois icônes
 * de la séquence 2, la carte du chauffeur de la séquence 3, le tableau de suivi de la séquence 4, la carte finale et le
 * bouton « Devenir partenaire » (visible dès le chargement). Rien n'est recalculé par React : `update(t, ancres)` écrit
 * directement dans le DOM, à chaque image.
 */

export type OverlayApi = { update: (t: number, a: FilmAnchors | null) => void };

type IconName = 'car' | 'users' | 'monitor' | 'check' | 'user';

function Ico({ n, className = 'h-6 w-6' }: { n: IconName; className?: string }) {
  const p: Record<IconName, ReactNode> = {
    car: (
      <>
        <path d="M4.5 15v-3l2-5h11l2 5v3" />
        <path d="M3 15h18v3.2H3z" />
        <path d="M7 18.2v1.3M17 18.2v1.3" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" />
        <circle cx="17" cy="9" r="2.2" />
        <path d="M16.2 14.2c2.8.2 4.8 1.9 4.8 4.8" />
      </>
    ),
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
        <path d="M7 12l3-3 3 2 4-4" />
      </>
    ),
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    user: (
      <>
        <circle cx="12" cy="8.5" r="3.4" />
        <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false">
      {p[n]}
    </svg>
  );
}

const ICONS: { label: string; icon: IconName; at: number }[] = [
  { label: 'Véhicule', icon: 'car', at: 7.0 },
  { label: 'Partenaire', icon: 'users', at: 8.1 },
  { label: 'Plateforme', icon: 'monitor', at: 9.2 },
];

const DRIVER_ROWS = [
  { t: 'Profil du chauffeur', d: 'Photo officielle contrôlée' },
  { t: 'Validation', d: 'Pièces contrôlées en personne' },
  { t: 'Véhicule associé', d: 'Rattaché à votre véhicule' },
];

const TITLE5 = ['Clarté.', 'Suivi.', 'Responsabilité.'];
const NAVY = '#0B1A3A';

const place = (el: HTMLElement | null, x: number, y: number, o: number, tr = 'translate(-50%, -50%)', scale = 1) => {
  if (!el) return;
  el.style.opacity = String(o);
  el.style.visibility = o > 0.01 ? 'visible' : 'hidden';
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${tr} scale(${scale.toFixed(3)})`;
};

export const FilmOverlays = forwardRef<OverlayApi, { ctaHref: string; onReplay: () => void }>(function FilmOverlays({ ctaHref, onReplay }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const dash = useRef<PanelApi>(null);
  const lines = useRef<(SVGLineElement | null)[]>([]);
  const badges = useRef<(HTMLDivElement | null)[]>([]);
  const card = useRef<HTMLDivElement>(null);
  const cardRows = useRef<(HTMLDivElement | null)[]>([]);
  const tagCar = useRef<HTMLDivElement>(null);
  const tagDriver = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const titles = useRef<(HTMLDivElement | null)[]>([]);
  const texts = useRef<(HTMLParagraphElement | null)[]>([]);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const dip = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const endParts = useRef<(HTMLElement | null)[]>([]);
  const endBar = useRef<HTMLDivElement>(null);
  const cta = useRef<HTMLAnchorElement>(null);
  const cardH = useRef(0);

  useImperativeHandle(
    ref,
    () => ({
      update(t, a) {
        const el = root.current;
        if (!el) return;
        const w = el.clientWidth;
        const h = el.clientHeight;
        const car: AnchorPoint = a?.car ?? { x: w * 0.5, y: h * 0.55, ok: true };
        const tag: AnchorPoint = a?.tag ?? { x: w * 0.5, y: h * 0.47, ok: true };

        // ---- séquence 4 : on assombrit la scène, le tableau de suivi passe devant
        if (scrim.current) scrim.current.style.opacity = String(0.74 * pulse(t, 19.6, 21.4, 26.0, 27.2));
        dash.current?.update(t);

        // ---- séquence 2 : trois icônes autour du véhicule, reliées à lui
        ICONS.forEach((ic, i) => {
          const o = rise(t, ic.at, ic.at + 0.6) * (1 - rise(t, 11.5, 12.2));
          const p: AnchorPoint = a?.icons[i] ?? { x: w * (0.5 + (i - 1) * 0.24), y: h * (i === 1 ? 0.24 : 0.4), ok: true };
          const x = Math.min(w - 44, Math.max(44, p.x));
          const y = Math.min(h * 0.62, Math.max(w < 520 ? 84 : 52, p.y));
          place(badges.current[i], x, y, p.ok ? o : 0, 'translate(-50%, -50%)', 0.82 + 0.18 * o);
          const ln = lines.current[i];
          if (ln) {
            ln.setAttribute('x1', car.x.toFixed(1));
            ln.setAttribute('y1', (car.y - 6).toFixed(1));
            ln.setAttribute('x2', x.toFixed(1));
            ln.setAttribute('y2', y.toFixed(1));
            ln.style.opacity = String(o * 0.85);
          }
        });

        // ---- séquence 3 : la carte du chauffeur suit la personne qui marche
        const c = card.current;
        if (c) {
          const o = pulse(t, 12.8, 13.4, T_BOARD - 0.2, T_BOARDED);
          if (o > 0.01) {
            const cw = w < 430 ? 200 : 240;
            c.style.width = `${cw}px`;
            if (!cardH.current) cardH.current = c.offsetHeight || 150;
            const dp: AnchorPoint = a?.driver ?? { x: w * 0.4, y: h * 0.55, ok: true };
            const x = Math.min(w - cw - 8, Math.max(8, dp.x - cw * 0.78));
            const y = Math.min(h * 0.46, Math.max(8, dp.y - cardH.current - 26));
            c.style.transform = `translate(${x.toFixed(1)}px, ${(y + (1 - o) * 8).toFixed(1)}px)`;
          }
          c.style.opacity = String(o);
          c.style.visibility = o > 0.01 ? 'visible' : 'hidden';
          cardRows.current.forEach((r, i) => {
            if (!r) return;
            const v = rise(t, 13.4 + i * 0.9, 13.9 + i * 0.9);
            r.style.opacity = String(v);
            r.style.transform = `translateX(${(1 - v) * -8}px)`;
          });
        }

        // ---- étiquettes sur le véhicule : « TamCar » au début, « Chauffeur vérifié » après la montée
        place(tagCar.current, tag.x, tag.y, tag.ok ? pulse(t, 2.0, 2.8, 5.0, 6.2) : 0, 'translate(-50%, -100%)');
        place(tagDriver.current, tag.x, tag.y, tag.ok ? pulse(t, 16.9, 17.5, 19.0, 19.8) : 0, 'translate(-50%, -100%)');

        // ---- textes du bas : une idée par séquence, titre puis phrase
        const outFade = 1 - rise(t, 33.1, 33.8);
        for (let i = 0; i < 5; i++) {
          const sq = SEQS[i];
          const tt = titles.current[i];
          const tx = texts.current[i];
          if (i === 4) {
            words.current.forEach((wd, k) => {
              if (!wd) return;
              const v = rise(t, 27.7 + k * 1.6, 28.4 + k * 1.6) * outFade;
              wd.style.opacity = String(v);
              wd.style.transform = `translateY(${(1 - v) * 10}px)`;
            });
            if (tx) {
              const v = rise(t, 31.0, 31.8) * outFade;
              tx.style.opacity = String(v);
              tx.style.transform = `translateY(${(1 - v) * 8}px)`;
            }
            if (tt) {
              tt.style.opacity = '1';
              tt.style.visibility = outFade > 0.01 && t >= 27.6 ? 'visible' : 'hidden';
            }
            continue;
          }
          const o1 = pulse(t, sq.a + 0.35, sq.a + 1.1, sq.b - 0.8, sq.b - 0.15);
          const o2 = pulse(t, sq.a + 1.2, sq.a + 1.9, sq.b - 0.8, sq.b - 0.15);
          if (tt) {
            tt.style.opacity = String(o1);
            tt.style.transform = `translateY(${(1 - o1) * 10}px)`;
            tt.style.visibility = o1 > 0.01 ? 'visible' : 'hidden';
          }
          if (tx) {
            tx.style.opacity = String(o2);
            tx.style.transform = `translateY(${(1 - o2) * 8}px)`;
            tx.style.visibility = o2 > 0.01 ? 'visible' : 'hidden';
          }
        }
        const endP = rise(t, 36.4, 37.6);
        if (shade.current) shade.current.style.opacity = String(1 - rise(t, 36.4, 37.4));

        // ---- fondus : ouverture et changement de lieu (rue → bureau → rue)
        if (dip.current) dip.current.style.opacity = String(Math.max(1 - rise(t, 0.1, 1.0), pulse(t, 33.1, 33.9, 33.95, 34.7)));

        // ---- carte finale : logo, deux phrases, bouton
        const ed = end.current;
        if (ed) {
          ed.style.opacity = String(endP);
          ed.style.visibility = endP > 0.01 ? 'visible' : 'hidden';
          ed.style.pointerEvents = endP > 0.9 ? 'auto' : 'none';
          const parts: [number, number][] = [
            [37.2, 37.9],
            [38.3, 38.9],
            [39.1, 39.7],
            [39.9, 40.5],
            [40.6, 41.2],
          ];
          parts.forEach(([s, e], i) => {
            const n = endParts.current[i];
            if (!n) return;
            const v = rise(t, s, e);
            n.style.opacity = String(v);
            n.style.transform = i === 0 ? `scale(${(0.88 + 0.12 * v).toFixed(3)})` : `translateY(${((1 - v) * 10).toFixed(1)}px)`;
          });
          if (endBar.current) endBar.current.style.width = `${(rise(t, 37.6, 38.3) * 100).toFixed(1)}%`;
        }

        // ---- le bouton reste là du début à la carte finale
        if (cta.current) {
          const o = 1 - rise(t, 37.0, 37.6);
          cta.current.style.opacity = String(o);
          cta.current.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
          cta.current.tabIndex = o > 0.5 ? 0 : -1;
        }
      },
    }),
    [],
  );

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden">
      <div ref={scrim} className="absolute inset-0" style={{ background: '#07122B', opacity: 0 }} />
      <FilmDashboard ref={dash} />

      {/* séquence 2 : véhicule · partenaire · plateforme */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
        {ICONS.map((ic, i) => (
          <line
            key={ic.label}
            ref={(n) => {
              lines.current[i] = n;
            }}
            stroke="#22D3EE"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="1 7"
            style={{ opacity: 0 }}
          />
        ))}
      </svg>
      {ICONS.map((ic, i) => (
        <div
          key={ic.label}
          ref={(n) => {
            badges.current[i] = n;
          }}
          className="absolute left-0 top-0 z-10 flex flex-col items-center gap-1"
          style={{ opacity: 0, visibility: 'hidden' }}
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-[#0B1A3A] shadow-lg ring-2 ring-[#22D3EE] sm:h-14 sm:w-14">
            <Ico n={ic.icon} className="h-6 w-6 sm:h-7 sm:w-7" />
          </span>
          <span className="rounded-full bg-[#0B1A3A]/90 px-sm py-0.5 text-[11px] font-bold text-white sm:text-xs">{ic.label}</span>
        </div>
      ))}

      {/* séquence 3 : la carte du chauffeur */}
      <div
        ref={card}
        className="absolute left-0 top-0 z-10 rounded-2xl bg-[#0B1A3A]/95 p-sm text-white shadow-2xl ring-1 ring-white/15 sm:p-md"
        style={{ opacity: 0, visibility: 'hidden', width: 240 }}
      >
        <div className="flex items-center gap-sm border-b border-white/10 pb-sm">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10">
            <Ico n="user" className="h-5 w-5" />
          </span>
          <span className="text-xs font-extrabold uppercase tracking-wider text-cyan-300">Chauffeur TamCar</span>
        </div>
        <div className="mt-sm space-y-sm">
          {DRIVER_ROWS.map((r, i) => (
            <div
              key={r.t}
              ref={(n) => {
                cardRows.current[i] = n;
              }}
              className="flex items-start gap-sm"
              style={{ opacity: 0 }}
            >
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                <Ico n="check" className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold leading-tight">{r.t}</span>
                <span className="block text-[11px] leading-tight text-white/70">{r.d}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* étiquettes accrochées au véhicule */}
      <div ref={tagCar} className="absolute left-0 top-0 z-10 whitespace-nowrap rounded-full bg-[#0B1A3A]/92 px-md py-1 text-xs font-extrabold text-white shadow-lg ring-1 ring-[#22D3EE]" style={{ opacity: 0, visibility: 'hidden' }}>
        Véhicule TamCar
      </div>
      <div ref={tagDriver} className="absolute left-0 top-0 z-10 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#0B1A3A]/92 px-md py-1 text-xs font-extrabold text-white shadow-lg ring-1 ring-emerald-400" style={{ opacity: 0, visibility: 'hidden' }}>
        <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500">
          <Ico n="check" className="h-3 w-3" />
        </span>
        Chauffeur vérifié
      </div>

      {/* textes : bandeau du bas, une idée par séquence */}
      <div ref={shade} className="absolute inset-x-0 bottom-0 h-[44%] sm:h-[38%]" style={{ background: 'linear-gradient(to top, rgba(7,18,43,0.94) 0%, rgba(7,18,43,0.78) 48%, rgba(7,18,43,0) 100%)' }} />
      <div className="absolute inset-x-0 bottom-0 px-lg pb-lg sm:px-3xl sm:pb-xl">
        <div className="mx-auto grid max-w-5xl">
          {SEQS.slice(0, 5).map((sq, i) => (
            <div key={sq.title} className="col-start-1 row-start-1" aria-hidden="true">
              <div
                ref={(n) => {
                  titles.current[i] = n;
                }}
                className="text-[26px] font-extrabold leading-tight text-white drop-shadow sm:text-4xl"
                style={{ opacity: 0, visibility: 'hidden' }}
              >
                {i === 4
                  ? TITLE5.map((wd, k) => (
                      <span
                        key={wd}
                        ref={(n) => {
                          words.current[k] = n;
                        }}
                        className="mr-[0.35em] inline-block"
                        style={{ opacity: 0 }}
                      >
                        {wd}
                      </span>
                    ))
                  : sq.title}
              </div>
              <p
                ref={(n) => {
                  texts.current[i] = n;
                }}
                className="mt-1.5 max-w-2xl text-[15px] leading-snug text-white/90 sm:mt-2 sm:text-xl"
                style={{ opacity: 0, visibility: 'hidden' }}
              >
                {sq.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ouverture : on commence sur le logo, sur fond bleu nuit (c'est aussi l'écran d'attente pendant le chargement) */}
      <div ref={dip} className="absolute inset-0 grid place-items-center" style={{ background: NAVY, opacity: 1 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-blanc.png" alt="" className="h-20 w-auto opacity-90 sm:h-28" />
      </div>

      {/* séquence 6 : la signature TamCar */}
      <div ref={end} className="absolute inset-0 grid place-items-center px-lg text-center" style={{ opacity: 0, visibility: 'hidden', background: 'linear-gradient(160deg, rgba(5,13,34,0.96), rgba(11,26,58,0.94) 60%, rgba(18,48,111,0.92))' }}>
        <div className="flex max-w-xl flex-col items-center">
          <div
            ref={(n) => {
              endParts.current[0] = n;
            }}
            className="flex flex-col items-center"
            style={{ opacity: 0 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-blanc.png" alt="TamCar" className="h-24 w-auto sm:h-32" />
            <div className="mt-sm h-[3px] w-40 overflow-hidden rounded-full bg-white/10">
              <div ref={endBar} className="h-full rounded-full bg-[#22D3EE]" style={{ width: '0%' }} />
            </div>
          </div>
          <p
            ref={(n) => {
              endParts.current[1] = n;
            }}
            className="mt-lg max-w-[22ch] text-2xl font-extrabold text-white [text-wrap:balance] sm:max-w-none sm:text-4xl"
            style={{ opacity: 0 }}
          >
            {SEQS[5].text}
          </p>
          <p
            ref={(n) => {
              endParts.current[2] = n;
            }}
            className="mt-sm text-base text-white/80 sm:text-xl"
            style={{ opacity: 0 }}
          >
            {FINAL_LINE}
          </p>
          <a
            ref={(n) => {
              endParts.current[3] = n;
            }}
            href={ctaHref}
            className="mt-xl rounded-full bg-white px-2xl py-md text-base font-extrabold text-[#0B1A3A] shadow-xl transition hover:scale-105"
            style={{ opacity: 0 }}
          >
            {CTA_LABEL}
          </a>
          <button
            type="button"
            ref={(n) => {
              endParts.current[4] = n;
            }}
            onClick={onReplay}
            className="mt-md rounded-full px-lg py-xs text-sm font-bold text-white/75 underline-offset-4 transition hover:text-white hover:underline"
            style={{ opacity: 0 }}
          >
            Revoir l’animation
          </button>
        </div>
      </div>

      {/* le bouton principal : accessible dès le chargement, tout au long du film */}
      <a
        ref={cta}
        href={ctaHref}
        className="pointer-events-auto absolute right-md top-md rounded-full bg-[#0B1A3A] px-lg py-sm text-xs font-extrabold text-white shadow-xl ring-1 ring-white/30 transition hover:scale-105 hover:bg-[#12306F] sm:right-lg sm:top-lg sm:text-sm"
      >
        {CTA_LABEL}
      </a>
    </div>
  );
});
