import { EXAMPLE_PRICE, lerp, smooth, stepWin, clamp01, STEPS } from './journey-shared';

export const HUD_W = 330;
export const HUD_H = 170;

const fmtNum = (n: number) => n.toLocaleString('fr-FR');

/**
 * Les six panneaux d'information (un par chapitre), dessinés en SVG dans un cadre de 330 × 170. Communs aux deux
 * versions de la route : en 2D ils flottent au-dessus du véhicule, en 3D ils se superposent à la scène.
 * Leur contenu change avec le défilement (voir updateHud).
 */
export function HudPanels() {
  return (
    <>
      {/* 1 · Le prix avant de partir : les chiffres montent, le cadenas se ferme */}
      <g data-j="hudPanel" opacity="0">
        <rect width={HUD_W} height={HUD_H} rx="22" fill="#0B1220" stroke="#1E293B" strokeWidth="2" />
        <text x="24" y="38" fontSize="12" fontWeight="700" fill="#94A3B8" letterSpacing="2">EXEMPLE DE COURSE</text>
        <text data-j="d1Num" x="24" y="104" fontSize="58" fontWeight="800" fill="#FDE68A" style={{ fontVariantNumeric: 'tabular-nums' }}>0</text>
        <text x="214" y="104" fontSize="28" fontWeight="700" fill="#94A3B8">F</text>
        <g transform="translate(262 62)">
          <g data-j="d1Shackle">
            <path d="M8,14 V8 a12,12 0 0 1 24,0 V14" fill="none" stroke="#E2E8F0" strokeWidth="5" strokeLinecap="round" />
          </g>
          <rect x="0" y="14" width="40" height="32" rx="7" fill="#E2E8F0" />
          <circle cx="20" cy="30" r="4.5" fill="#0B1220" />
        </g>
        <g data-j="d1Locked" opacity="0">
          <rect x="24" y="126" width="196" height="30" rx="15" fill="#052E16" />
          <text x="122" y="146" textAnchor="middle" fontSize="14" fontWeight="800" fill="#4ADE80">Prix verrouillé</text>
        </g>
      </g>

      {/* 2 · Un chauffeur que vous reconnaissez */}
      <g data-j="hudPanel" opacity="0">
        <rect width={HUD_W} height={HUD_H} rx="22" fill="#fff" stroke="#E2E8F0" strokeWidth="2" />
        <circle cx="70" cy="66" r="38" fill="#DBEAFE" />
        <circle cx="70" cy="56" r="13" fill="#2563EB" />
        <path d="M42,96 Q70,64 98,96 Q98,102 92,102 H48 Q42,102 42,96 Z" fill="#2563EB" />
        <g data-j="d2Badge" opacity="0">
          <circle cx="100" cy="98" r="13" fill="#16A34A" stroke="#fff" strokeWidth="3" />
          <path d="M93,98 l5,5 l9,-10" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <text x="132" y="62" fontSize="20" fontWeight="800" fill="#0F172A">Votre chauffeur</text>
        <rect x="132" y="76" width="150" height="9" rx="4.5" fill="#E2E8F0" />
        <rect x="132" y="92" width="104" height="9" rx="4.5" fill="#E2E8F0" />
        <g data-j="d2Pill" opacity="0" transform="translate(24 128)">
          <rect width="190" height="30" rx="15" fill="#DCFCE7" />
          <text x="95" y="20" textAnchor="middle" fontSize="14" fontWeight="800" fill="#15803D">Photo vérifiée</text>
        </g>
      </g>

      {/* 3 · Le suivi en direct */}
      <g data-j="hudPanel" opacity="0">
        <rect width={HUD_W} height={HUD_H} rx="22" fill="#0F172A" stroke="#1E293B" strokeWidth="2" />
        <text x="24" y="36" fontSize="12" fontWeight="700" fill="#94A3B8" letterSpacing="2">ARRIVÉE ESTIMÉE</text>
        <text data-j="d3Eta" x="306" y="40" textAnchor="end" fontSize="26" fontWeight="800" fill="#38BDF8" style={{ fontVariantNumeric: 'tabular-nums' }}>6 min</text>
        <line x1="30" y1="100" x2="300" y2="100" stroke="#334155" strokeWidth="6" strokeLinecap="round" strokeDasharray="2 12" />
        <line data-j="d3Fill" x1="30" y1="100" x2="30" y2="100" stroke="#38BDF8" strokeWidth="6" strokeLinecap="round" />
        <path d="M300,84 a12,12 0 1 1 0.1,0 L300,112 Z" transform="translate(0 -2)" fill="#EF4444" />
        <circle cx="300" cy="82" r="4" fill="#fff" />
        <g data-j="d3Dot" transform="translate(30 100)">
          <circle r="13" fill="#38BDF8" opacity="0.3" />
          <circle r="8" fill="#fff" stroke="#38BDF8" strokeWidth="4" />
        </g>
        <rect x="24" y="126" width="200" height="30" rx="15" fill="#1E293B" />
        <text data-j="d3ShareTxt" x="124" y="146" textAnchor="middle" fontSize="14" fontWeight="700" fill="#E2E8F0">Partager le suivi</text>
      </g>

      {/* 4 · La nuit, un proche prévenu */}
      <g data-j="hudPanel" opacity="0">
        <rect width={HUD_W} height={HUD_H} rx="22" fill="#111C3A" stroke="#223059" strokeWidth="2" />
        <text data-j="d4Clock" x="24" y="64" fontSize="46" fontWeight="800" fill="#E0E7FF" style={{ fontVariantNumeric: 'tabular-nums' }}>20:52</text>
        <circle cx="286" cy="44" r="16" fill="#F1F5F9" />
        <circle cx="294" cy="38" r="14" fill="#111C3A" />
        <g data-j="d4Bubble" opacity="0">
          <rect x="24" y="84" width="282" height="64" rx="16" fill="#1D4ED8" />
          <text x="40" y="108" fontSize="14" fontWeight="800" fill="#fff">Prévenir un proche ?</text>
          <g data-j="d4Yes">
            <rect x="40" y="116" width="64" height="24" rx="12" fill="#fff" />
            <text x="72" y="133" textAnchor="middle" fontSize="13" fontWeight="800" fill="#1D4ED8">Oui</text>
            <rect x="112" y="116" width="64" height="24" rx="12" fill="#1E40AF" />
            <text x="144" y="133" textAnchor="middle" fontSize="13" fontWeight="700" fill="#BFDBFE">Non</text>
          </g>
          <g data-j="d4Done" opacity="0">
            <rect x="40" y="116" width="150" height="24" rx="12" fill="#16A34A" />
            <text x="115" y="133" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">Proche prévenu</text>
          </g>
        </g>
      </g>

      {/* 5 · Un bouton SOS */}
      <g data-j="hudPanel" opacity="0">
        <rect width={HUD_W} height={HUD_H} rx="22" fill="#2A0D10" stroke="#5B1B22" strokeWidth="2" />
        <g transform="translate(86 82)">
          <circle className="tc-sos-ring" r="40" fill="#EF4444" />
          <circle className="tc-sos-ring" r="40" fill="#EF4444" style={{ animationDelay: '0.9s' }} />
          <circle r="40" fill="#DC2626" stroke="#FCA5A5" strokeWidth="3" />
          <text y="9" textAnchor="middle" fontSize="26" fontWeight="900" fill="#fff">SOS</text>
        </g>
        <g data-j="d5Sent" opacity="0">
          <text x="146" y="70" fontSize="16" fontWeight="800" fill="#FECACA">Alerte envoyée</text>
          <text x="146" y="94" fontSize="13" fontWeight="600" fill="#FCA5A5">L’équipe TamCar est</text>
          <text x="146" y="112" fontSize="13" fontWeight="600" fill="#FCA5A5">prévenue tout de suite.</text>
          <circle cx="302" cy="62" r="12" fill="#16A34A" />
          <path d="M296,62 l4,4 l8,-9" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>

      {/* 6 · Le corridor Cotonou ↔ Porto-Novo : prix fixe */}
      <g data-j="hudPanel" opacity="0">
        <rect width={HUD_W} height={HUD_H} rx="22" fill="#1D4ED8" />
        <rect x="9" y="9" width={HUD_W - 18} height={HUD_H - 18} rx="15" fill="none" stroke="#fff" strokeWidth="3" />
        <text x="165" y="70" textAnchor="middle" fontSize="28" fontWeight="800" fill="#fff">Cotonou</text>
        <text x="165" y="104" textAnchor="middle" fontSize="28" fontWeight="800" fill="#fff">Porto-Novo</text>
        <path d="M34,76 h30 m-8,-8 l8,8 l-8,8" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M296,98 h-30 m8,-8 l-8,8 l8,8" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="95" y="118" width="140" height="28" rx="14" fill="#FACC15" />
        <text x="165" y="137" textAnchor="middle" fontSize="14" fontWeight="900" fill="#1E293B" letterSpacing="2">PRIX FIXE</text>
      </g>
    </>
  );
}

