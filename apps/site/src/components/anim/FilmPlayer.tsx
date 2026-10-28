'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { usePrefersReducedMotion } from './hooks';
import { canUse3D } from './journey-shared';
import { DURATION, SEQS, seqIndexAt } from './film-timeline';
import { FilmOverlays, type OverlayApi } from './FilmOverlays';
import { FilmLite, type LiteApi } from './FilmLite';
import type { FilmDraw } from './FilmScene3D';

/**
 * Le lecteur du film « Votre véhicule. Notre organisation. » (version B de la page Partenaires). Un chronomètre `t`
 * (0 → 42 s) pilote la scène : 3D (three.js, chargée à la demande) sur un appareil qui s'y prête, sinon version allégée
 * (SVG). Démarre tout seul quand il est visible, se met en pause en quittant l'écran, se contrôle (pause, rejouer,
 * saut de séquence, aller à la fin). Le bouton « Devenir partenaire » est dans la page dès le chargement. Si la
 * personne demande moins de mouvement : pas de lecture automatique, la carte finale reste affichée.
 * `?film=lite` / `?film=3d` force une version (comparaison, vérification).
 */

type Mode = 'loading' | '3d' | 'lite';
type SceneProps = { registerDraw: (fn: FilmDraw | null) => void; onFail: () => void; onResize: () => void };

const FPS_MIN = 20;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
const PLAY = 'M8 5.5v13l11-6.5z';
const PAUSE = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z';
const REPLAY = 'M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z';
const SKIP = 'M6 6l8.5 6L6 18zM16 6h2.5v12H16z';

