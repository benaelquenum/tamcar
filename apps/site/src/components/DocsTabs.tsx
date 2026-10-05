'use client';

import { useState } from 'react';
import { FORMULAS, type Formula } from '@/lib/content';

const ORDER: Formula[] = ['cession', 'proprietaire'];

/** Pièces à apporter au rendez-vous : un onglet par formule (à poser sur un fond bleu). */
export function DocsTabs() {
  const [tab, setTab] = useState<Formula>('cession');
  const f = FORMULAS[tab];
  return (
    <div className="rounded-2xl bg-white/10 p-xl ring-1 ring-white/25 backdrop-blur">
      <div role="tablist" className="grid grid-cols-2 gap-xs rounded-xl bg-primary-900/50 p-xs">
        {ORDER.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-md py-sm text-sm font-bold transition ${
              tab === t ? 'bg-white text-primary-700 shadow-lg' : 'text-primary-100 hover:bg-white/10'
            }`}
          >
            {FORMULAS[t].label}
          </button>
        ))}
      </div>
      <p className="mt-lg text-sm text-primary-100">Apportez les originaux : chaque pièce est vérifiée sur place.</p>
      <ul className="mt-md space-y-sm" role="tabpanel">
        {f.docs.map((d) => (
          <li key={d.label} className="flex items-start gap-sm text-base text-white">
            <span className="mt-1.5 inline-block h-2 w-2 flex-none rounded-full bg-[#8BE3FF]" />
            <span>
              {d.label}
              {d.note && <span className="block text-sm text-primary-100">{d.note}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-md text-sm text-primary-50">{f.vehicleNote}</p>
      <p className="mt-sm text-sm text-primary-50">
        <strong className="text-white">Votre photo d’identité</strong> est prise sur place par TamCar : rien à préparer.
      </p>
    </div>
  );
}
