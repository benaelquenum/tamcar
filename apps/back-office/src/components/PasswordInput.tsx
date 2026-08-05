'use client';

import { useState } from 'react';

type Props = {
  name: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  className?: string;
  wrapperClassName?: string;
};

/**
 * Champ mot de passe avec bouton œil pour révéler/masquer la saisie.
 * Conserve name / required / autoComplete pour rester compatible avec
 * les Server Actions (soumission de formulaire classique).
 */
export function PasswordInput({
  name,
  placeholder,
  required,
  minLength,
  autoComplete,
  className = 'w-full rounded-lg bg-neutral-100 px-lg py-md text-base text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500',
  wrapperClassName = '',
}: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        name={name}
        type={show ? 'text' : 'password'}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={`${className} pr-12`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute inset-y-0 right-0 grid w-12 place-items-center text-neutral-400 hover:text-neutral-700"
        tabIndex={-1}
      >
        {show ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
