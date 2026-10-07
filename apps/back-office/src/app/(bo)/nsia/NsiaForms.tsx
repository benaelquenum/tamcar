'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { KIND_LABELS, type NsiaKind, type NsiaLine } from '@/lib/nsia';

const inputCls =
  'w-full rounded-lg bg-neutral-100 px-md py-sm text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500';

export function NsiaForms({ lines }: { lines: NsiaLine[] }) {
  return (
    <div className="mt-2xl grid grid-cols-1 gap-xl lg:grid-cols-2">
      <NewLineForm />
      <NewPeriodForm lines={lines} />
    </div>
  );
}

function NewLineForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const label = String(fd.get('label') || '').trim();
    const opened = String(fd.get('opened_on') || '');
    if (!label || !opened) {
      setError("Renseignez l'intitulé et la date d'ouverture.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabaseBrowser.rpc('bo_nsia_create_line', {
      p_label: label,
      p_vehicle_kind: String(fd.get('kind') || 'moto'),
      p_opened_on: opened,
      p_with_plan: fd.get('plan') === 'on',
    });
    if (err) setError(err.message);
    else {
      setOk(`Ligne « ${label} » créée.`);
      form.reset();
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
      <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">Nouvelle ligne NSIA</h2>
      <p className="mt-xs text-[11px] text-neutral-600">
        Une ligne par emplacement de 6 ans souscrit chez NSIA. Moto : conducteurs de 12 mois ; tricycle et voiture : 24 mois.
      </p>
      {error && <p className="mt-md rounded-md bg-error/10 p-md text-sm text-error">{error}</p>}
      {ok && <p className="mt-md rounded-md bg-success/10 p-md text-sm text-success">{ok}</p>}
      <div className="mt-md flex flex-col gap-md">
        <input name="label" required placeholder="Ex. : Ligne 01 — moto" className={inputCls} aria-label="Intitulé" />
        <select name="kind" className={inputCls} aria-label="Type de véhicule" defaultValue="moto">
          {(Object.keys(KIND_LABELS) as NsiaKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <label className="text-xs font-bold text-neutral-600">
          Date d&apos;ouverture de la ligne chez NSIA
          <input type="date" name="opened_on" required className={`${inputCls} mt-xs`} />
        </label>
        <label className="flex items-start gap-sm text-sm text-neutral-700">
          <input type="checkbox" name="plan" defaultChecked className="mt-1" />
          <span>
            Créer le plan type : les trois rachats (mois 24, 48 et 72) et la chaîne de conducteurs « à désigner » sur les 6 ans. Vous renommez et
            ajustez ensuite.
          </span>
        </label>
        <button type="submit" disabled={busy} className="rounded-lg bg-primary-700 px-lg py-md text-sm font-bold text-white hover:bg-primary-800 disabled:opacity-50">
          {busy ? '…' : 'Créer la ligne'}
        </button>
      </div>
    </form>
  );
}

function NewPeriodForm({ lines }: { lines: NsiaLine[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const line = String(fd.get('line') || '');
    const label = String(fd.get('label') || '').trim();
    const start = String(fd.get('starts_on') || '');
    const end = String(fd.get('planned_end_on') || '');
    if (!line || !label || !start || !end) {
      setError('Renseignez la ligne, le nom et les deux dates.');
      return;
    }
    if (end < start) {
      setError('La fin doit être après le début.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabaseBrowser.from('bo_nsia_periods').insert({
      line_id: line,
      kind: String(fd.get('kind') || 'driver'),
      label,
      starts_on: start,
      planned_end_on: end,
    });
    if (err) setError(err.message);
    else {
      setOk('Période ajoutée.');
      form.reset();
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
      <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">Ajouter une période à une ligne</h2>
      <p className="mt-xs text-[11px] text-neutral-600">
        Un conducteur, ou un poste vacant (la cotisation est alors avancée par TamCar). Deux périodes qui se recouvrent sont signalées en rouge.
      </p>
      {error && <p className="mt-md rounded-md bg-error/10 p-md text-sm text-error">{error}</p>}
      {ok && <p className="mt-md rounded-md bg-success/10 p-md text-sm text-success">{ok}</p>}
      <div className="mt-md flex flex-col gap-md">
        <select name="line" required className={inputCls} aria-label="Ligne" defaultValue="">
          <option value="" disabled>
            Choisir la ligne…
          </option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label} ({KIND_LABELS[l.vehicle_kind]})
            </option>
          ))}
        </select>
        <select name="kind" className={inputCls} aria-label="Nature" defaultValue="driver">
          <option value="driver">Conducteur</option>
          <option value="vacancy">Poste vacant</option>
        </select>
        <input name="label" required placeholder="Ex. : Kokou A. — moto RB 1234" className={inputCls} aria-label="Nom" />
        <div className="grid grid-cols-2 gap-md">
          <label className="text-xs font-bold text-neutral-600">
            Début
            <input type="date" name="starts_on" required className={`${inputCls} mt-xs`} />
          </label>
          <label className="text-xs font-bold text-neutral-600">
            Fin prévue
            <input type="date" name="planned_end_on" required className={`${inputCls} mt-xs`} />
          </label>
        </div>
        <button type="submit" disabled={busy || lines.length === 0} className="rounded-lg bg-primary-700 px-lg py-md text-sm font-bold text-white hover:bg-primary-800 disabled:opacity-50">
          {busy ? '…' : 'Ajouter la période'}
        </button>
      </div>
    </form>
  );
}
