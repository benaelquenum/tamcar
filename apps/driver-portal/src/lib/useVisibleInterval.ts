'use client';

import { useEffect, useRef } from 'react';

/**
 * Exécute `fn` toutes les `ms` millisecondes, mais seulement quand la page est
 * visible, et une fois dès qu'elle redevient visible si le dernier appel date
 * de plus de la moitié de l'intervalle. Un écran éteint ou une autre application
 * au premier plan ne consomme donc plus de data pour rien.
 */
export function useVisibleInterval(fn: () => void, ms: number, enabled = true): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    const run = () => {
      last = Date.now();
      fnRef.current();
    };
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, ms);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > ms / 2) run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ms, enabled]);
}
