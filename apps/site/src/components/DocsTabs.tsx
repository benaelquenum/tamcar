'use client';

import { useState } from 'react';
import { FORMULAS, type Formula } from '@/lib/content';

const ORDER: Formula[] = ['cession', 'proprietaire'];

/** Pièces à apporter au rendez-vous : un onglet par formule. */
export function DocsTabs() {
  const [tab, setTab] = useState<Formula>('cession');
  const f = FORMULAS[tab];
  return (
    <div className="rounded-2xl border border-primary-100 bg-primary-50 p-xl">
      <div role="tablist" className="grid grid-cols-2 gap-xs rounded-xl bg-white p-xs">
        {ORDER.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-md py-sm text-sm font-bold transition ${
              tab === t ? 'bg-primary-500 text-white shadow-glow' : 'text-neutral-700 hover:bg-primary-50'
            }`}
          >
            {FORMULAS[t].label}
          </button>
        ))}
      </div>
      <p className="mt-lg text-sm text-neutral-600">Apportez les originaux : chaque pièce est vérifiée sur place.</p>
      <ul className="mt-md space-y-sm" role="tabpanel">
        {f.docs.map((d) => (
          <li key={d.label} className="flex items-start gap-sm text-base text-neutral-900">
            <span className="mt-1.5 inline-block h-2 w-2 flex-none rounded-full bg-primary-500" />
            <span>
              {d.label}
              {d.note && <span className="block text-sm text-neutral-600">{d.note}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-md text-sm text-neutral-700">{f.vehicleNote}</p>
      <p className="mt-sm text-sm text-neutral-700">
        <strong>Votre photo d’identité</strong> est prise sur place par TamCar : rien à préparer.
      </p>
    </div>
  );
}
