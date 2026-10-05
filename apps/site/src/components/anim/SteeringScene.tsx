/**
 * Vue du conducteur : le volant tourne à droite puis à gauche, la route s'incurve dans le sens du virage et
 * le paysage défile en sens inverse (comme dans une vraie voiture : on tourne à droite, le décor glisse vers
 * la gauche). Tout est piloté par le même cycle CSS (voir `tc-steer-*` dans globals.css), donc volant, route
 * et décor restent synchronisés. Décoratif : masqué aux lecteurs d'écran.
 */

const HORIZON = 178;
const DASHES = 6;

/** Palmier simplifié (tronc courbe + frondes). Origine au pied du tronc. */
function Palm({ x, y, scale = 1, tilt = 0 }: { x: number; y: number; scale?: number; tilt?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${scale})`}>
      <path d="M0 0 C-4 -26 4 -52 -2 -86" fill="none" stroke="#6b4423" strokeWidth="5" strokeLinecap="round" />
      <g fill="none" stroke="#1f8a4c" strokeWidth="5" strokeLinecap="round">
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

export function SteeringScene({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`relative aspect-[640/440] w-full overflow-hidden rounded-[1.75rem] bg-primary-900 shadow-2xl ring-1 ring-white/20 ${className}`}
    >
      {/* Ciel */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#5fb4ff] via-[#a9d8ff] to-[#e6f4ff]" />

      {/* Décor lointain : soleil, nuages, silhouette de ville, collines bleutées (bouge peu) */}
      <div className="absolute inset-y-0 -left-[45%] w-[190%]">
        <div className="tc-steer-far h-full w-full">
          <svg viewBox="-288 0 1216 440" className="h-full w-full" preserveAspectRatio="none">
            <defs>
              <radialGradient id="tc-sun" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="#fff7c2" />
                <stop offset="0.45" stopColor="#fde68a" stopOpacity="0.9" />
                <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="540" cy="92" r="64" fill="url(#tc-sun)" />
            <circle cx="540" cy="92" r="20" fill="#fffbe0" />
            <g fill="#fff" opacity="0.85">
              <ellipse cx="60" cy="70" rx="52" ry="14" />
              <ellipse cx="96" cy="58" rx="34" ry="14" />
              <ellipse cx="330" cy="104" rx="46" ry="11" />
              <ellipse cx="364" cy="94" rx="28" ry="11" />
              <ellipse cx="760" cy="64" rx="50" ry="13" />
              <ellipse cx="792" cy="54" rx="30" ry="12" />
            </g>
            {/* Silhouette de ville */}
            <g fill="#9cc3ee">
              <rect x="150" y={HORIZON - 52} width="16" height="52" />
              <rect x="170" y={HORIZON - 78} width="20" height="78" />
              <rect x="194" y={HORIZON - 40} width="14" height="40" />
              <rect x="212" y={HORIZON - 62} width="18" height="62" />
              <rect x="234" y={HORIZON - 34} width="22" height="34" />
              <rect x="640" y={HORIZON - 46} width="18" height="46" />
              <rect x="662" y={HORIZON - 70} width="16" height="70" />
              <rect x="682" y={HORIZON - 38} width="20" height="38" />
            </g>
            <path
              d={`M-230 ${HORIZON} L-230 ${HORIZON - 36} C-160 ${HORIZON - 64} -90 ${HORIZON - 56} -20 ${HORIZON - 34} C70 ${HORIZON - 8} 130 ${HORIZON - 58} 230 ${HORIZON - 50} C340 ${HORIZON - 40} 400 ${HORIZON - 70} 500 ${HORIZON - 54} C600 ${HORIZON - 38} 700 ${HORIZON - 64} 870 ${HORIZON - 40} L870 ${HORIZON} Z`}
              fill="#7fb3ea"
            />
          </svg>
        </div>
      </div>

      {/* Sol : herbe de part et d'autre de la route (fixe) */}
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-[#86d08a] via-[#3f9a55] to-[#1f5f33]"
        style={{ top: `${(HORIZON / 440) * 100}%` }}
      />

      {/* Collines vertes + palmiers du plan moyen */}
      <div className="absolute inset-y-0 -left-[45%] w-[190%]">
        <div className="tc-steer-mid h-full w-full">
          <svg viewBox="-288 0 1216 440" className="h-full w-full" preserveAspectRatio="none">
            <path
              d={`M-230 ${HORIZON + 2} L-230 ${HORIZON - 18} C-120 ${HORIZON - 34} -40 ${HORIZON - 6} 60 ${HORIZON - 22} C170 ${HORIZON - 40} 260 ${HORIZON - 8} 380 ${HORIZON - 26} C500 ${HORIZON - 44} 600 ${HORIZON - 10} 700 ${HORIZON - 24} C780 ${HORIZON - 34} 830 ${HORIZON - 20} 870 ${HORIZON - 22} L870 ${HORIZON + 2} Z`}
              fill="#4aa86a"
            />
            <Palm x={110} y={HORIZON - 6} scale={0.46} tilt={-3} />
            <Palm x={142} y={HORIZON - 4} scale={0.36} tilt={4} />
            <Palm x={470} y={HORIZON - 6} scale={0.4} tilt={2} />
            <Palm x={690} y={HORIZON - 5} scale={0.44} tilt={-4} />
          </svg>
        </div>
      </div>

      {/* Route : asphalte, rives et bandes centrales qui viennent vers nous ; elle s'incurve dans le virage */}
      <div className="absolute inset-0">
        <div className="tc-steer-road absolute inset-0">
          <svg viewBox="0 0 640 440" className="h-full w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="tc-asphalt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#64748b" />
                <stop offset="0.35" stopColor="#334155" />
                <stop offset="1" stopColor="#0f172a" />
              </linearGradient>
            </defs>
            <path d={`M316 ${HORIZON} L324 ${HORIZON} L760 440 L-120 440 Z`} fill="url(#tc-asphalt)" />
            <path d={`M316 ${HORIZON} L317.6 ${HORIZON} L-34 440 L-96 440 Z`} fill="#fff" opacity="0.88" />
            <path d={`M322.4 ${HORIZON} L324 ${HORIZON} L736 440 L674 440 Z`} fill="#fff" opacity="0.88" />
            {Array.from({ length: DASHES }).map((_, i) => (
              <rect
                key={i}
                className="tc-dash"
                x="-9"
                y="-34"
                width="18"
                height="68"
                rx="2"
                fill="#fde047"
                style={{ animationDelay: `${-(i * 1.5) / DASHES}s` }}
              />
            ))}
          </svg>
        </div>
      </div>

      {/* Végétation proche, sur les bas-côtés (bouge le plus) */}
      <div className="absolute inset-y-0 -left-[45%] w-[190%]">
        <div className="tc-steer-near h-full w-full">
          <svg viewBox="-288 0 1216 440" className="h-full w-full" preserveAspectRatio="none">
            <Palm x={-112} y={300} scale={1.15} tilt={-3} />
            <Palm x={-34} y={284} scale={0.86} tilt={3} />
            <Palm x={690} y={290} scale={1.0} tilt={2} />
            <Palm x={776} y={300} scale={1.2} tilt={-4} />
            <ellipse cx="-110" cy="306" rx="44" ry="14" fill="#1b6b3a" />
            <ellipse cx="780" cy="308" rx="48" ry="15" fill="#1b6b3a" />
          </svg>
        </div>
      </div>

      {/* Cadre : montants, toit, rétroviseur, tableau de bord (fixe), reflet sur la vitre */}
      <svg viewBox="0 0 640 440" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="tc-frame" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0d1a3d" />
            <stop offset="1" stopColor="#050a1c" />
          </linearGradient>
          <linearGradient id="tc-glare" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.2" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          fillRule="evenodd"
          fill="url(#tc-frame)"
          d="M0 0H640V440H0Z M36 302 L98 46 Q104 26 126 26 L514 26 Q536 26 542 46 L604 302 Q320 318 36 302Z"
        />
        <path d="M36 302 L98 46 Q104 26 126 26 L514 26 Q536 26 542 46 L604 302 Q320 318 36 302Z" fill="none" stroke="#3b82f6" strokeOpacity="0.55" strokeWidth="2" />
        <path d="M100 30 L238 30 L156 300 L58 300Z" fill="url(#tc-glare)" opacity="0.5" />
        <path d="M0 336 Q320 292 640 336 L640 440 L0 440Z" fill="#fff" opacity="0.05" />
        <path d="M320 26 V14" stroke="#0d1a3d" strokeWidth="7" strokeLinecap="round" />
        <rect x="268" y="28" width="104" height="36" rx="12" fill="#0a1330" stroke="#3b82f6" strokeOpacity="0.4" />
        <rect x="276" y="34" width="88" height="24" rx="8" fill="#17306b" opacity="0.8" />
      </svg>

      {/* Volant : tourne autour de son centre, sort du tableau de bord par le bas */}
      <div className="absolute left-1/4 top-[55%] w-1/2">
        <div className="tc-steer-wheel aspect-square w-full" style={{ transformOrigin: '50% 50%' }}>
          <svg viewBox="0 0 300 300" className="h-full w-full drop-shadow-[0_14px_18px_rgba(2,6,23,0.55)]">
            <defs>
              <radialGradient id="tc-hub" cx="35%" cy="30%" r="80%">
                <stop offset="0" stopColor="#60a5fa" />
                <stop offset="1" stopColor="#1d4ed8" />
              </radialGradient>
            </defs>
            {/* Branches (9 h, 3 h, 6 h) */}
            <g stroke="#26345a" strokeWidth="24" strokeLinecap="round" fill="none">
              <path d="M40 150 H260" />
              <path d="M150 150 V262" />
            </g>
            {/* Jante */}
            <circle cx="150" cy="150" r="120" fill="none" stroke="#26345a" strokeWidth="30" />
            <circle cx="150" cy="150" r="135" fill="none" stroke="#93c5fd" strokeOpacity="0.35" strokeWidth="2" />
            <circle cx="150" cy="150" r="105" fill="none" stroke="#93c5fd" strokeOpacity="0.25" strokeWidth="2" />
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
