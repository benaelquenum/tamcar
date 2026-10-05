/**
 * Chaussée en perspective : l'asphalte file vers l'horizon, les bandes centrales jaunes défilent vers le
 * conducteur. Purement CSS (voir globals.css) ; `speed` : durée d'un cycle de bande (s), plus petit = plus
 * vite.
 */
export function Road({
  className = '',
  height = 170,
  speed = 1.1,
  bare = false,
}: {
  className?: string;
  height?: number;
  speed?: number;
  /** Sans le fond clair derrière la route (à poser sur un fond de couleur). */
  bare?: boolean;
}) {
  return (
    <div
      className={`tc-road ${className}`}
      style={{ height, ...(bare ? { background: 'transparent' } : {}), ['--tc-road-speed' as string]: `${speed}s` } as React.CSSProperties}
      aria-hidden
    >
      <div className="tc-road-plane">
        <div className="tc-road-dashes" />
      </div>
    </div>
  );
}
