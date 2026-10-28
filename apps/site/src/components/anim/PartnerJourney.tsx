'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { usePrefersReducedMotion } from './hooks';
import { JourneyShell } from './JourneyShell';
import JourneyScene2D from './JourneyScene2D';
import { PartnerFleetControls } from './PartnerFleetControls';
import { PARTNER_CFG, canUse3D, type JourneyStep } from './journey-shared';

/**
 * « Une journée de votre véhicule » : la route des partenaires. Même principe que celle des clients (le défilement est
 * la manette) : du petit matin au soir, on regarde le véhicule travailler (feux, inspection, propriété, chauffeur,
 * gains, flotte). En 3D (three.js, chargé à la demande) sur un appareil qui s'y prête ; sinon, ou dès que la 3D est
 * saccadée ou impossible, en 2D. Rien du tout si la personne demande moins de mouvement : le texte reste dans la page.
 * Aucun chiffre de politique partenaire n'apparaît dans cette section.
 */
export function PartnerJourney({ steps, proposalHref }: { steps: JourneyStep[]; proposalHref: string }) {
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
    import('./PartnerScene3D')
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

  const is3d = mode === '3d' && Scene3D !== null;
  return (
    <div ref={wrapRef}>
      <JourneyShell
        steps={steps}
        cfg={PARTNER_CFG}
        texts={{
          eyebrow: 'Une journée de votre véhicule',
          introTitle: 'Au petit matin.',
          introText: 'Faites défiler : la journée de votre véhicule commence.',
          ctaHref: proposalHref,
          ctaLabel: 'Recevoir la proposition',
          ctaShort: 'La proposition',
        }}
        controls={is3d ? <PartnerFleetControls /> : null}
      >
        {/* La 2D sert d'attente pendant le chargement de la 3D (jamais de ciel vide), puis de repli */}
        {is3d && Scene3D ? <Scene3D onFail={() => setMode('2d')} /> : <JourneyScene2D variant="partners" />}
      </JourneyShell>
    </div>
  );
}
