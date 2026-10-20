import { ActionForm } from '@/components/ActionForm';
import { updateVehicleSheet } from './actions';

export type VehicleSheet = {
  id: string;
  vin: string | null;
  entry_km: number | null;
  engine: string | null;
  contract_months: number | null;
  insurance_company: string | null;
  insurance_policy: string | null;
  insurance_expires_on: string | null;
  technical_visit_expires_on: string | null;
  tracker_id: string | null;
  papers_deposited_on: string | null;
  papers_receipt: string | null;
  suspension_reason: string | null;
};

const inputCls = 'mt-xs w-full rounded-md border border-neutral-300 bg-white px-sm py-xs text-sm';
const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-neutral-500';

/** Jours restant avant une échéance (négatif = expirée), à la date de Porto-Novo. */
export function daysLeft(iso: string | null, today: string): number | null {
  if (!iso) return null;
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function ExpiryTag({ label, iso, today }: { label: string; iso: string | null; today: string }) {
  const d = daysLeft(iso, today);
  if (d === null) return <span className="rounded-full bg-neutral-100 px-sm py-0.5 text-[10px] font-bold text-neutral-500">{label} : non renseignée</span>;
  const tone = d < 0 ? 'bg-error/15 text-error' : d <= 30 ? 'bg-warning/20 text-warning' : 'bg-primary-100 text-primary-700';
  const when = d < 0 ? `expirée depuis ${-d} j` : d === 0 ? 'expire aujourd’hui' : `dans ${d} j`;
  return <span className={`rounded-full px-sm py-0.5 text-[10px] font-bold ${tone}`}>{label} : {when}</span>;
}

/** Fiche numérique du véhicule (assurance, visite technique, traceur, papiers déposés, durée du contrat). */
export function VehicleSheetForm({ vehicleId, sheet, today }: { vehicleId: string; sheet: VehicleSheet | undefined; today: string }) {
  const s = sheet;
  return (
    <details className="group rounded-lg ring-1 ring-neutral-200">
      <summary className="flex cursor-pointer flex-wrap items-center gap-sm px-md py-sm text-xs font-bold text-neutral-700">
        <span>Fiche du véhicule</span>
        <ExpiryTag label="Assurance" iso={s?.insurance_expires_on ?? null} today={today} />
        <ExpiryTag label="Visite technique" iso={s?.technical_visit_expires_on ?? null} today={today} />
        {s?.suspension_reason && <span className="rounded-full bg-error/15 px-sm py-0.5 text-[10px] font-bold text-error">Suspendu : {s.suspension_reason}</span>}
      </summary>
      <ActionForm action={updateVehicleSheet} className="grid grid-cols-1 gap-md border-t border-neutral-200 p-md md:grid-cols-3">
        <input type="hidden" name="vehicle_id" value={vehicleId} />
        <label className={labelCls}>
          Numéro de châssis
          <input name="vin" defaultValue={s?.vin ?? ''} className={inputCls} />
        </label>
        <label className={labelCls}>
          Kilométrage à l’entrée
          <input name="entry_km" type="number" min={0} step={1} inputMode="numeric" defaultValue={s?.entry_km ?? ''} className={inputCls} />
        </label>
        <label className={labelCls}>
          Motorisation
          <select name="engine" defaultValue={s?.engine ?? ''} className={inputCls}>
            <option value="">Non renseignée</option>
            <option value="essence">Essence</option>
            <option value="diesel">Diesel</option>
            <option value="hybride">Hybride</option>
            <option value="electrique">Électrique</option>
          </select>
        </label>
        <label className={labelCls}>
          Assureur
          <input name="insurance_company" defaultValue={s?.insurance_company ?? ''} className={inputCls} />
        </label>
        <label className={labelCls}>
          N° de police
          <input name="insurance_policy" defaultValue={s?.insurance_policy ?? ''} className={inputCls} />
        </label>
        <label className={labelCls}>
          Assurance valable jusqu’au
          <input name="insurance_expires_on" type="date" defaultValue={s?.insurance_expires_on ?? ''} className={inputCls} />
        </label>
        <label className={labelCls}>
          Visite technique valable jusqu’au
          <input name="technical_visit_expires_on" type="date" defaultValue={s?.technical_visit_expires_on ?? ''} className={inputCls} />
        </label>
        <label className={labelCls}>
          Traceur (identifiant, facultatif)
          <input name="tracker_id" defaultValue={s?.tracker_id ?? ''} className={inputCls} />
        </label>
        <label className={labelCls}>
          Durée du contrat (mois, vide = durée de la catégorie)
          <input name="contract_months" type="number" min={1} max={120} step={1} inputMode="numeric" defaultValue={s?.contract_months ?? ''} className={inputCls} />
        </label>
        <label className={labelCls}>
          Papiers originaux déposés le
          <input name="papers_deposited_on" type="date" defaultValue={s?.papers_deposited_on ?? ''} className={inputCls} />
        </label>
        <label className={`${labelCls} md:col-span-2`}>
          Reçu de dépôt des papiers (référence ou précision)
          <input name="papers_receipt" defaultValue={s?.papers_receipt ?? ''} className={inputCls} />
        </label>
        <div className="md:col-span-3">
          <button type="submit" className="rounded-md bg-neutral-900 px-md py-sm text-sm font-bold text-white hover:bg-neutral-700">
            Enregistrer la fiche
          </button>
          <p className="mt-xs text-[11px] text-neutral-500">
            Une assurance ou une visite technique expirée suspend le véhicule (le chauffeur passe hors ligne, aucune part n’est due) ; il repart
            dès que la nouvelle échéance est saisie. Le partenaire est prévenu 30 et 7 jours avant chaque échéance.
          </p>
        </div>
      </ActionForm>
    </details>
  );
}
