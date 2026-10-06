'use client';

import { useEffect, useRef, useState } from 'react';
import { Gauge } from '@/components/anim/Gauge';
import { Wheel } from '@/components/anim/Wheel';
import { simulateAction } from '@/app/espace/simulateur/actions';
import { CATEGORY_OPTIONS, MAX_QTY, fmtF, fmtM, fmtPct, type CategoryId, type SimOutput } from '@/lib/simulator-ui';

/** Pédale d'accélérateur : elle s'enfonce quand on augmente le rythme du chauffeur. */
function Pedal({ pressed }: { pressed: number }) {
  const angle = pressed * 26;
  return (
    <svg viewBox="0 0 120 170" className="h-28 w-auto" aria-hidden>
      <rect x="6" y="150" width="108" height="12" rx="6" fill="#1E293B" />
      <g style={{ transformOrigin: '60px 150px', transform: `rotate(${-angle}deg)`, transition: 'transform .25s ease' }}>
        <rect x="34" y="18" width="52" height="132" rx="12" fill="url(#pedal)" stroke="#1E3A8A" strokeWidth="3" />
        {[36, 52, 68, 84, 100, 116].map((y) => (
          <rect key={y} x="42" y={y} width="36" height="5" rx="2.5" fill="#fff" opacity="0.85" />
        ))}
      </g>
      <circle cx="60" cy="150" r="7" fill="#EAB308" />
      <defs>
        <linearGradient id="pedal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#60A5FA" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const toNum = (s: string): number | null => {
  const n = Number(s.replace(/\D/g, ''));
  return n > 0 ? n : null;
};

type Counts = Record<CategoryId, number>;
type Costs = Record<CategoryId, string>;

/**
 * Simulateur de gains (partenaires et administrateurs). Le calcul se fait sur le serveur : ce composant ne contient
 * ni part, ni plancher, ni durée ; il envoie des choix et affiche le résultat.
 */
export function FleetSimulator() {
  const [qty, setQty] = useState<Counts>({ moto: 0, tricycle: 0, essentiel: 1, confort: 0, vip: 0 });
  const [costs, setCosts] = useState<Costs>({ moto: '', tricycle: '', essentiel: '', confort: '', vip: '' });
  const [factor, setFactor] = useState(1);
  const [out, setOut] = useState<SimOutput | null>(null);
  const [pending, setPending] = useState(true);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setPending(true);
    const t = setTimeout(async () => {
      try {
        const items = CATEGORY_OPTIONS.filter((c) => qty[c.id] > 0).map((c) => ({ id: c.id, qty: qty[c.id], cost: toNum(costs[c.id]) }));
        const res = await simulateAction({ factor, items });
        if (seq.current === mine) setOut(res);
      } catch {
        if (seq.current === mine) setOut({ ok: false, error: 'Simulation indisponible : rechargez la page.' });
      } finally {
        if (seq.current === mine) setPending(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [qty, costs, factor]);

  const pedal = (factor - 1) / 0.5;
  const lines = out && out.ok ? out.lines : [];
  const totals = out && out.ok ? out.totals : null;

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-neutral-200">
      <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
        {/* ------------------------------------------------------ Réglages */}
        <div className="p-xl lg:p-2xl">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">1. Vos véhicules</p>
          <ul className="mt-md divide-y divide-neutral-200 rounded-2xl border border-neutral-200">
            {CATEGORY_OPTIONS.map((c) => {
              const line = lines.find((l) => l.id === c.id);
              const n = qty[c.id];
              return (
                <li key={c.id} className="p-md">
                  <div className="flex items-center justify-between gap-md">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-neutral-900">{c.label}</p>
                      {line && (
                        <p className="text-xs text-neutral-500">
                          Contrat de {line.months >= 36 ? `${line.months / 12} ans` : `${line.months} mois`} · minimum {fmtF(line.floor)} par jour
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-sm" role="group" aria-label={`Nombre de véhicules : ${c.label}`}>
                      <button
                        type="button"
                        onClick={() => setQty((q) => ({ ...q, [c.id]: Math.max(0, q[c.id] - 1) }))}
                        disabled={n === 0}
                        aria-label={`Retirer un véhicule ${c.label}`}
                        className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-lg font-bold text-neutral-800 transition hover:bg-primary-50 disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-base font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {n}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQty((q) => ({ ...q, [c.id]: Math.min(MAX_QTY, q[c.id] + 1) }))}
                        disabled={n >= MAX_QTY}
                        aria-label={`Ajouter un véhicule ${c.label}`}
                        className="grid h-8 w-8 place-items-center rounded-full bg-primary-500 text-lg font-bold text-white transition hover:bg-primary-700 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {n > 0 && (
                    <label className="mt-sm block">
                      <span className="text-[11px] text-neutral-600">Coût de revient d’un véhicule pour vous (facultatif) : achat, dédouanement, assurance, entretien… sur toute la durée</span>
                      <input
                        inputMode="numeric"
                        value={costs[c.id]}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '');
                          const text = digits ? Number(digits).toLocaleString('fr-FR').replace(/[  ]/g, ' ') : '';
                          setCosts((cs) => ({ ...cs, [c.id]: text }));
                        }}
                        placeholder="ex. 3 400 000"
                        className="mt-xs w-full rounded-xl bg-neutral-100 px-md py-sm text-sm font-semibold text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </label>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-xl text-xs font-bold uppercase tracking-wider text-neutral-500">2. Le rythme du chauffeur</p>
          <div className="mt-md flex items-center gap-lg">
            <Pedal pressed={pedal} />
            <div className="flex-1">
              <input
                type="range"
                min={1}
                max={1.5}
                step={0.05}
                value={factor}
                onChange={(e) => setFactor(Number(e.target.value))}
                className="w-full accent-primary-500"
                aria-label="Rythme du chauffeur par rapport aux recettes minimales"
              />
              <div className="mt-xs flex justify-between text-[11px] font-semibold text-neutral-500">
                <span>Au minimum</span>
                <span className="text-primary-700">{factor === 1 ? 'Recettes minimales' : `+${Math.round((factor - 1) * 100)} % au-dessus`}</span>
                <span>+50 %</span>
              </div>
              <p className="mt-sm text-xs text-neutral-500">Enfoncez l’accélérateur : plus le chauffeur fait de courses, plus vous gagnez.</p>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------ Résultats */}
        <div className="relative overflow-hidden bg-neutral-900 p-xl text-white lg:p-2xl">
          <Wheel className="pointer-events-none absolute -bottom-24 -right-24 w-72 opacity-25" spinSeconds={Math.max(1.2, 7 / factor / factor)} scrollFactor={0} />
          <div className={`relative transition-opacity ${pending ? 'opacity-60' : 'opacity-100'}`}>
            <Gauge live value={pedal} valueText={`${Math.round(factor * 100)} %`} label="RYTHME DU CHAUFFEUR" sub="100 % = recettes minimales" className="mx-auto w-48 drop-shadow-2xl" />

            {out && !out.ok && <p className="mt-lg rounded-xl bg-error/20 p-md text-sm font-semibold text-white">{out.error}</p>}

            {totals && totals.qty === 0 && <p className="mt-lg text-sm text-neutral-300">Ajoutez au moins un véhicule pour lancer la simulation.</p>}

            {totals && totals.qty > 0 && (
              <dl className="mt-lg space-y-md">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                    Votre part en cash, par mois{totals.qty > 1 ? ` · ${totals.qty} véhicules` : ''}
                  </dt>
                  <dd className="text-3xl font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmtF(totals.cashPerMonth)}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-xl gap-y-md">
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wider text-neutral-400">Fonds de rachat à la cession</dt>
                    <dd className="text-lg font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmtF(totals.fundNet)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wider text-neutral-400">Total sur la durée des contrats</dt>
                    <dd className="text-lg font-bold text-cyan-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmtM(totals.total)}
                    </dd>
                  </div>
                </div>
                {totals.margin !== null && totals.roi !== null && totals.cost !== null && (
                  <div className="rounded-xl bg-white/10 p-md">
                    <dt className="text-xs font-bold uppercase tracking-wider text-neutral-300">Votre rendement · coût de revient {fmtM(totals.cost)}</dt>
                    <dd className="mt-xs text-lg font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {totals.margin >= 0 ? '+' : '−'}
                      {fmtM(Math.abs(totals.margin))} · {fmtPct(totals.roi)} <span className="text-sm font-semibold text-neutral-300">sur la durée</span>
                    </dd>
                  </div>
                )}

                {lines.length > 1 || lines.some((l) => l.qty > 1 || l.note) ? (
                  <div className="space-y-sm border-t border-white/15 pt-md">
                    <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Par véhicule</p>
                    {lines.map((l) => (
                      <div key={l.id} className="text-sm">
                        <p className="font-bold">
                          {l.label} <span className="font-semibold text-neutral-400">× {l.qty}</span>
                        </p>
                        <p className="text-neutral-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fmtF(l.cashPerMonth)} / mois · total {fmtM(l.total)}
                          {l.margin !== null && l.roi !== null ? ` · ${l.margin >= 0 ? '+' : '−'}${fmtM(Math.abs(l.margin))} (${fmtPct(l.roi)})` : ''}
                        </p>
                        {l.note && <p className="text-xs text-neutral-400">{l.note}</p>}
                      </div>
                    ))}
                  </div>
                ) : null}
              </dl>
            )}
          </div>
        </div>
      </div>
      <p className="border-t border-neutral-200 bg-neutral-100 px-xl py-md text-[11px] leading-relaxed text-neutral-500">
        {out && out.ok ? out.notes.join(' ') : 'Simulation indicative. Ni garantie de rendement, ni engagement avant la signature d’un contrat.'}{' '}
        <strong className="text-neutral-700">Confidentiel : ces chiffres sont réservés aux partenaires TamCar.</strong>
      </p>
    </div>
  );
}
