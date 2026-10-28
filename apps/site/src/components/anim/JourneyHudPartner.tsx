import { HUD_H, HUD_W } from './JourneyHud';
import { PARTNER_STEPS, lerp, mix, smooth, stepWin } from './journey-shared';

/**
 * Les six panneaux d'information de la route des partenaires (même cadre de 330 × 170 que ceux des clients).
 * AUCUN chiffre de politique partenaire : pas de pourcentage, de plancher, d'avance ni de montant. Les montants des
 * gains sont de simples barres floutées ; seules les durées de contrat (déjà publiques) apparaissent.
 */
const PROFILES: { name: string; short: string; frac: number; color: string }[] = [
  { name: 'Moto', short: '12 m', frac: 0.2, color: '#22D3EE' },
  { name: 'Tricycle', short: '24 m', frac: 0.4, color: '#60A5FA' },
  { name: 'Essentiel', short: '3 ans', frac: 0.6, color: '#4ADE80' },
  { name: 'Confort', short: '4 ans', frac: 0.8, color: '#FACC15' },
  { name: 'VIP', short: '5 ans', frac: 1, color: '#C084FC' },
];

function Check({ cx, cy, r = 9, name }: { cx: number; cy: number; r?: number; name: string }) {
  return (
    <g>
      <circle data-j={`${name}Dot`} cx={cx} cy={cy} r={r} fill="#334155" />
      <path data-j={`${name}Chk`} d={`M${cx - r * 0.45},${cy} l${r * 0.38},${r * 0.4} l${r * 0.7},-${r * 0.8}`} fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" opacity="0" />
    </g>
  );
}

