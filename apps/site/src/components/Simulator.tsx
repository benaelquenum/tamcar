'use client';

import { useMemo, useState } from 'react';
import { Gauge } from '@/components/anim/Gauge';
import { Wheel } from '@/components/anim/Wheel';
import { CATEGORIES, fmtF, fmtM, fmtPct, simulate, type CategoryId } from '@/lib/simulator';

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

export function Simulator() {
  const [catId, setCatId] = useState<CategoryId>('essentiel');
  const [factor, setFactor] = useState(1);
  const [costText, setCostText] = useState('');

  const cat = CATEGORIES.find((c) => c.id === catId)!;
  const cost = useMemo(() => {
    const n = Number(costText.replace(/\D/g, ''));
    return n > 0 ? n : null;
  }, [costText]);
  const r = simulate(cat, factor, cost);
  const years = cat.months / 12;
  const pedal = (factor - 1) / 0.5;

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-neutral-200">
      <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
        {/* ------------------------------------------------------ Réglages */}
        <div className="p-xl lg:p-2xl">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">1. Votre véhicule</p>
          <div className="mt-md flex flex-wrap gap-sm" role="radiogroup" aria-label="Type de véhicule">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={c.id === catId}
                onClick={() => setCatId(c.id)}
                className={`rounded-full px-lg py-sm text-sm font-bold transition ${
                  c.id === catId ? 'bg-primary-500 text-white shadow-glow' : 'bg-neutral-100 text-neutral-800 hover:bg-primary-50'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-sm text-xs text-neutral-500">
            Contrat de {cat.months >= 36 ? `${years} ans` : `${cat.months} mois`} · recettes minimales du véhicule :{' '}
            <strong className="text-neutral-800">{fmtF(cat.floor)}</strong> par jour.
            {cat.note && <span className="mt-xs block">{cat.note}</span>}
          </p>

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

          <p className="mt-xl text-xs font-bold uppercase tracking-wider text-neutral-500">3. Votre rendement (facultatif)</p>
          <label className="mt-md block">
            <span className="text-xs text-neutral-600">
              Coût de revient du véhicule pour vous : achat, dédouanement, assurance, entretien… sur toute la durée
            </span>
            <input
              inputMode="numeric"
              value={costText}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                setCostText(digits ? Number(digits).toLocaleString('fr-FR').replace(/[  ]/g, ' ') : '');
              }}
              placeholder="ex. 3 400 000"
              className="mt-xs w-full rounded-xl bg-neutral-100 px-lg py-md text-base font-semibold text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
        </div>

        {/* ------------------------------------------------------ Résultats */}
        <div className="relative overflow-hidden bg-neutral-900 p-xl text-white lg:p-2xl">
          <Wheel className="pointer-events-none absolute -bottom-24 -right-24 w-72 opacity-25" spinSeconds={Math.max(1.2, 7 / factor / factor)} scrollFactor={0} />
          <div className="relative">
            <Gauge
              live
              value={pedal}
              valueText={`${Math.round(factor * 100)} %`}
              label="RYTHME DU CHAUFFEUR"
              sub="100 % = recettes minimales"
              className="mx-auto w-48 drop-shadow-2xl"
            />
            <dl className="mt-lg space-y-md">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-neutral-400">Votre part en cash, par mois</dt>
                <dd className="text-3xl font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtF(r.cashPerMonth)}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-xl gap-y-md">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-neutral-400">Fonds de rachat à la cession</dt>
                  <dd className="text-lg font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmtF(r.fundNet)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-neutral-400">Total sur la durée</dt>
                  <dd className="text-lg font-bold text-cyan-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmtM(r.total)}
                  </dd>
                </div>
              </div>
              {r.roi !== null && r.margin !== null && r.roiPerYear !== null && (
                <div className="rounded-xl bg-white/10 p-md">
                  <dt className="text-xs font-bold uppercase tracking-wider text-neutral-300">Votre rendement</dt>
                  <dd className="mt-xs text-lg font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {r.margin >= 0 ? '+' : '−'}
                    {fmtM(Math.abs(r.margin))} · {fmtPct(r.roi)} <span className="text-sm font-semibold text-neutral-300">sur la durée</span>
                  </dd>
                  <dd className="text-sm text-neutral-300">soit {fmtPct(r.roiPerYear)} par an</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
      <p className="border-t border-neutral-200 bg-neutral-100 px-xl py-md text-[11px] leading-relaxed text-neutral-500">
        Simulation indicative aux recettes minimales prévues au contrat (26 jours actifs par mois). Part en cash : 30 % du volume ; fonds de
        rachat : 7 % la première année puis 8 %, versé à la cession{cat.senteur ? ', net de 36 000 F par an de produits de senteur pour les chauffeurs' : ''}.
        Vos propres charges ne sont pas incluses. Ni garantie de rendement, ni engagement avant la signature d’un contrat.
      </p>
    </div>
  );
}
