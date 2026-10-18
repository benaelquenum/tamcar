import { ActionForm } from '@/components/ActionForm';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { cancelOfflinePayment, declareOfflinePayment, excuseDays, removeExcusedDay, setCessionStart } from './contractActions';

export type ContractInfo = {
  application_type: string;
  category: string | null;
  versement_fcfa: number;
  target_fcfa?: number;
  cotisation_fcfa?: number;
  start_on: string | null;
  manual_start: boolean;
  months: number;
  extension_days: number;
  end_on: string | null;
  days: Array<{ id: string; day: string; reason: string; note: string | null; closed: boolean }>;
};

export type OfflinePayment = {
  id: string;
  day: string;
  amount_fcfa: number;
  method: string;
  operator: string | null;
  note: string | null;
  created_at: string;
  created_by_name: string | null;
  day_status: string | null;
  day_saved_fcfa: number | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  entry_no: string | null;
};

const REASON_LABEL: Record<string, string> = { panne: 'Panne', maladie: 'Maladie', autre: 'Autre' };
const OPERATOR_LABEL: Record<string, string> = { mtn: 'MTN', moov: 'Moov', celtiis: 'Celtiis' };
const methodLabel = (o: OfflinePayment) =>
  o.method === 'cash' ? 'Espèces' : `Mobile Money${o.operator ? ` ${OPERATOR_LABEL[o.operator] ?? o.operator}` : ''}`;

const fmt = (n: number) => n.toLocaleString('fr-FR');
const frDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', {
    timeZone: 'Africa/Porto-Novo',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
const duration = (months: number) =>
  months % 12 === 0 ? `${months / 12} an${months / 12 > 1 ? 's' : ''}` : `${months} mois`;

const inputCls = 'rounded-md border border-neutral-300 px-sm py-sm text-sm';

