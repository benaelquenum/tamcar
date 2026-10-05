'use client';

import { useEffect, useState } from 'react';
import { CheckIcon } from '@/components/Icon';
import {
  APPLICATION_TYPE_META,
  requiredDocItems,
  TAMCAR_RDV_ADDRESS,
  type DriverApplicationType,
} from '@/lib/appointment';

const TABS: DriverApplicationType[] = ['cession', 'proprietaire'];

/**
 * Pièces à apporter au rendez-vous. Deux onglets, un par formule : la formule Cession n'a pas besoin des
 * papiers du véhicule (TamCar le fournit), la formule Propriétaire oui. L'onglet suit la formule choisie
 * dans le formulaire ; le candidat peut aussi consulter l'autre. Avec `tabs={false}`, seule la liste de
 * `type` est affichée (page de statut d'un rendez-vous déjà pris).
 */
export function DocsChecklist({
  type,
  title = 'À apporter au rendez-vous',
  withAddress = false,
  tabs = true,
}: {
  type: DriverApplicationType | null | undefined;
  title?: string;
  withAddress?: boolean;
  tabs?: boolean;
}) {
  const [tab, setTab] = useState<DriverApplicationType>(type ?? 'cession');
  useEffect(() => {
    if (type) setTab(type);
  }, [type]);

  const shown: DriverApplicationType = tabs ? tab : type ?? 'cession';
  const docs = requiredDocItems(shown);

  return (
    <section className="rounded-xl border border-primary-100 bg-primary-50 p-lg">
      <h2 className="text-xs font-bold uppercase tracking-wider text-primary-700">{title}</h2>

      {tabs && (
        <div role="tablist" className="mt-md grid grid-cols-2 gap-xs rounded-lg bg-white p-xs">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-sm py-xs text-xs font-bold transition ${
                tab === t ? 'bg-primary-500 text-white shadow-glow' : 'text-neutral-700 hover:bg-primary-50'
              }`}
            >
              {APPLICATION_TYPE_META[t].label}
            </button>
          ))}
        </div>
      )}

      <p className="mt-md text-[11px] text-neutral-600">Apportez les originaux : chaque pièce est vérifiée sur place.</p>
      <ul className="mt-sm space-y-xs text-sm text-neutral-900" role="tabpanel">
        {docs.map((d) => (
          <li key={d.label} className="flex items-start gap-xs">
            <CheckIcon className="mt-0.5 h-4 w-4 flex-none text-primary-500" strokeWidth={3} />
            <span>
              {d.label}
              {d.note && <span className="block text-xs text-neutral-600">{d.note}</span>}
            </span>
          </li>
        ))}
      </ul>
      {shown === 'cession' && (
        <p className="mt-sm text-xs text-neutral-700">TamCar vous fournit le véhicule : aucun papier de véhicule à apporter.</p>
      )}
      <p className="mt-sm text-xs text-neutral-700">
        <strong>Votre photo d’identité</strong> est prise sur place par TamCar : rien à préparer.
      </p>
      {withAddress && (
        <div className="mt-md rounded-lg bg-white p-md">
          <p className="text-[10px] font-bold uppercase text-primary-700">Adresse TamCar</p>
          <p className="mt-xs text-sm font-semibold text-neutral-900">{TAMCAR_RDV_ADDRESS}</p>
        </div>
      )}
    </section>
  );
}
