'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { CONTRACT_LABELS, type ContractType } from '@/lib/rh';

const INPUT =
  'mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500';
const LABEL =
  'text-xs font-bold uppercase tracking-wider text-neutral-500';

export function NewEmployeeForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState<ContractType>('cdi');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    const text = (k: string) => String(fd.get(k) || '').trim() || null;
    const date = (k: string) => String(fd.get(k) || '') || null;

    const lastName = text('last_name');
    const firstNames = text('first_names');
    const hiredOn = date('hired_on');
    const salary = parseInt(
      String(fd.get('gross_salary') || '0').replace(/\s/g, ''),
      10,
    );

    if (!lastName || !firstNames || !hiredOn) {
      setError('Nom, prénoms et date d’embauche sont obligatoires.');
      return;
    }
    if (contract === 'cdd' && !date('contract_end_on')) {
      setError('Un CDD doit préciser sa date de fin.');
      return;
    }

    setBusy(true);
    const { data, error: err } = await supabaseBrowser.rpc(
      'bo_create_employee',
      {
        p_last_name: lastName,
        p_first_names: firstNames,
        p_hired_on: hiredOn,
        p_gross_salary_fcfa: Number.isFinite(salary) ? salary : 0,
        p_job_title: text('job_title'),
        p_contract_type: contract,
        p_birth_date: date('birth_date'),
        p_id_card_no: text('id_card_no'),
        p_id_card_expiry: date('id_card_expiry'),
        p_phone: text('phone'),
        p_address: text('address'),
        p_contract_end_on: date('contract_end_on'),
        p_trial_end_on: date('trial_end_on'),
        p_cnss_no: text('cnss_no'),
        p_notes: text('notes'),
      },
    );

    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    router.push(`/rh/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-xl flex flex-col gap-lg">
      {error && (
        <div className="rounded-md bg-error/10 p-md text-sm text-error">
          {error}
        </div>
      )}

      <section className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
          État civil
        </h2>
        <div className="mt-md grid grid-cols-1 gap-lg sm:grid-cols-2">
          <div>
            <label className={LABEL}>Nom</label>
            <input name="last_name" required className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Prénoms</label>
            <input name="first_names" required className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Date de naissance</label>
            <input name="birth_date" type="date" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Téléphone</label>
            <input name="phone" inputMode="tel" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Numéro de pièce d&apos;identité</label>
            <input name="id_card_no" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Expiration de la pièce</label>
            <input name="id_card_expiry" type="date" className={INPUT} />
            <p className="mt-xs text-xs text-neutral-400">
              Renseignez-la : elle alimente les alertes RH.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Adresse</label>
            <input name="address" className={INPUT} />
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
          Contrat et rémunération
        </h2>
        <div className="mt-md grid grid-cols-1 gap-lg sm:grid-cols-2">
          <div>
            <label className={LABEL}>Fonction</label>
            <input
              name="job_title"
              placeholder="Ex. : Chargé du support"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Type de contrat</label>
            <select
              name="contract_type"
              value={contract}
              onChange={(ev) => setContract(ev.target.value as ContractType)}
              className={INPUT}
            >
              {Object.entries(CONTRACT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Date d&apos;embauche</label>
            <input
              name="hired_on"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Fin de période d&apos;essai</label>
            <input name="trial_end_on" type="date" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>
              Fin de contrat {contract === 'cdd' ? '(obligatoire)' : '(si CDD)'}
            </label>
            <input
              name="contract_end_on"
              type="date"
              required={contract === 'cdd'}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Salaire brut mensuel (FCFA)</label>
            <input
              name="gross_salary"
              inputMode="numeric"
              placeholder="Ex. : 120 000"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Numéro CNSS</label>
            <input name="cnss_no" className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Notes</label>
            <textarea name="notes" rows={2} className={INPUT} />
          </div>
        </div>
      </section>

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-primary-500 py-md text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Enregistrement…' : 'Enregistrer l’embauche'}
      </button>
    </form>
  );
}
