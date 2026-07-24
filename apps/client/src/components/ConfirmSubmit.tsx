'use client';

import { useFormStatus } from 'react-dom';

/**
 * Bouton de soumission pour les <form action={serverAction}> de l'admin.
 * - Demande une confirmation native avant d'exécuter une action sensible.
 * - Affiche un état « pending » (désactivé) pendant l'exécution du server action.
 */
export function ConfirmSubmit({
  message,
  className,
  children,
  pendingLabel = '…',
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className={className}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
