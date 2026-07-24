'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Barre de progression globale (feedback instantané de navigation).
 *
 * Le App Router Next.js attend la réponse serveur avant d'afficher la
 * nouvelle page, sans aucun retour visuel — d'où l'impression de latence
 * « ça bugue » au clic. Cette barre démarre INSTANTANÉMENT dès qu'on clique
 * un lien interne ou qu'on soumet un formulaire (Server Action), et se
 * termine quand la navigation aboutit (changement de pathname) ou après un
 * délai de sécurité.
 *
 * Sans dépendance externe. Aucun impact sur le rendu serveur.
 */
export function TopProgressBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (tickRef.current) clearInterval(tickRef.current);
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    tickRef.current = null;
    failsafeRef.current = null;
  }

  function start() {
    // Déjà en cours → ne pas relancer
    if (tickRef.current) return;
    setVisible(true);
    setProgress(8);
    tickRef.current = setInterval(() => {
      // Approche asymptotique de 90 % (jamais atteint tant que pas fini)
      setProgress((p) => (p < 90 ? p + (90 - p) * 0.18 : p));
    }, 180);
    // Sécurité : si aucune navigation n'aboutit (revalidation sans changement
    // de route, action sans redirect), on referme au bout de 8 s.
    failsafeRef.current = setTimeout(() => finish(), 8000);
  }

  function finish() {
    clearTimers();
    setProgress(100);
    setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
  }

  // Démarrage : clic sur lien interne + soumission de formulaire
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as HTMLElement | null)?.closest('a');
      if (!el) return;
      const href = el.getAttribute('href');
      const target = el.getAttribute('target');
      if (!href || target === '_blank') return;
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      // Lien interne uniquement (même origine)
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch {
        return;
      }
      start();
    }

    function onSubmit() {
      start();
    }

    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fin : la route a changé → navigation aboutie
  useEffect(() => {
    finish();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      <div
        className="h-full bg-gradient-to-r from-primary-500 to-primary-700 shadow-[0_0_8px_rgba(37,99,235,0.6)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
