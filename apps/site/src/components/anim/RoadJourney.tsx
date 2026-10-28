'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { usePrefersReducedMotion } from './hooks';
import { CLIENT_TEXTS, JourneyShell } from './JourneyShell';
import JourneyScene2D from './JourneyScene2D';
import { canUse3D, type JourneyStep } from './journey-shared';

export type { JourneyStep };

/**
 * « Votre course, du clic à l'arrivée » : une scène qui avance quand on défile (le défilement est la manette).
 * Un véhicule TamCar roule de Cotonou à Porto-Novo, le jour tombe, et six promesses se jouent en chemin.
 *
 * En 3D (three.js, chargé à la demande) sur un appareil qui s'y prête ; sinon, ou dès que la 3D est saccadée ou
 * impossible, en 2D (un seul SVG, très léger). Rien du tout si la personne demande moins de mouvement : le texte
 * des promesses reste alors dans la grille de la page.
 */
export function RoadJourney({ steps, appUrl }: { steps: JourneyStep[]; appUrl: string }) {
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<'loading' | '3d' | '2d'>('loading');
  const [Scene3D, setScene3D] = useState<ComponentType<{ onFail: () => void }> | null>(null);
  const [near, setNear] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || reduced) return;
    // ?route=2d ou ?route=3d : forcer une version (comparaison, vérification)
    const forced = new URLSearchParams(window.location.search).get('route');
    if (forced === '2d' || (forced !== '3d' && !canUse3D())) {
      setMode('2d');
      return;
    }
    if (!near) return;
    let cancelled = false;
    import('./JourneyScene3D')
      .then((m) => {
        if (cancelled) return;
        setScene3D(() => m.default);
        setMode('3d');
      })
      .catch(() => {
        if (!cancelled) setMode('2d');
      });
    return () => {
      cancelled = true;
    };
  }, [mounted, reduced, near]);

  // La 3D (≈ 150 Ko compressés) ne se télécharge que lorsque la section approche de l'écran
  useEffect(() => {
    const el = wrapRef.current;
    if (!mounted || reduced || !el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '1400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted, reduced]);

  if (!mounted || reduced) return null;

  return (
    <div ref={wrapRef}>
      <JourneyShell steps={steps} texts={{ ...CLIENT_TEXTS, ctaHref: appUrl }}>
        {/* La 2D sert d'attente pendant le chargement de la 3D (jamais de ciel vide), puis de repli */}
        {mode === '3d' && Scene3D ? <Scene3D onFail={() => setMode('2d')} /> : <JourneyScene2D />}
      </JourneyShell>
    </div>
  );
}
