/**
 * Roue TamCar : pneu (sculptures et flanc), jante bleu roi à cinq branches, moyeu et goujons.
 * Elle tourne en continu (--tc-spin) ET avec le défilement de la page (--scroll, posé par ScrollDriver).
 * Composant serveur : pas d'état, seulement du SVG et des variables CSS.
 */
export function Wheel({
  className = '',
  spinSeconds = 9,
  scrollFactor = 0.35,
}: {
  className?: string;
  /** Durée d'un tour (s). */
  spinSeconds?: number;
  /** Degrés de rotation par pixel de défilement. */
  scrollFactor?: number;
}) {
  const treads = Array.from({ length: 48 }, (_, i) => i);
  const spokes = [0, 72, 144, 216, 288];
  const nuts = [0, 72, 144, 216, 288];
  return (
    <svg viewBox="0 0 400 400" className={className} role="img" aria-label="Roue TamCar">
      <defs>
        <radialGradient id="tc-rim" cx="38%" cy="32%" r="80%">
          <stop offset="0" stopColor="#93C5FD" />
          <stop offset="0.5" stopColor="#2563EB" />
          <stop offset="1" stopColor="#1E3A8A" />
        </radialGradient>
        <linearGradient id="tc-spoke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.6" stopColor="#DBEAFE" />
          <stop offset="1" stopColor="#93C5FD" />
        </linearGradient>
        <radialGradient id="tc-tire" cx="50%" cy="50%" r="50%">
          <stop offset="0.82" stopColor="#0B1220" />
          <stop offset="1" stopColor="#1F2937" />
        </radialGradient>
        <radialGradient id="tc-hub" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#67E8F9" />
          <stop offset="0.5" stopColor="#06B6D4" />
          <stop offset="1" stopColor="#0E7490" />
        </radialGradient>
        <path id="tc-sidewall" d="M 200 200 m -161 0 a 161 161 0 1 1 322 0 a 161 161 0 1 1 -322 0" />
      </defs>

      {/* Tout ce qui tourne : décalage lié au défilement, puis rotation continue */}
      <g style={{ transformOrigin: '200px 200px', transform: `rotate(calc(var(--scroll, 0) * ${scrollFactor}deg))` }}>
        <g className="tc-wheel-spin" style={{ ['--tc-spin' as string]: `${spinSeconds}s` }}>
          {/* Pneu */}
          <circle cx="200" cy="200" r="196" fill="url(#tc-tire)" />
          {treads.map((i) => (
            <rect
              key={i}
              x="195"
              y="5"
              width="10"
              height="20"
              rx="2.5"
              fill="#273449"
              transform={`rotate(${(i * 360) / treads.length} 200 200)`}
            />
          ))}
          <circle cx="200" cy="200" r="176" fill="none" stroke="#1E293B" strokeWidth="2" />
          <text fontSize="10.5" fill="#64748B" letterSpacing="3.2" fontWeight="600">
            <textPath href="#tc-sidewall">TAMCAR · 205/55 R16 · TAMCAR · 205/55 R16 · TAMCAR · 205/55 R16 ·</textPath>
          </text>

          {/* Jante */}
          <circle cx="200" cy="200" r="150" fill="url(#tc-rim)" stroke="#E2E8F0" strokeWidth="3" />
          <circle cx="200" cy="200" r="128" fill="#0F172A" />
          {spokes.map((a) => (
            <path
              key={a}
              d="M 187 205 L 177 62 Q 200 44 223 62 L 213 205 Z"
              fill="url(#tc-spoke)"
              transform={`rotate(${a} 200 200)`}
            />
          ))}

          {/* Moyeu */}
          <circle cx="200" cy="200" r="40" fill="url(#tc-hub)" stroke="#FFFFFF" strokeWidth="3" />
          <circle cx="200" cy="200" r="24" fill="#0F172A" />
          {nuts.map((a) => (
            <circle key={a} cx="200" cy="178" r="5.5" fill="#E2E8F0" transform={`rotate(${a} 200 200)`} />
          ))}
          <circle cx="200" cy="200" r="7" fill="#EAB308" />
        </g>
      </g>

      {/* Reflet fixe : la lumière ne tourne pas avec la roue */}
      <path d="M 70 120 A 160 160 0 0 1 200 40 A 175 175 0 0 0 70 120 Z" fill="#FFFFFF" opacity="0.16" />
    </svg>
  );
}
