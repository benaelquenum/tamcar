'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createDealer, type CreateDealerState } from './actions';

const initial: CreateDealerState = { ok: false };

export function CreateDealerForm() {
  const [state, formAction] = useFormState(createDealer, initial);

  return (
    <section className="mb-2xl rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
      <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
        Enregistrer un concessionnaire
      </h2>

      {state.ok && state.credentials && (
        <div className="mb-md rounded-xl border-2 border-primary-500 bg-primary-50 p-lg">
          <p className="text-sm font-bold text-primary-900">
            ✓ Concessionnaire <strong>{state.credentials.company_name}</strong> (contact {state.credentials.full_name}) enregistré.
          </p>
          <p className="mt-md text-xs font-semibold text-neutral-700">
            Identifiants à transmettre :
          </p>
          <dl className="mt-sm space-y-xs rounded-lg bg-white p-md ring-1 ring-primary-200">
            {state.credentials.phone && <RowKV label="Téléphone" value={state.credentials.phone} />}
            <RowKV label="Email" value={state.credentials.email} copyable />
            <RowKV label="Mot de passe temporaire" value={state.credentials.password} copyable />
          </dl>
          <p className="mt-md text-[11px] text-neutral-600">
            Le concessionnaire se connecte sur{' '}
            <a href="https://tamcar-client.vercel.app/login" className="underline">tamcar-client.vercel.app</a>
            {' '}avec ces identifiants pour accéder à son portail /dealer.
          </p>
        </div>
      )}
      {state.error && (
        <div className="mb-md rounded-md bg-error/10 p-md text-sm text-error">
          {state.error}
        </div>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-md md:grid-cols-2">
        <Field label="Téléphone *" name="phone" placeholder="+229..." />
        <Field label="Email" name="email" type="email" placeholder="contact@concession.bj" />
        <Field label="Nom complet du contact *" name="full_name" required />
        <Field label="Raison sociale *" name="company_name" required />
        <Field label="RCCM" name="rccm" />
        <Field label="Part concessionnaire (%)" name="share_pct" type="number" step="0.5" defaultValue="25" />
        <Field label="Part actionnaire (%)" name="shareholder_pct" type="number" step="0.5" />
        <label className="flex items-center gap-sm text-sm text-neutral-800">
          <input type="checkbox" name="is_shareholder" className="h-4 w-4" />
          Actionnaire SARL
        </label>
        <div className="md:col-span-2">
          <SubmitButton />
        </div>
      </form>
    </section>
  );
}

function RowKV({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-md">
      <dt className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="flex items-center gap-sm font-mono text-sm text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span className="select-all">{value}</span>
        {copyable && (
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(value); }}
            className="rounded-md bg-neutral-100 px-sm py-xs text-[10px] font-bold text-neutral-700 hover:bg-neutral-200"
          >
            Copier
          </button>
        )}
      </dd>
    </div>
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
      {pending ? 'Création…' : 'Enregistrer le concessionnaire'}
    </button>
  );
}

function Field({
  label, name, type = 'text', required, defaultValue, placeholder, step,
}: {
  label: string; name: string; type?: string; required?: boolean;
  defaultValue?: string; placeholder?: string; step?: string;
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
        step={step}
        className="mt-xs w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </label>
  );
}
