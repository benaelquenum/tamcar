'use client';

import { NETWORKS, type Network } from '@/lib/payments';

/**
 * Choix de l'opérateur et saisie du numéro Mobile Money qui recevra la demande de confirmation (code PIN).
 * Le même fichier existe dans les deux applications (client et TamCar Pro) : toute modification se fait dans les deux.
 */
export function MobileMoneyFields({
  network,
  onNetwork,
  phone,
  onPhone,
  disabled,
}: {
  network: Network;
  onNetwork: (n: Network) => void;
  phone: string;
  onPhone: (p: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <div className="mt-lg">
        <label className="mb-xs block text-sm font-semibold text-neutral-900">Opérateur</label>
        <div className="grid grid-cols-3 gap-sm">
          {NETWORKS.map((n) => (
            <button
              key={n.id}
              type="button"
              disabled={disabled}
              onClick={() => onNetwork(n.id)}
              aria-pressed={network === n.id}
              className={`rounded-xl border-2 p-md text-left transition disabled:opacity-60 ${
                network === n.id ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 bg-white hover:border-primary-300'
              }`}
            >
              <p className="text-sm font-bold text-neutral-900">{n.label}</p>
              <p className="text-[10px] text-neutral-600">{n.sub}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-md">
        <label htmlFor="momo-phone" className="mb-xs block text-sm font-semibold text-neutral-900">
          Numéro Mobile Money
        </label>
        <div className="flex items-center overflow-hidden rounded-xl bg-neutral-100 shadow-sm ring-1 ring-neutral-200 transition focus-within:ring-2 focus-within:ring-primary-500">
          <span className="pl-lg text-sm font-semibold text-neutral-600">+229</span>
          <input
            id="momo-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            disabled={disabled}
            value={phone}
            onChange={(e) => onPhone(e.target.value)}
            placeholder="01 97 00 00 00"
            className="min-w-0 flex-1 bg-transparent px-md py-md text-lg font-bold text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-300"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          />
        </div>
        <p className="mt-xs text-[11px] text-neutral-500">
          Le numéro du compte {NETWORKS.find((n) => n.id === network)?.label} qui paie : il recevra une demande à confirmer avec son code PIN.
        </p>
      </div>
    </>
  );
}

/** Panneau affiché pendant que le client confirme le paiement sur son téléphone. */
export function WaitingForConfirmation({ network, phone }: { network: Network; phone: string }) {
  const label = NETWORKS.find((n) => n.id === network)?.label ?? 'Mobile Money';
  return (
    <div className="mt-md rounded-xl bg-primary-50 p-lg text-center" role="status" aria-live="polite">
      <span className="mx-auto mb-sm block h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" aria-hidden />
      <p className="text-sm font-bold text-neutral-900">Confirmez le paiement sur votre téléphone</p>
      <p className="mt-xs text-xs text-neutral-700">
        Une demande {label} vient d’être envoyée au <strong>{phone}</strong>. Saisissez votre code PIN pour valider. Cette fenêtre se met
        à jour toute seule : ne la fermez pas.
      </p>
    </div>
  );
}
