'use client';

import { useFormState } from 'react-dom';

/**
 * Formulaire d'action serveur qui AFFICHE le message d'erreur (ou de réussite) renvoyé par l'action.
 *
 * Pourquoi : en production, Next.js masque le message d'une exception lancée par une action serveur (l'utilisateur ne voit
 * qu'une « référence ») : « Ce retrait est déjà clos », « Réservé à l'équipe »... restaient invisibles. Les actions
 * renvoient donc { error } ou { ok } au lieu de lancer.
 */
export type ActionState = { error?: string; ok?: string } | null;

export function ActionForm({
  action,
  className,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useFormState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="mt-xs w-full rounded-md bg-error/10 px-sm py-xs text-xs font-semibold text-error">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="mt-xs w-full rounded-md bg-success/10 px-sm py-xs text-xs font-semibold text-success">
          {state.ok}
        </p>
      )}
    </form>
  );
}