export function HudPanelsPartner() {
  return (
    <>
      <defs>
        <filter id="pBlur" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* 1 · Trois étapes : vous écrivez, nous chiffrons, vous décidez */}
      <g data-j="hudPanel" opacity="0">
        <rect width={HUD_W} height={HUD_H} rx="22" fill="#0B1220" stroke="#1E293B" strokeWidth="2" />
        <text x="24" y="34" fontSize="12" fontWeight="700" fill="#94A3B8" letterSpacing="2">TROIS ÉTAPES</text>
        {['Vous nous écrivez', 'Nous chiffrons votre cas', 'Vous décidez'].map((label, i) => (
          <g key={label}>
            <Check cx={40} cy={68 + i * 38} r={12} name={`p1s${i}`} />
            <text x="64" y={73 + i * 38} fontSize="16" fontWeight="700" fill="#E2E8F0">{label}</text>
          </g>
        ))}
      </g>

      {/* 2 · Inspection d'entrée */}
      <g data-j="hudPanel" opacity="0">
        <rect width={HUD_W} height={HUD_H} rx="22" fill="#fff" stroke="#E2E8F0" strokeWidth="2" />
        <text x="24" y="34" fontSize="12" fontWeight="700" fill="#64748B" letterSpacing="2">INSPECTION D’ENTRÉE</text>
        {['État du véhicule contrôlé', 'Papiers en règle', 'Prêt à rouler'].map((label, i) => (
          <g key={label}>
            <Check cx={38} cy={62 + i * 28} r={9} name={`p2s${i}`} />
            <text x="58" y={67 + i * 28} fontSize="15" fontWeight="700" fill="#0F172A">{label}</text>
          </g>
        ))}
        <text x="24" y="146" fontSize="11" fontWeight="700" fill="#64748B">Mise en service</text>
        <rect x="24" y="152" width="282" height="8" rx="4" fill="#E2E8F0" />
        <rect data-j="p2Bar" x="24" y="152" width="0" height="8" rx="4" fill="#2563EB" />
      </g>

      {/* 3 · Vous restez propriétaire */}
      <g data-j="hudPanel" opacity="0">
        <rect width={HUD_W} height={HUD_H} rx="22" fill="#0B2A6B" stroke="#173A8A" strokeWidth="2" />
        <text x="24" y="34" fontSize="12" fontWeight="700" fill="#9DB7F2" letterSpacing="2">VOUS RESTEZ PROPRIÉTAIRE</text>
        <g data-j="p3Card" transform="translate(30 56)">
          <rect width="96" height="66" rx="9" fill="#fff" />
          <rect width="96" height="18" rx="9" fill="#2563EB" />
          <rect y="9" width="96" height="9" fill="#2563EB" />
          <rect x="10" y="30" width="52" height="6" rx="3" fill="#CBD5E1" />
          <rect x="10" y="42" width="38" height="6" rx="3" fill="#CBD5E1" />
          <circle cx="76" cy="46" r="9" fill="#FACC15" />
          <rect x="74" y="50" width="4" height="10" rx="1" fill="#FACC15" />
        </g>
        <text x="146" y="78" fontSize="17" fontWeight="800" fill="#fff">Réserve de</text>
        <text x="146" y="98" fontSize="17" fontWeight="800" fill="#fff">propriété</text>
        <text x="146" y="122" fontSize="12" fontWeight="600" fill="#BFD3FF">Cédé au chauffeur</text>
        <text x="146" y="138" fontSize="12" fontWeight="600" fill="#BFD3FF">seulement au terme.</text>
      </g>

      {/* 4 · Chauffeur vérifié et engagé */}
      <g data-j="hudPanel" opacity="0">
        <rect width={HUD_W} height={HUD_H} rx="22" fill="#fff" stroke="#E2E8F0" strokeWidth="2" />
        <circle cx="56" cy="52" r="28" fill="#DBEAFE" />
        <circle cx="56" cy="44" r="10" fill="#2563EB" />
        <path d="M36,72 Q56,50 76,72 Q76,76 72,76 H40 Q36,76 36,72 Z" fill="#2563EB" />
        <circle cx="76" cy="72" r="10" fill="#16A34A" stroke="#fff" strokeWidth="2.5" />
        <path d="M71,72 l3.5,3.5 l6.5,-7.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <text x="100" y="46" fontSize="17" fontWeight="800" fill="#0F172A">Chauffeur vérifié</text>
        <text x="100" y="66" fontSize="12" fontWeight="600" fill="#64748B">Photo officielle contrôlée</text>
        <path d="M36,150 A44,44 0 0 1 124,150" fill="none" stroke="#E2E8F0" strokeWidth="11" strokeLinecap="round" />
        <path data-j="p4Arc" d="M36,150 A44,44 0 0 1 124,150" fill="none" stroke="#16A34A" strokeWidth="11" strokeLinecap="round" pathLength="100" strokeDasharray="0 100" />
        <line data-j="p4Needle" x1="80" y1="150" x2="44" y2="150" stroke="#0F172A" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="80" cy="150" r="6" fill="#0F172A" />
        <text x="146" y="128" fontSize="13" fontWeight="800" fill="#0F172A">Engagé sur ses</text>
        <text x="146" y="146" fontSize="13" fontWeight="800" fill="#0F172A">recettes</text>
      </g>

      {/* 5 · Des gains en direct (montants floutés) */}
      <g data-j="hudPanel" opacity="0">
        <rect width={HUD_W} height={HUD_H} rx="22" fill="#0F172A" stroke="#1E293B" strokeWidth="2" />
        <text x="24" y="34" fontSize="12" fontWeight="700" fill="#94A3B8" letterSpacing="2">VOTRE ESPACE PARTENAIRE</text>
        {[0, 1, 2].map((i) => (
          <g key={i} data-j={`p5Row${i}`} opacity="0">
            <circle cx="40" cy={68 + i * 38} r="11" fill="#16A34A" />
            <path d={`M35,${68 + i * 38} l3.5,3.5 l7,-8`} fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            <text x="62" y={73 + i * 38} fontSize="15" fontWeight="700" fill="#E2E8F0">Course terminée</text>
            <rect x="228" y={60 + i * 38} width="78" height="17" rx="8.5" fill="#94A3B8" opacity="0.7" filter="url(#pBlur)" />
          </g>
        ))}
      </g>

      {/* 6 · Un contrat par profil de véhicule */}
      <g data-j="hudPanel" opacity="0">
        <rect width={HUD_W} height={HUD_H} rx="22" fill="#111C3A" stroke="#223059" strokeWidth="2" />
        <text x="24" y="34" fontSize="12" fontWeight="700" fill="#9DB7F2" letterSpacing="2">UN CONTRAT PAR PROFIL</text>
        {PROFILES.map((pf, i) => {
          const cx = 40 + i * 62.5;
          return (
            <g key={pf.name}>
              <circle cx={cx} cy="88" r="22" fill="none" stroke="#26345E" strokeWidth="6" />
              <circle
                data-j={`p6Ring${i}`}
                cx={cx}
                cy="88"
                r="22"
                fill="none"
                stroke={pf.color}
                strokeWidth="6"
                strokeLinecap="round"
                pathLength="100"
                strokeDasharray="0 100"
                transform={`rotate(-90 ${cx} 88)`}
              />
              <text x={cx} y="93" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">{pf.short}</text>
              <text x={cx} y="132" textAnchor="middle" fontSize="11" fontWeight="700" fill="#BFD3FF">{pf.name}</text>
            </g>
          );
        })}
      </g>
    </>
  );
}

