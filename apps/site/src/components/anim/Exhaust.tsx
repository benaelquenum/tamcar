/**
 * Volutes de fumée d'échappement, à poser derrière un bouton ou un titre (position absolue). CSS seul.
 */
export function Exhaust({ className = '', color = '#94A3B8' }: { className?: string; color?: string }) {
  const puffs = [
    { delay: 0, dx: 36, size: 14 },
    { delay: 0.5, dx: 54, size: 18 },
    { delay: 1.0, dx: 30, size: 12 },
    { delay: 1.5, dx: 62, size: 20 },
    { delay: 2.0, dx: 44, size: 16 },
  ];
  return (
    <span className={`pointer-events-none absolute ${className}`} aria-hidden>
      {puffs.map((p, i) => (
        <span
          key={i}
          className="tc-puff absolute rounded-full"
          style={
            {
              left: 0,
              top: 0,
              width: p.size,
              height: p.size,
              background: color,
              animationDelay: `${p.delay}s`,
              ['--tc-dx' as string]: `${p.dx}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
