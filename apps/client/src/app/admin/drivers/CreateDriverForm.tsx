'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { CheckIcon } from '@/components/Icon';
import { createDriver, type CreateDriverState } from './actions';

const initial: CreateDriverState = { ok: false };

export function CreateDriverForm() {
  const [state, formAction] = useFormState(createDriver, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Vide les champs après un enregistrement réussi — le panneau
  // d'identifiants reste affiché au-dessus pour que la secrétaire
  // ait le temps de les copier avant d'enregistrer le suivant.
  useEffect(() => {
    if (state.ok && state.credentials) {
      formRef.current?.reset();
    }
  }, [state.ok, state.credentials]);

  return (
    <section className="mb-2xl rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
      <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
        Enregistrer un chauffeur
      </h2>

      {state.ok && state.credentials && (
        <CredentialsPanel c={state.credentials} kind="chauffeur" />
      )}
      {state.error && (
        <div className="mb-md rounded-md bg-error/10 p-md text-sm text-error">
          {state.error}
        </div>
      )}

      <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-md md:grid-cols-2">
        <Field label="Téléphone *" name="phone" placeholder="+229..." />
        <Field label="Email" name="email" type="email" placeholder="chauffeur@exemple.com" />
        <Field label="Nom complet *" name="full_name" required />
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Formule *</span>
          <select
            name="application_type"
            required
            className="mt-xs w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="cession">Cession (location-vente)</option>
            <option value="proprietaire">Propriétaire</option>
          </select>
        </label>
        <Field label="N° permis" name="license" />
        <Field label="N° pièce d'identité" name="id_card" />
        <div className="md:col-span-2">
          <SubmitButton />
          <p className="mt-xs text-[11px] text-neutral-500">
            Un compte Supabase Auth est créé automatiquement avec l&apos;email et un mot de passe temporaire.
            Communique-les au chauffeur — il pourra ensuite les modifier depuis son portail.
          </p>
        </div>
      </form>
    </section>
  );
}

function CredentialsPanel({
  c,
  kind,
}: {
  c: { email: string; password: string; phone: string; full_name: string };
  kind: 'chauffeur' | 'concessionnaire';
}) {
  return (
    <div className="mb-md rounded-xl border-2 border-primary-500 bg-primary-50 p-lg">
      <p className="flex items-center gap-xs text-sm font-bold text-primary-900">
        <CheckIcon className="h-4 w-4" strokeWidth={3} />
        {kind === 'chauffeur' ? 'Chauffeur' : 'Concessionnaire'} <strong className="mx-xs">{c.full_name}</strong> enregistré.
      </p>
      <p className="mt-md text-xs font-semibold text-neutral-700">
        Identifiants à transmettre au {kind} :
      </p>
      <dl className="mt-sm space-y-xs rounded-lg bg-white p-md ring-1 ring-primary-200">
        {c.phone && (
          <RowKV label="Téléphone" value={c.phone} />
        )}
        <RowKV label="Email" value={c.email} copyable />
        <RowKV label="Mot de passe temporaire" value={c.password} copyable />
      </dl>
      <p className="mt-md text-[11px] text-neutral-600">
        Le {kind} peut se connecter dès maintenant sur{' '}
        {kind === 'chauffeur'
          ? <a href="https://tamcar-driver-portal.vercel.app/login" className="underline">tamcar-driver-portal.vercel.app</a>
          : <a href="https://tamcar-client.vercel.app/login" className="underline">tamcar-client.vercel.app</a>}
        {' '}avec ces identifiants.
      </p>
    </div>
  );
}

function RowKV({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-md">
      <dt className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="flex items-center gap-sm font-mono text-sm text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span className="select-all">{value}</span>
        {copyable && <CopyButton value={value} />}
      </dd>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard?.writeText(value); }}
      className="rounded-md bg-neutral-100 px-sm py-xs text-[10px] font-bold text-neutral-700 hover:bg-neutral-200"
    >
      Copier
    </button>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-gradient-to-r from-primary-500 to-primary-700 px-lg py-sm text-sm font-bold text-white shadow-glow disabled:opacity-50"
    >
      {pending ? 'Création…' : 'Enregistrer le chauffeur'}
    </button>
  );
}

function Field({
  label, name, type = 'text', required, defaultValue, placeholder,
}: {
  label: string; name: string; type?: string; required?: boolean;
  defaultValue?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</span>
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-xs w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </label>
  );
}
