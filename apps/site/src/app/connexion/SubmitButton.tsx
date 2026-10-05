'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({ children, pendingLabel = 'Connexion…' }: { children: React.ReactNode; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-gradient-to-r from-primary-500 to-primary-700 py-md text-base font-extrabold text-white shadow-glow transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