export function ContractCard({
  driverId,
  info,
  offline = [],
  today,
}: {
  driverId: string;
  info: ContractInfo;
  offline?: OfflinePayment[];
  today: string;
}) {
  if (info.application_type !== 'cession') {
    return (
      <section className="mt-lg rounded-2xl bg-white p-lg text-sm text-neutral-600 shadow-sm ring-1 ring-neutral-200">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">Contrat de cession</h2>
        <p className="mt-sm">Formule Propriétaire : pas de versement quotidien ni de contrat de cession.</p>
      </section>
    );
  }

  return (
    <section className="mt-lg rounded-2xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
      <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">Contrat de cession et versement</h2>

      <div className="mt-md grid grid-cols-2 gap-md md:grid-cols-4">
        <div className="rounded-xl bg-neutral-100 p-md">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Versement par jour</p>
          <p className="mt-xs text-lg font-extrabold text-neutral-900">{fmt(info.versement_fcfa)} F</p>
          <p className="text-[11px] text-neutral-500">
            {info.target_fcfa
              ? `objectif ${fmt(info.target_fcfa)} F avec la cotisation de ${fmt(info.cotisation_fcfa ?? 0)} F`
              : 'part de TamCar, lundi au samedi'}
          </p>
        </div>
        <div className="rounded-xl bg-neutral-100 p-md">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Début</p>
          <p className="mt-xs text-lg font-extrabold text-neutral-900">{info.start_on ? frDate(info.start_on) : '—'}</p>
          <p className="text-[11px] text-neutral-500">
            {info.start_on ? (info.manual_start ? 'saisi à la main' : '1er prélèvement TamAssur') : 'à renseigner'}
          </p>
        </div>
        <div className="rounded-xl bg-neutral-100 p-md">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Jours non travaillés</p>
          <p className="mt-xs text-lg font-extrabold text-neutral-900">{info.extension_days}</p>
          <p className="text-[11px] text-neutral-500">contrat prolongé d&apos;autant</p>
        </div>
        <div className="rounded-xl bg-neutral-100 p-md">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Fin prévue</p>
          <p className="mt-xs text-lg font-extrabold text-neutral-900">{info.end_on ? frDate(info.end_on) : '—'}</p>
          <p className="text-[11px] text-neutral-500">durée {duration(info.months)} + jours non travaillés</p>
        </div>
      </div>

      <ActionForm action={setCessionStart} className="mt-md flex flex-wrap items-center gap-sm">
        <input type="hidden" name="driver_id" value={driverId} />
        <label className="text-xs font-bold text-neutral-600">
          Début de la cession (remise du véhicule)
          <input type="date" name="start_on" defaultValue={info.manual_start ? info.start_on ?? '' : ''} className={`${inputCls} ml-sm`} />
        </label>
        <button type="submit" className="rounded-md bg-neutral-900 px-md py-sm text-sm font-bold text-white hover:bg-neutral-700">
          Enregistrer
        </button>
      </ActionForm>

      <h3 className="mt-lg text-xs font-bold uppercase tracking-wider text-neutral-500">
        Déclarer un versement hors application
      </h3>
      <p className="mt-xs text-[12px] text-neutral-600">
        Le chauffeur a fait des courses hors application et a remis l&apos;argent à TamCar (espèces ou Mobile Money) : le
        montant reçu s&apos;ajoute à la part de TamCar du jour. Si l&apos;objectif
        {info.target_fcfa ? ` de ${fmt(info.target_fcfa)} F` : ''} est atteint, il n&apos;y a plus de manque à prélever (un manque
        déjà prélevé est remboursé) et son tableau de bord se met à jour tout seul. L&apos;encaissement est passé dans TamCar
        Office (caisse ou compte Mobile Money, produit en commissions sur courses).
      </p>
      <ActionForm action={declareOfflinePayment} className="mt-sm flex flex-wrap items-end gap-sm">
        <input type="hidden" name="driver_id" value={driverId} />
        <label className="text-xs font-bold text-neutral-600">
          Jour concerné
          <input type="date" name="day" required defaultValue={today} max={today} className={`${inputCls} mt-xs block`} />
        </label>
        <label className="text-xs font-bold text-neutral-600">
          Montant reçu (F)
          <input type="number" name="amount" required min={1} step={1} inputMode="numeric" className={`${inputCls} mt-xs block w-32`} />
        </label>
        <label className="text-xs font-bold text-neutral-600">
          Reçu en
          <select name="how" defaultValue="cash" className={`${inputCls} mt-xs block`}>
            <option value="cash">Espèces</option>
            <option value="mtn">Mobile Money MTN</option>
            <option value="moov">Mobile Money Moov</option>
            <option value="celtiis">Mobile Money Celtiis</option>
          </select>
        </label>
        <input name="note" placeholder="Référence ou précision (facultatif)" className={`${inputCls} min-w-0 flex-1`} aria-label="Précision" />
        <button type="submit" className="rounded-md bg-primary-700 px-md py-sm text-sm font-bold text-white hover:bg-primary-800">
          Enregistrer le versement
        </button>
      </ActionForm>

      {offline.length > 0 && (
        <ul className="mt-md divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200">
          {offline.map((o) => (
            <li key={o.id} className={`flex flex-wrap items-center gap-sm px-md py-sm text-sm ${o.cancelled_at ? 'bg-neutral-50' : ''}`}>
              <span className={`font-semibold ${o.cancelled_at ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{frDate(o.day)}</span>
              <span className={`font-bold ${o.cancelled_at ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{fmt(o.amount_fcfa)} F</span>
              <span className="rounded-full bg-neutral-100 px-sm py-0.5 text-[11px] font-bold text-neutral-700">{methodLabel(o)}</span>
              {o.cancelled_at ? (
                <span className="rounded-full bg-warning/15 px-sm py-0.5 text-[11px] font-bold text-warning">
                  annulé le {frDate(o.cancelled_at)}
                  {o.cancel_reason ? ` : ${o.cancel_reason}` : ''}
                </span>
              ) : o.day_saved_fcfa ? (
                <span className="rounded-full bg-success/15 px-sm py-0.5 text-[11px] font-bold text-success">
                  épargne du jour +{fmt(o.day_saved_fcfa)} F
                </span>
              ) : (
                <span className="rounded-full bg-neutral-100 px-sm py-0.5 text-[11px] font-bold text-neutral-500">
                  objectif non atteint
                </span>
              )}
              {o.note ? <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{o.note}</span> : <span className="flex-1" />}
              {o.entry_no && <span className="font-mono text-[11px] text-neutral-400">{o.entry_no}</span>}
              <span className="text-[11px] text-neutral-500">{o.created_by_name ?? 'admin'}</span>
              {!o.cancelled_at && (
                <ActionForm action={cancelOfflinePayment} className="flex flex-wrap items-center gap-xs">
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="driver_id" value={driverId} />
                  <input name="reason" placeholder="Motif" className={`${inputCls} w-32 py-xs text-xs`} aria-label="Motif de l’annulation" />
                  <ConfirmSubmit
                    message={`Annuler le versement de ${fmt(o.amount_fcfa)} F du ${frDate(o.day)} ? La part du jour sera recalculée et l’écriture comptable extournée.`}
                    className="text-xs font-bold text-error hover:underline"
                    pendingLabel="Annulation…"
                  >
                    Annuler
                  </ConfirmSubmit>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-lg text-xs font-bold uppercase tracking-wider text-neutral-500">Déclarer des jours non travaillés</h3>
      <p className="mt-xs text-[12px] text-neutral-600">
        Panne ou maladie : rien n&apos;est prélevé ces jours-là (ni versement ni TamAssur), un jour déjà prélevé est remboursé,
        et le contrat est prolongé d&apos;autant. Les dimanches sont ignorés.
      </p>
      <ActionForm action={excuseDays} className="mt-sm flex flex-wrap items-end gap-sm">
        <input type="hidden" name="driver_id" value={driverId} />
        <label className="text-xs font-bold text-neutral-600">
          Du
          <input type="date" name="from" required className={`${inputCls} mt-xs block`} />
        </label>
        <label className="text-xs font-bold text-neutral-600">
          Au (facultatif)
          <input type="date" name="to" className={`${inputCls} mt-xs block`} />
        </label>
        <label className="text-xs font-bold text-neutral-600">
          Motif
          <select name="reason" defaultValue="panne" className={`${inputCls} mt-xs block`}>
            <option value="panne">Panne du véhicule</option>
            <option value="maladie">Maladie</option>
            <option value="autre">Autre</option>
          </select>
        </label>
        <input name="note" placeholder="Précision (facultatif)" className={`${inputCls} min-w-0 flex-1`} aria-label="Précision" />
        <button type="submit" className="rounded-md bg-primary-700 px-md py-sm text-sm font-bold text-white hover:bg-primary-800">
          Enregistrer les jours
        </button>
      </ActionForm>

      {info.days.length > 0 && (
        <ul className="mt-md divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200">
          {info.days.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-sm px-md py-sm text-sm">
              <span className="font-semibold text-neutral-900">{frDate(d.day)}</span>
              <span className="rounded-full bg-neutral-100 px-sm py-0.5 text-[11px] font-bold text-neutral-700">
                {REASON_LABEL[d.reason] ?? d.reason}
              </span>
              {d.note && <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{d.note}</span>}
              {!d.note && <span className="flex-1" />}
              {d.closed ? (
                <span className="text-[11px] text-neutral-500">jour clôturé</span>
              ) : (
                <ActionForm action={removeExcusedDay} className="inline">
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="driver_id" value={driverId} />
                  <button type="submit" className="text-xs font-bold text-error hover:underline">
                    Retirer
                  </button>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
