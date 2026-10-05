/**
 * Décor animé « vue du conducteur », sans cadre : il s'incruste dans le fond bleu d'une section (à placer
 * dans un parent `relative overflow-hidden`, texte en `relative z-10` par-dessus). Le volant tourne à droite
 * puis à gauche, la route s'incurve dans le sens du virage et le paysage glisse en sens inverse (comme dans
 * une vraie voiture). Un seul cycle CSS (`tc-steer-*` dans globals.css) pilote le tout, donc volant, route et
 * décor restent synchronisés. Les teintes sont des voiles bleu nuit translucides : le fond de la section
 * reste le ciel. Décoratif : masqué aux lecteurs d'écran.
 *
 * Repère de la scène : 1100 × 640, horizon à y = 300, point de fuite au centre (x = 550). La scène est
 * centrée sur son point de fuite : à placer avec `left-1/2` (mobile) ou `lg:left-[72%]` (texte à gauche).
 */

const HORIZON = 300;
const BOTTOM = 640;
const DASHES = 6;

/** Palmier simplifié (tronc courbe + frondes). Origine au pied du tronc. */
function Palm({ x, y, scale = 1, tilt = 0, color }: { x: number; y: number; scale?: number; tilt?: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${scale})`} fill="none" stroke={color} strokeLinecap="round">
      <path d="M0 0 C-4 -26 4 -52 -2 -86" strokeWidth="6" />
      <g strokeWidth="6">
        <path d="M-2 -86 C-18 -100 -36 -98 -52 -84" />
        <path d="M-2 -86 C-14 -106 -30 -116 -48 -114" />
        <path d="M-2 -86 C2 -108 12 -120 28 -124" />
        <path d="M-2 -86 C18 -102 36 -100 54 -86" />
        <path d="M-2 -86 C12 -94 30 -90 42 -72" />
        <path d="M-2 -86 C-12 -92 -30 -88 -40 -70" />
      </g>
    </g>
  );
}

/** Couche de décor : 320 % de la largeur de la scène, centrée sur le point de fuite, pour couvrir tout écran. */
function Layer({ speedClass, children }: { speedClass: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-y-0 left-1/2 w-[320%] -translate-x-1/2">
      <div className={`${speedClass} h-full w-full`}>
        <svg viewBox="-1210 0 3520 640" className="h-full w-full" preserveAspectRatio="none">
          {children}
        </svg>
      </div>
    </div>
  );
}

export function SteeringScene({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute bottom-0 aspect-[1100/640] w-[820px] max-w-none -translate-x-1/2 lg:w-[1100px] ${className}`}
    >
      {/* Sol : bande pleine largeur, de l'horizon jusqu'au bas de la section */}
      <div
        className="absolute -inset-x-[100vw] bottom-0 bg-gradient-to-b from-[rgba(15,35,110,0.45)] via-[rgba(8,18,70,0.7)] to-[rgba(4,9,36,0.9)]"
        style={{ height: `${((BOTTOM - HORIZON) / BOTTOM) * 100}%` }}
      />

      {/* Plan lointain : soleil, nuages, silhouette de ville, crête (bouge peu) */}
      <Layer speedClass="tc-steer-far">
        <defs>
          <radialGradient id="tc-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff7c2" stopOpacity="0.95" />
            <stop offset="0.4" stopColor="#fde68a" stopOpacity="0.5" />
            <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="860" cy="150" r="150" fill="url(#tc-sun)" />
        <circle cx="860" cy="150" r="26" fill="#fffbe0" opacity="0.95" />
        <g fill="#fff" opacity="0.14">
          <ellipse cx="120" cy="120" rx="120" ry="26" />
          <ellipse cx="200" cy="96" rx="76" ry="26" />
          <ellipse cx="640" cy="196" rx="100" ry="20" />
          <ellipse cx="1180" cy="90" rx="110" ry="24" />
          <ellipse cx="1260" cy="68" rx="64" ry="22" />
          <ellipse cx="-420" cy="140" rx="120" ry="26" />
          <ellipse cx="1700" cy="170" rx="120" ry="26" />
        </g>
        <g fill="#0b1a52" opacity="0.3">
          <rect x="250" y={HORIZON - 96} width="26" height="96" />
          <rect x="282" y={HORIZON - 140} width="34" height="140" />
          <rect x="322" y={HORIZON - 80} width="24" height="80" />
          <rect x="352" y={HORIZON - 120} width="30" height="120" />
          <rect x="388" y={HORIZON - 64} width="36" height="64" />
          <rect x="880" y={HORIZON - 88} width="30" height="88" />
          <rect x="916" y={HORIZON - 128} width="26" height="128" />
          <rect x="948" y={HORIZON - 70} width="34" height="70" />
        </g>
        <path
          d={`M-1210 ${HORIZON} L-1210 ${HORIZON - 56} C-900 ${HORIZON - 96} -600 ${HORIZON - 70} -300 ${HORIZON - 52} C-80 ${HORIZON - 36} 120 ${HORIZON - 84} 360 ${HORIZON - 70} C600 ${HORIZON - 54} 760 ${HORIZON - 96} 1000 ${HORIZON - 74} C1260 ${HORIZON - 50} 1500 ${HORIZON - 88} 1800 ${HORIZON - 64} C2000 ${HORIZON - 48} 2200 ${HORIZON - 70} 2310 ${HORIZON - 60} L2310 ${HORIZON} Z`}
          fill="#0b1a52"
          opacity="0.28"
        />
      </Layer>

      {/* Plan moyen : collines, palmiers */}
      <Layer speedClass="tc-steer-mid">
        <path
          d={`M-1210 ${HORIZON + 2} L-1210 ${HORIZON - 30} C-1000 ${HORIZON - 52} -760 ${HORIZON - 14} -500 ${HORIZON - 36} C-240 ${HORIZON - 58} 0 ${HORIZON - 16} 260 ${HORIZON - 38} C520 ${HORIZON - 60} 760 ${HORIZON - 20} 1020 ${HORIZON - 40} C1300 ${HORIZON - 62} 1560 ${HORIZON - 22} 1840 ${HORIZON - 40} C2040 ${HORIZON - 54} 2200 ${HORIZON - 34} 2310 ${HORIZON - 36} L2310 ${HORIZON + 2} Z`}
          fill="#071344"
          opacity="0.42"
        />
        <Palm x={-560} y={HORIZON - 8} scale={0.7} tilt={-3} color="rgba(6,16,64,0.5)" />
        <Palm x={-530} y={HORIZON - 6} scale={0.52} tilt={4} color="rgba(6,16,64,0.5)" />
        <Palm x={930} y={HORIZON - 8} scale={0.58} tilt={-3} color="rgba(6,16,64,0.5)" />
        <Palm x={1010} y={HORIZON - 6} scale={0.46} tilt={4} color="rgba(6,16,64,0.5)" />
        <Palm x={1500} y={HORIZON - 8} scale={0.68} tilt={-2} color="rgba(6,16,64,0.5)" />
      </Layer>

      {/* Route : asphalte, rives et bandes centrales qui viennent vers nous ; elle s'incurve dans le virage */}
      <div className="absolute inset-0">
        <div className="tc-steer-road absolute inset-0">
          <svg viewBox="0 0 1100 640" className="h-full w-full overflow-visible" preserveAspectRatio="none">
            <defs>
              <linearGradient id="tc-asphalt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#274aa6" />
                <stop offset="0.3" stopColor="#14246b" />
                <stop offset="1" stopColor="#060c28" />
              </linearGradient>
            </defs>
            <path d={`M541 ${HORIZON} L559 ${HORIZON} L1030 ${BOTTOM} L70 ${BOTTOM} Z`} fill="url(#tc-asphalt)" />
            <path d={`M541 ${HORIZON} L544.4 ${HORIZON} L126 ${BOTTOM} L70 ${BOTTOM} Z`} fill="#fff" opacity="0.85" />
            <path d={`M555.6 ${HORIZON} L559 ${HORIZON} L1030 ${BOTTOM} L974 ${BOTTOM} Z`} fill="#fff" opacity="0.85" />
            {Array.from({ length: DASHES }).map((_, i) => (
              <rect
                key={i}
                className="tc-dash"
                x="-20"
                y="-62"
                width="40"
                height="124"
                rx="4"
                fill="#fde047"
                style={{ animationDelay: `${-(i * 1.5) / DASHES}s` }}
              />
            ))}
          </svg>
        </div>
      </div>

      {/* Végétation proche, sur les bas-côtés (bouge le plus) : entre à l'écran pendant les virages */}
      <Layer speedClass="tc-steer-near">
        <Palm x={-560} y={470} scale={1.7} tilt={-3} color="rgba(3,8,34,0.75)" />
        <Palm x={-515} y={440} scale={1.3} tilt={3} color="rgba(3,8,34,0.75)" />
        <Palm x={1000} y={440} scale={1.4} tilt={2} color="rgba(3,8,34,0.75)" />
        <Palm x={1065} y={470} scale={1.8} tilt={-4} color="rgba(3,8,34,0.75)" />
      </Layer>

      {/* Volant : tourne autour de son centre, sort du bas de la section */}
      <div className="absolute left-[29%] top-[58%] w-[42%]">
        <div className="tc-steer-wheel aspect-square w-full" style={{ transformOrigin: '50% 50%' }}>
          <svg viewBox="0 0 300 300" className="h-full w-full drop-shadow-[0_18px_24px_rgba(2,6,23,0.5)]">
            <defs>
              <radialGradient id="tc-hub" cx="35%" cy="30%" r="80%">
                <stop offset="0" stopColor="#60a5fa" />
                <stop offset="1" stopColor="#1d4ed8" />
              </radialGradient>
            </defs>
            {/* Branches (9 h, 3 h, 6 h) */}
            <g stroke="#1b2a5c" strokeWidth="24" strokeLinecap="round" fill="none">
              <path d="M40 150 H260" />
              <path d="M150 150 V262" />
            </g>
            {/* Jante */}
            <circle cx="150" cy="150" r="120" fill="none" stroke="#1b2a5c" strokeWidth="30" />
            <circle cx="150" cy="150" r="135" fill="none" stroke="#93c5fd" strokeOpacity="0.45" strokeWidth="2" />
            <circle cx="150" cy="150" r="105" fill="none" stroke="#93c5fd" strokeOpacity="0.3" strokeWidth="2" />
            <circle cx="150" cy="150" r="120" fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth="2" strokeDasharray="3 5" />
            {/* Repère à 12 h : permet de voir le volant tourner */}
            <path d="M116.9 34.7 A120 120 0 0 1 183.1 34.7" fill="none" stroke="#38bdf8" strokeWidth="30" />
            {/* Moyeu */}
            <circle cx="150" cy="150" r="40" fill="url(#tc-hub)" stroke="#93c5fd" strokeWidth="3" />
            <circle cx="150" cy="150" r="13" fill="#eab308" />
            <circle cx="150" cy="150" r="13" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" />
          </svg>
        </div>
      </div>
    </div>
  );
}
