'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Fait apparaître son contenu (fondu + léger glissement) quand il entre dans l'écran.
 * Amélioration progressive : sans JavaScript, à l'impression, ou si l'élément est déjà visible au
 * chargement, le contenu est affiché tel quel ; seul un élément situé sous le bas de l'écran est masqué,
 * puis révélé à son approche.
 */
export function Reveal({
  children,
  className = '',
  delay = 0,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  /** Délai en ms (pour échelonner plusieurs éléments). */
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.getBoundingClientRect().top <= window.innerHeight * 0.92) return; // déjà visible : on ne le cache pas
    if (typeof IntersectionObserver === 'undefined') return;
    setHidden(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setHidden(false);
          io.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    // Filet de sécurité : jamais plus de 6 s masqué (onglet en arrière-plan, défilement par ancre…)
    const safety = setTimeout(() => setHidden(false), 6000);
    return () => {
      io.disconnect();
      clearTimeout(safety);
    };
  }, []);

  const Component = Tag as 'div';
  return (
    <Component
      ref={ref}
      className={`tc-reveal ${hidden ? '' : 'tc-in'} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Component>
  );
}
