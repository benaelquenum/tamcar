'use client';

import { useEffect } from 'react';

/**
 * Écrit la position de défilement dans une variable CSS (--scroll) : les roues tournent en fonction du
 * défilement, sans re-rendu React. Monté une seule fois dans la mise en page racine.
 */
export function ScrollDriver() {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    const write = () => {
      raf = 0;
      root.style.setProperty('--scroll', String(Math.round(window.scrollY)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(write);
    };
    write();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