export function FilmPlayer({ ctaHref }: { ctaHref: string }) {
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<Mode>('loading');
  const [Scene, setScene] = useState<ComponentType<SceneProps> | null>(null);
  const [near, setNear] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [idx, setIdx] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlays = useRef<OverlayApi>(null);
  const lite = useRef<LiteApi>(null);
  const draw = useRef<FilmDraw | null>(null);
  const segFill = useRef<(HTMLElement | null)[]>([]);
  const timeLabel = useRef<HTMLSpanElement>(null);

  const t = useRef(0);
  const modeRef = useRef<Mode>('loading');
  const want = useRef(false); // la personne (ou le démarrage automatique) veut lire
  const visible = useRef(false);
  const ending = useRef(false);
  const playRef = useRef(false);
  const raf = useRef(0);
  const lastNow = useRef(0);
  const idxRef = useRef(0);
  const autoStarted = useRef(false);
  const perf = useRef({ frames: 0, acc: 0, slow: 0 });
  const forced3d = useRef(false); // ?film=3d : on garde la 3D même si l'appareil est lent (vérification)

  const frame = useCallback(() => {
    const tt = t.current;
    const anchors = draw.current ? draw.current(tt) : null;
    lite.current?.update(tt);
    overlays.current?.update(tt, anchors);
    segFill.current.forEach((f, i) => {
      if (!f) return;
      const s = SEQS[i];
      f.style.width = `${Math.max(0, Math.min(1, (tt - s.a) / (s.b - s.a))) * 100}%`;
    });
    if (timeLabel.current) timeLabel.current.textContent = `${fmt(tt)} / ${fmt(DURATION)}`;
    const i = seqIndexAt(tt);
    if (i !== idxRef.current) {
      idxRef.current = i;
      setIdx(i);
    }
  }, []);

  const tick = useCallback(
    (now: number) => {
      raf.current = 0;
      if (playRef.current) {
        const dt = lastNow.current ? Math.min(0.25, (now - lastNow.current) / 1000) : 0;
        lastNow.current = now;
        t.current = Math.min(DURATION, t.current + dt);
        // Garde-fou : la 3D saccade → version allégée (le film continue là où il en est)
        if (modeRef.current === '3d' && !forced3d.current && dt > 0) {
          const p = perf.current;
          p.frames++;
          p.acc += dt;
          if (p.frames >= 50) {
            p.slow = 1 / (p.acc / p.frames) < FPS_MIN ? p.slow + 1 : 0;
            p.frames = 0;
            p.acc = 0;
            if (p.slow >= 2) {
              modeRef.current = 'lite';
              draw.current = null;
              setMode('lite');
            }
          }
        }
        if (t.current >= DURATION) {
          ending.current = true;
          playRef.current = false;
          want.current = false;
          setEnded(true);
          setPlaying(false);
        }
      } else {
        lastNow.current = 0;
      }
      frame();
      if (playRef.current) raf.current = requestAnimationFrame(tick);
    },
    [frame],
  );

  const kick = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(tick);
  }, [tick]);

  /** Lit ou met en pause selon : envie de lire, visibilité à l'écran, scène prête, film pas terminé. */
  const sync = useCallback(() => {
    const ready = modeRef.current === 'lite' || (modeRef.current === '3d' && draw.current !== null);
    const should = want.current && visible.current && ready && !ending.current && !document.hidden;
    if (should && !playRef.current) {
      playRef.current = true;
      lastNow.current = 0;
      kick();
    } else if (!should && playRef.current) {
      playRef.current = false;
    } else {
      kick(); // une image de plus pour refléter l'état (pause, saut, redimensionnement)
    }
  }, [kick]);

  useEffect(() => setMounted(true), []);

  // Choix 3D / allégé
  useEffect(() => {
    if (!mounted) return;
    if (reduced) {
      // moins de mouvement : pas de lecture automatique, la carte finale reste affichée
      modeRef.current = 'lite';
      setMode('lite');
      t.current = DURATION;
      ending.current = true;
      setEnded(true);
      sync();
      return;
    }
    const forced = new URLSearchParams(window.location.search).get('film');
    forced3d.current = forced === '3d';
    if (forced === 'lite' || (forced !== '3d' && !canUse3D())) {
      modeRef.current = 'lite';
      setMode('lite');
      sync();
      return;
    }
    if (!near) return;
    let cancelled = false;
    import('./FilmScene3D')
      .then((m) => {
        if (cancelled || modeRef.current === 'lite') return;
        setScene(() => m.default as ComponentType<SceneProps>);
        modeRef.current = '3d';
        setMode('3d');
      })
      .catch(() => {
        if (cancelled) return;
        modeRef.current = 'lite';
        setMode('lite');
        sync();
      });
    return () => {
      cancelled = true;
    };
  }, [mounted, reduced, near, sync]);

  // Vérification : `?debug=1` expose `window.__film.go(secondes)` pour se placer à un instant précis (en pause)
  useEffect(() => {
    if (!mounted || new URLSearchParams(window.location.search).get('debug') !== '1') return;
    (window as unknown as { __film: { go: (s: number) => void } }).__film = {
      go: (s: number) => {
        t.current = Math.max(0, Math.min(DURATION, s));
        ending.current = t.current >= DURATION;
        want.current = false;
        autoStarted.current = true;
        setPlaying(false);
        setEnded(ending.current);
        sync();
      },
    };
  }, [mounted, sync]);

  // Connexion lente : si la 3D n'est pas prête 7 s après l'envie de lire, on joue la version allégée
  useEffect(() => {
    if (!playing || mode !== 'loading' || forced3d.current) return;
    const id = window.setTimeout(() => {
      if (modeRef.current === 'loading') {
        modeRef.current = 'lite';
        setMode('lite');
      }
    }, 7000);
    return () => window.clearTimeout(id);
  }, [playing, mode]);

  // La 3D (≈ 160 Ko compressés) ne se télécharge que lorsque le film approche de l'écran
  useEffect(() => {
    const el = wrapRef.current;
    if (!mounted || !el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '1200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted]);

  // Lecture automatique quand le film est bien visible ; pause quand il quitte l'écran
  useEffect(() => {
    const el = stageRef.current;
    if (!mounted || !el) return;
    const io = new IntersectionObserver(
      (e) => {
        visible.current = e.some((x) => x.isIntersecting);
        if (visible.current && !autoStarted.current && !reduced) {
          autoStarted.current = true;
          want.current = true;
          setPlaying(true);
        }
        sync();
      },
      { threshold: 0.55 },
    );
    io.observe(el);
    const onVis = () => sync();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [mounted, reduced, sync]);

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    },
    [],
  );

  // première image dès que le mode change
  useEffect(() => {
    if (mounted) sync();
  }, [mounted, mode, sync]);

  const registerDraw = useCallback(
    (fn: FilmDraw | null) => {
      draw.current = fn;
      if (fn) sync();
    },
    [sync],
  );
  const onFail = useCallback(() => {
    modeRef.current = 'lite';
    draw.current = null;
    setMode('lite');
  }, []);

  /* ------------------------------------------------------------------ commandes */
  const replay = useCallback(() => {
    t.current = 0;
    ending.current = false;
    want.current = true;
    setEnded(false);
    setPlaying(true);
    sync();
  }, [sync]);

  const toggle = useCallback(() => {
    if (ending.current) {
      replay();
      return;
    }
    want.current = !want.current;
    autoStarted.current = true;
    setPlaying(want.current);
    sync();
  }, [replay, sync]);

  const seek = useCallback(
    (i: number) => {
      t.current = SEQS[i].a + 0.001;
      ending.current = false;
      want.current = true;
      autoStarted.current = true;
      setEnded(false);
      setPlaying(true);
      sync();
    },
    [sync],
  );

  const toEnd = useCallback(() => {
    t.current = DURATION;
    ending.current = true;
    want.current = false;
    autoStarted.current = true;
    setEnded(true);
    setPlaying(false);
    sync();
  }, [sync]);

  const is3d = mode === '3d' && Scene !== null;

  return (
    <div ref={wrapRef}>
      <div
        ref={stageRef}
        className="relative isolate aspect-[3/4] max-h-[78svh] w-full overflow-hidden rounded-3xl bg-[#0B1A3A] shadow-2xl ring-1 ring-black/10 sm:aspect-[4/3] md:aspect-video md:max-h-none"
      >
        {is3d && Scene ? <Scene registerDraw={registerDraw} onFail={onFail} onResize={sync} /> : <FilmLite ref={lite} />}
        <FilmOverlays ref={overlays} ctaHref={ctaHref} onReplay={replay} />
      </div>

      {/* commandes : lecture / pause, séquences, temps, aller à la fin */}
      <div className="mt-md flex flex-wrap items-center gap-md rounded-2xl bg-white px-md py-sm shadow-sm ring-1 ring-neutral-200">
        <div className="flex items-center gap-xs">
          <button
            type="button"
            onClick={toggle}
            aria-label={ended ? 'Rejouer l’animation' : playing ? 'Mettre l’animation en pause' : 'Lire l’animation'}
            className="grid h-10 w-10 place-items-center rounded-full bg-[#0B1A3A] text-white transition hover:bg-[#12306F]"
          >
            <Glyph d={ended ? REPLAY : playing ? PAUSE : PLAY} />
          </button>
          <button type="button" onClick={toEnd} aria-label="Passer l’animation et aller à la fin" className="grid h-10 w-10 place-items-center rounded-full text-neutral-700 ring-1 ring-neutral-300 transition hover:bg-neutral-100">
            <Glyph d={SKIP} />
          </button>
        </div>
        <div className="order-3 flex w-full items-center gap-1 sm:order-none sm:w-auto sm:flex-1">
          {SEQS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => seek(i)}
              style={{ flexGrow: s.b - s.a }}
              aria-label={`Séquence ${i + 1} sur ${SEQS.length} : ${s.label}`}
              aria-current={i === idx ? 'step' : undefined}
              title={s.label}
              className="group flex basis-0 items-center py-2"
            >
              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 transition group-hover:bg-neutral-300">
                <span
                  ref={(n) => {
                    segFill.current[i] = n;
                  }}
                  className="block h-full rounded-full bg-primary-600"
                  style={{ width: '0%' }}
                />
              </span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-md text-sm tabular-nums text-neutral-600">
          <span className="hidden font-bold text-neutral-800 md:inline">{SEQS[idx].label}</span>
          <span ref={timeLabel}>0:00 / {fmt(DURATION)}</span>
        </div>
      </div>

      {/* pour les lecteurs d'écran : la séquence en cours (le contenu complet est aussi dans la page) */}
      <p className="sr-only" aria-live="polite">
        {SEQS[idx].title} {SEQS[idx].text}
      </p>
    </div>
  );
}