type HudRefs = {
  panels: SVGElement[];
  d1Num: SVGElement | null;
  d1Shackle: SVGElement | null;
  d1Locked: SVGElement | null;
  d2Pill: SVGElement | null;
  d2Badge: SVGElement | null;
  d3Fill: SVGElement | null;
  d3Dot: SVGElement | null;
  d3Eta: SVGElement | null;
  d3ShareTxt: SVGElement | null;
  d4Clock: SVGElement | null;
  d4Bubble: SVGElement | null;
  d4Yes: SVGElement | null;
  d4Done: SVGElement | null;
  d5Sent: SVGElement | null;
};

const cache = new WeakMap<Element, HudRefs>();

function refs(root: Element): HudRefs {
  let r = cache.get(root);
  if (r) return r;
  const q = (n: string) => root.querySelector(`[data-j="${n}"]`) as SVGElement | null;
  r = {
    panels: Array.from(root.querySelectorAll(`[data-j="hudPanel"]`)) as SVGElement[],
    d1Num: q('d1Num'),
    d1Shackle: q('d1Shackle'),
    d1Locked: q('d1Locked'),
    d2Pill: q('d2Pill'),
    d2Badge: q('d2Badge'),
    d3Fill: q('d3Fill'),
    d3Dot: q('d3Dot'),
    d3Eta: q('d3Eta'),
    d3ShareTxt: q('d3ShareTxt'),
    d4Clock: q('d4Clock'),
    d4Bubble: q('d4Bubble'),
    d4Yes: q('d4Yes'),
    d4Done: q('d4Done'),
    d5Sent: q('d5Sent'),
  };
  cache.set(root, r);
  return r;
}

