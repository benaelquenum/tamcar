'use client';

import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { HEADER_PX, RUNWAY_VH, SKY_TOP, clamp01, mix, nightAt, smooth, stepWin, STEPS, type JourneyStep } from './journey-shared';

type Sub = (p: number) => void;
type Ctx = { subscribe: (fn: Sub) => () => void };

const JourneyCtx = createContext<Ctx | null>(null);

/**
 * S'abonne à la progression de la route (0 → 1), appelée à chaque image tant que la page défile.
 * Au moment de l'abonnement, la dernière valeur connue est rejouée tout de suite.
 */
export function useJourneyFrame(fn: (p: number) => void) {
  const ctx = useContext(JourneyCtx);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => ctx?.subscribe((p) => ref.current(p)), [ctx]);
}

/**
 * Cadre commun des deux versions de la route (2D et 3D) : section collante, texte du chapitre en cours, repères,
 * appel à l'action final, et boucle de défilement (avec un peu d'inertie). La scène elle-même est donnée en
 * enfant : elle remplit la zone sous le texte et se dessine dans `useJourneyFrame`.
 */
export function JourneyShell({ steps, appUrl, children }: { steps: JourneyStep[]; appUrl: string; children?: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const subs = useRef(new Set<Sub>());
  const last = useRef(-1);

  const ctx = useMemo<Ctx>(
    () => ({
      subscribe: (fn) => {
        subs.current.add(fn);
        if (last.current >= 0) fn(last.current);
        return () => {
          subs.current.delete(fn);
        };
      },
    }),
    [],
  );

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage) return;
    const cards = Array.from(stage.querySelectorAll<HTMLElement>('[data-card]'));
    const dots = Array.from(stage.querySelectorAll<HTMLElement>('[data-dot]'));
    const hint = stage.querySelector<HTMLElement>('[data-hint]');
    const cta = stage.querySelector<HTMLElement>('[data-cta]');

    const chrome = (p: number) => {
      const night = nightAt(p);
      stage.style.backgroundColor = mix(SKY_TOP[0], SKY_TOP[1], night);
      stage.style.color = mix('#0F172A', '#F8FAFC', night);
      let best = 0;
      let bestV = -1;
      STEPS.forEach((_, k) => {
        const { v } = stepWin(p, k);
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
      });
      dots.forEach((d, i) => d.setAttribute('data-on', i === best && p > 0.04 ? '1' : '0'));
      if (hint) {
        const hv = 1 - smooth(p / 0.045);
        hint.style.opacity = String(hv);
        hint.style.visibility = hv > 0.01 ? 'visible' : 'hidden';
      }
      if (cta) {
        const v6 = stepWin(p, 5).v;
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
      last.current = shown;
      chrome(shown);
      subs.current.forEach((fn) => fn(shown));
      if (Math.abs(target - shown) >= 0.0004) raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onResize = () => {
      shown = -1;
      kick();
    };

    kick();
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', kick);
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <JourneyCtx.Provider value={ctx}>
      <div ref={rootRef} role="group" className="relative" style={{ height: `${RUNWAY_VH}vh` }} aria-label="Votre course, du clic à l’arrivée">
        <div
          ref={stageRef}
          className="sticky flex flex-col overflow-hidden"
          style={{ top: HEADER_PX, height: `calc(100vh - ${HEADER_PX}px)`, backgroundColor: SKY_TOP[0], color: '#0F172A' }}
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
          <div className="relative min-h-0 flex-1">{children}</div>

          {/* Repères : chapitre en cours, appel à l'action final */}
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
    </JourneyCtx.Provider>
  );
}