type Refs = {
  panels: SVGElement[];
  get: (n: string) => SVGElement | null;
};
const cache = new WeakMap<Element, Refs>();
function refs(root: Element): Refs {
  let r = cache.get(root);
  if (r) return r;
  const memo = new Map<string, SVGElement | null>();
  r = {
    panels: Array.from(root.querySelectorAll(`[data-j="hudPanel"]`)) as SVGElement[],
    get: (n) => {
      if (!memo.has(n)) memo.set(n, root.querySelector(`[data-j="${n}"]`) as SVGElement | null);
      return memo.get(n)!;
    },
  };
  cache.set(root, r);
  return r;
}

const GREY = '#334155';
const GREEN = '#16A34A';

/** Met à jour les six panneaux selon la progression p ; renvoie la visibilité du panneau le plus visible. */
export function updatePartnerHud(root: Element, p: number): number {
  const E = refs(root);
  let bestV = 0;
  PARTNER_STEPS.forEach((_, k) => {
    const { loc, v } = stepWin(p, k, PARTNER_STEPS);
    bestV = Math.max(bestV, v);
    const panel = E.panels[k];
    if (panel) {
      panel.setAttribute('opacity', String(v));
      panel.setAttribute('transform', `translate(0 ${(1 - v) * 16})`);
    }
    if (v <= 0.001) return;
    const tick = (name: string, t: number) => {
      E.get(`${name}Dot`)?.setAttribute('fill', mix(GREY, GREEN, t));
      E.get(`${name}Chk`)?.setAttribute('opacity', String(t));
    };
    if (k === 0) {
      [0.15, 0.45, 0.75].forEach((s, i) => tick(`p1s${i}`, smooth((loc - s) / 0.12)));
    } else if (k === 1) {
      [0.2, 0.4, 0.6].forEach((s, i) => tick(`p2s${i}`, smooth((loc - s) / 0.12)));
      E.get('p2Bar')?.setAttribute('width', String(282 * smooth((loc - 0.15) / 0.75)));
    } else if (k === 2) {
      const e = smooth(loc / 0.6);
      E.get('p3Card')?.setAttribute('transform', `translate(30 ${56 - 3 * Math.sin(e * Math.PI)}) rotate(${-3 + 3 * e} 48 33)`);
    } else if (k === 3) {
      const val = smooth(loc / 0.7);
      E.get('p4Arc')?.setAttribute('stroke-dasharray', `${val * 100} 100`);
      const a = lerp(Math.PI, 0.35, val); // de la gauche vers la droite
      E.get('p4Needle')?.setAttribute('x2', String(80 + 38 * Math.cos(a)));
      E.get('p4Needle')?.setAttribute('y2', String(150 - 38 * Math.sin(a)));
    } else if (k === 4) {
      [0.1, 0.35, 0.6].forEach((s, i) => {
        const t = smooth((loc - s) / 0.15);
        const row = E.get(`p5Row${i}`);
        row?.setAttribute('opacity', String(t));
        row?.setAttribute('transform', `translate(${(1 - t) * 24} 0)`);
      });
    } else if (k === 5) {
      PROFILES.forEach((pf, i) => {
        const t = smooth((loc - i * 0.1) / 0.3);
        E.get(`p6Ring${i}`)?.setAttribute('stroke-dasharray', `${pf.frac * 100 * t} 100`);
      });
    }
  });
  return bestV;
}