/** Met à jour les six panneaux selon la progression p ; renvoie la visibilité du panneau le plus visible (0 → 1). */
export function updateHud(root: Element, p: number): number {
  const E = refs(root);
  let bestV = 0;
  STEPS.forEach((_, k) => {
    const { loc, v } = stepWin(p, k);
    bestV = Math.max(bestV, v);
    const panel = E.panels[k];
    if (panel) {
      panel.setAttribute('opacity', String(v));
      panel.setAttribute('transform', `translate(0 ${(1 - v) * 16})`);
    }
    if (v <= 0.001) return; // rien à animer hors de la fenêtre du chapitre
    if (k === 0) {
      // Prix : les chiffres montent, puis le cadenas se ferme et le prix ne bouge plus
      const cp = 1 - Math.pow(1 - clamp01(loc / 0.5), 3);
      const val = Math.round((EXAMPLE_PRICE * cp) / 50) * 50;
      const lock = smooth((loc - 0.55) / 0.15);
      if (E.d1Num) {
        E.d1Num.textContent = fmtNum(val);
        E.d1Num.setAttribute('fill', lock > 0.5 ? '#4ADE80' : '#FDE68A');
      }
      E.d1Shackle?.setAttribute('transform', `translate(0 ${-9 * (1 - lock)})`);
      E.d1Locked?.setAttribute('opacity', String(lock));
    } else if (k === 1) {
      // Chauffeur : le badge « photo vérifiée » apparaît
      const pop = smooth((loc - 0.3) / 0.2);
      const sc = 0.6 + 0.4 * pop + Math.sin(pop * Math.PI) * 0.12;
      E.d2Pill?.setAttribute('opacity', String(pop));
      E.d2Pill?.setAttribute('transform', `translate(24 128) scale(${sc})`);
      E.d2Badge?.setAttribute('opacity', String(pop));
    } else if (k === 2) {
      // Suivi : le chauffeur se rapproche, l'arrivée se précise
      const e = smooth(loc / 0.85);
      const x = lerp(30, 296, e);
      E.d3Fill?.setAttribute('x2', String(x));
      E.d3Dot?.setAttribute('transform', `translate(${x} 100)`);
      if (E.d3Eta) E.d3Eta.textContent = `${Math.max(1, Math.round(6 - 5 * e))} min`;
      if (E.d3ShareTxt) E.d3ShareTxt.textContent = loc > 0.72 ? 'Lien envoyé' : 'Partager le suivi';
    } else if (k === 3) {
      // Nuit : l'horloge passe 21 h, l'application propose de prévenir un proche
      const e = smooth(loc / 0.9);
      const mins = 20 * 60 + 52 + Math.floor(20 * e);
      if (E.d4Clock) E.d4Clock.textContent = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
      E.d4Bubble?.setAttribute('opacity', String(smooth((mins - 21 * 60) / 3)));
      const done = smooth((loc - 0.8) / 0.12);
      E.d4Yes?.setAttribute('opacity', String(1 - done));
      E.d4Done?.setAttribute('opacity', String(done));
    } else if (k === 4) {
      E.d5Sent?.setAttribute('opacity', String(smooth((loc - 0.35) / 0.2)));
    }
  });
  return bestV;
}
