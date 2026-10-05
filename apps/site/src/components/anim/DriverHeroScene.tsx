'use client';

import { useEffect, useState } from 'react';
import { SteeringScene } from './SteeringScene';

type Scene3DProps = { className?: string; onReady?: () => void; onFail?: () => void };

/**
 * La 3D n'est tentée que sur un appareil qui s'y prête : pas de « réduire les animations », pas
 * d'économie de données ni de connexion 2G, assez de mémoire et de cœurs, WebGL disponible.
 */
function canUse3D(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
  if (nav.connection?.saveData) return false;
  if (nav.connection?.effectiveType && /2g$/.test(nav.connection.effectiveType)) return false;
  if (nav.deviceMemory && nav.deviceMemory < 4) return false;
  if (nav.hardwareConcurrency && nav.hardwareConcurrency < 4) return false;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    return false;
  }
  return true;
}

/**
 * Décor du bandeau de la page Chauffeurs : la version 2D s'affiche tout de suite (rapide, légère, sans
 * JavaScript lourd) ; si l'appareil le permet, la 3D se charge en arrière-plan puis apparaît en fondu par-dessus.
 * Repli automatique sur la 2D si WebGL manque, si le chargement échoue ou si l'animation 3D est saccadée.
 */
export function DriverHeroScene() {
  const [Scene3D, setScene3D] = useState<React.ComponentType<Scene3DProps> | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [drop2d, setDrop2d] = useState(false);

  useEffect(() => {
    if (!canUse3D()) return;
    let cancelled = false;
    import('./SteeringScene3D')
      .then((m) => {
        if (!cancelled) setScene3D(() => m.SteeringScene3D);
      })
      .catch(() => {
        /* chargement impossible : la 2D reste */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Une fois la 3D affichée, on retire la 2D (après la fin du fondu)
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setDrop2d(true), 900);
    return () => clearTimeout(t);
  }, [ready]);

  const show3d = Scene3D !== null && !failed;

  return (
    <>
      {(!drop2d || failed) && <SteeringScene className="left-1/2 lg:left-[74%]" />}
      {show3d && Scene3D && (
        <div className={`tc-hero3d-mask absolute inset-x-0 bottom-0 h-[300px] transition-opacity duration-700 lg:inset-0 lg:h-auto ${ready ? 'opacity-100' : 'opacity-0'}`}>
          <Scene3D className="inset-0" onReady={() => setReady(true)} onFail={() => setFailed(true)} />
          {/* Voile bleu à gauche : le texte reste lisible quand la route passe derrière */}
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[62%] bg-gradient-to-r from-primary-900/75 via-primary-900/35 to-transparent lg:block" />
        </div>
      )}
    </>
  );
}
