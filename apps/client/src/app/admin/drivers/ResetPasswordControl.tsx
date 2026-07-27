'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { resetDriverPassword, type ResetPwState } from './actions';

const INITIAL: ResetPwState = { ok: false };

/**
 * Bouton admin « Mot de passe » : ouvre un panneau pour saisir directement un
 * nouveau mot de passe (ou le laisser vide → généré), puis affiche le résultat
 * à communiquer au chauffeur. Réservé à l'admin (garde côté action).
 */
export function ResetPasswordControl({
  profileId,
  name,
}: {
  profileId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(resetDriverPassword, INITIAL);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-neutral-100 px-md py-xs text-xs font-bold text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-200"
      >
        Mot de passe
      </button>
    );
  }

  return (
    <div className="w-56 rounded-lg bg-neutral-50 p-sm text-left ring-1 ring-neutral-200">
      {state.ok && state.password ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-success">
            Nouveau mot de passe
          </p>
          <p className="mt-xs select-all break-all rounded bg-white px-sm py-xs font-mono text-sm font-bold text-neutral-900 ring-1 ring-neutral-200">
            {state.password}
          </p>
          <p className="mt-xs text-[10px] text-neutral-500">
            Communiquez-le à {name}. Il ne sera plus affiché.
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-xs text-[11px] font-bold text-primary-700 underline"
          >
            Fermer
          </button>
        </div>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="profile_id" value={profileId} />
          <p className="mb-xs text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Nouveau mot de passe · {name}
          </p>
          <input
            name="password"
            type="text"
            autoComplete="off"
            placeholder="Vide = généré automatiquement"
            className="w-full rounded-md bg-white px-sm py-xs text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {state.error && (
            <p className="mt-xs text-[11px] font-medium text-error">{state.error}</p>
          )}
          <div className="mt-sm flex items-center gap-xs">
            <SubmitBtn />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-md py-xs text-xs font-bold text-neutral-500 hover:text-neutral-800"
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary-500 px-md py-xs text-xs font-bold text-white hover:brightness-110 disabled:opacity-50"
    >
      {pending ? '…' : 'Définir'}
    </button>
  );
}
