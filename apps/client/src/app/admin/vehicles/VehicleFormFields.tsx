'use client';

import { useState } from 'react';

type DealerOption = { dealer_id: string; company_name: string };
type DriverOption = { driver_id: string; profile_id: string; full_name: string; current_formula?: 'cession' | 'proprietaire' };

export function VehicleFormFields({
  dealers,
  ownerCandidates,
}: {
  dealers: DealerOption[];
  ownerCandidates: DriverOption[];
}) {
  const [dealerId, setDealerId] = useState('');
  const [ownerId, setOwnerId] = useState('');

  const dealerChosen = dealerId !== '';
  const ownerChosen = ownerId !== '';

  return (
    <>
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
          Concessionnaire (cession)
        </span>
        <select
          name="dealer_partner_id"
          value={dealerId}
          onChange={(e) => {
            const v = e.target.value;
            setDealerId(v);
            if (v !== '') setOwnerId(''); // désactive le chauffeur propriétaire
          }}
          className="mt-xs w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">— Aucun —</option>
          {dealers.map((d) => (
            <option key={d.dealer_id} value={d.dealer_id}>{d.company_name}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${dealerChosen ? 'text-neutral-300' : 'text-neutral-500'}`}>
          Chauffeur propriétaire
          {!dealerChosen && !ownerChosen && (
            <span className="ml-xs font-normal normal-case tracking-normal text-neutral-400">
              (activé car aucun concessionnaire sélectionné)
            </span>
          )}
        </span>
        <select
          name="owner_profile_id"
          value={ownerId}
          disabled={dealerChosen}
          onChange={(e) => setOwnerId(e.target.value)}
          className={`mt-xs w-full rounded-lg px-md py-sm text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
            dealerChosen
              ? 'bg-neutral-50 text-neutral-400 cursor-not-allowed'
              : 'bg-neutral-100 text-neutral-900'
          }`}
        >
          <option value="">— Aucun —</option>
          {ownerCandidates.map((d) => (
            <option key={d.driver_id} value={d.profile_id}>
              {d.full_name}
              {d.current_formula === 'cession' && ' (actuellement cession — basculera en propriétaire)'}
            </option>
          ))}
        </select>
      </label>

      {/* Champ hidden qui dérive la formule automatiquement pour la server action */}
      <input
        type="hidden"
        name="formula"
        value={dealerChosen ? 'cession' : 'proprietaire'}
      />

      {/* Résumé visuel */}
      <div className="md:col-span-2">
        <div className={`rounded-lg p-md text-xs ${
          dealerChosen ? 'bg-primary-50 text-primary-800'
          : ownerChosen ? 'bg-primary-50 text-primary-800'
          : 'bg-warning/10 text-warning'
        }`}>
          {dealerChosen && (
            <>Formule <strong>Cession</strong> — le véhicule appartient au concessionnaire sélectionné. Le split 40/10/30/20 s&apos;applique.</>
          )}
          {!dealerChosen && ownerChosen && (
            <>Formule <strong>Propriétaire</strong> — le véhicule appartient au chauffeur. Split 80/20 (80 % chauffeur).</>
          )}
          {!dealerChosen && !ownerChosen && (
            <>Sélectionne <strong>soit un concessionnaire</strong> (formule Cession), <strong>soit un chauffeur propriétaire</strong> (formule Propriétaire).</>
          )}
        </div>
      </div>
    </>
  );
}
