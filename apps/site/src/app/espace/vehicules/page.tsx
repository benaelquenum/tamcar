import { createServerSupabase } from '@/lib/supabase-server';
import { LiveAmount } from '../LiveAmount';
import {
  CAT_LABEL,
  ENGINE_LABEL,
  VEHICLE_STATUS_LABEL,
  daysUntil,
  durationLabel,
  fmt,
  frDate,
  previewParam,
  type DealerContractEnd,
  type DealerVehicle,
  type DealerVehicleSheet,
} from '../lib';

/** Étiquette d'échéance : rouge si dépassée, orange à 30 jours ou moins. */
function Expiry({ iso }: { iso: string | null }) {
  const d = daysUntil(iso);
  if (d === null || !iso) return <span className="text-neutral-400">non renseignée</span>;
  const tone = d < 0 ? 'text-error' : d <= 30 ? 'text-warning' : 'text-neutral-900';
  return (
    <span className={`font-semibold ${tone}`}>
      {frDate(iso)}
      <span className="ml-xs font-normal">{d < 0 ? `· expirée depuis ${-d} j` : d === 0 ? '· expire aujourd’hui' : d <= 30 ? `· dans ${d} j` : ''}</span>
    </span>
  );
}

export const dynamic = 'force-dynamic';

export default async function DealerVehiclesPage({
  searchParams,
}: {
  searchParams: { as?: string | string[] };
}) {
  const supabase = createServerSupabase();
  const who = { p_dealer_id: previewParam(searchParams.as) };
  const [{ data }, { data: sheetData }, { data: endData }] = await Promise.all([
    supabase.rpc('dealer_my_vehicles', who),
    supabase.rpc('dealer_my_vehicle_sheets', who),
    supabase.rpc('dealer_my_contract_ends', who),
  ]);
  const list = (data ?? []) as DealerVehicle[];
  const sheets = new Map(((sheetData ?? []) as DealerVehicleSheet[]).map((x) => [x.vehicle_id, x]));
  const ends = new Map(((endData ?? []) as DealerContractEnd[]).map((x) => [x.vehicle_id, x]));

  const monthTotal = list.reduce((s, v) => s + v.month_fcfa, 0);

  return (
    <div>
      <div className="mb-xl flex flex-wrap items-baseline justify-between gap-md">
        <h1 className="text-2xl font-extrabold text-neutral-900">Mes véhicules</h1>
        <p className="text-sm text-neutral-600">
          {list.length} véhicule{list.length > 1 ? 's' : ''} · part du mois :{' '}
          <strong className="text-primary-700">
            <LiveAmount value={monthTotal} />
          </strong>
        </p>
      </div>

      <p className="mb-lg rounded-xl bg-primary-50 p-md text-xs text-primary-800">
        Pour ajouter ou modifier un véhicule, contactez TamCar. L’enregistrement, l’activation et l’affectation à un
        chauffeur sont gérés par l’administrateur.
      </p>

      {list.length === 0 ? (
        <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          Aucun véhicule enregistré.
        </div>
      ) : (
        <ul className="grid gap-md sm:grid-cols-2">
          {list.map((v) => {
            const sheet = sheets.get(v.vehicle_id);
            const end = ends.get(v.vehicle_id);
            return (
            <li key={v.vehicle_id} className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
              <div className="flex items-start justify-between gap-md">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900">
                    {v.brand} {v.model}
                  </p>
                  <p className="text-[11px] text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {v.plate_number} · TamCar {CAT_LABEL[v.category] ?? v.category}
                    {v.color && ` · ${v.color}`}
                    {v.vehicle_year && ` · ${v.vehicle_year}`}
                  </p>
                </div>
                <span
                  className={`flex-none rounded-full px-sm py-0.5 text-[10px] font-bold ${
                    v.status === 'active' ? 'bg-primary-100 text-primary-700' : 'bg-neutral-200 text-neutral-700'
                  }`}
                >
                  {VEHICLE_STATUS_LABEL[v.status]}
                </span>
              </div>

              <dl className="mt-md grid grid-cols-2 gap-sm text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <div>
                  <dt className="text-neutral-500">Chauffeur affecté</dt>
                  <dd className="font-semibold text-neutral-900">
                    {v.driver_name ?? <span className="text-warning">Non affecté</span>}
                    {v.driver_name && (
                      <span className="ml-xs font-normal text-neutral-500">
                        {v.driver_status === 'suspended' ? '· suspendu' : v.driver_online ? '· en ligne' : '· hors ligne'}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Mise en service</dt>
                  <dd className="font-semibold text-neutral-900">
                    {v.activated_at ? new Date(v.activated_at).toLocaleDateString('fr-FR') : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Votre part aujourd’hui</dt>
                  <dd className="font-semibold text-neutral-900">
                    {fmt(v.today_fcfa)} F <span className="font-normal text-neutral-500">· {v.today_rides} course{v.today_rides > 1 ? 's' : ''}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Votre part ce mois</dt>
                  <dd className="font-semibold text-primary-700">
                    {fmt(v.month_fcfa)} F <span className="font-normal text-neutral-500">· {v.month_rides} course{v.month_rides > 1 ? 's' : ''}</span>
                  </dd>
                </div>
              </dl>

              {sheet?.suspension_reason && (
                <p className="mt-md rounded-lg bg-error/10 p-sm text-xs font-semibold text-error">
                  Véhicule suspendu : {sheet.suspension_reason}. Il reste hors service, sans part due, jusqu’à la régularisation des papiers.
                </p>
              )}

              {sheet && (
                <details className="mt-md rounded-lg ring-1 ring-neutral-200">
                  <summary className="cursor-pointer px-md py-sm text-xs font-bold text-neutral-700">Fiche du véhicule</summary>
                  <dl className="grid grid-cols-2 gap-sm border-t border-neutral-200 p-md text-xs">
                    <div>
                      <dt className="text-neutral-500">Assurance{sheet.insurance_company ? ` (${sheet.insurance_company})` : ''}</dt>
                      <dd><Expiry iso={sheet.insurance_expires_on} /></dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Visite technique</dt>
                      <dd><Expiry iso={sheet.technical_visit_expires_on} /></dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Traceur</dt>
                      <dd className="font-semibold text-neutral-900">{sheet.tracker_id ?? 'non installé'}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Motorisation</dt>
                      <dd className="font-semibold text-neutral-900">{sheet.engine ? ENGINE_LABEL[sheet.engine] ?? sheet.engine : '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Papiers originaux déposés</dt>
                      <dd className="font-semibold text-neutral-900">{sheet.papers_deposited_on ? frDate(sheet.papers_deposited_on) : 'pas encore'}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Durée du contrat</dt>
                      <dd className="font-semibold text-neutral-900">{durationLabel(sheet.contract_months)}</dd>
                    </div>
                    {end?.end_on && (
                      <div className="col-span-2">
                        <dt className="text-neutral-500">Fin de la Durée</dt>
                        <dd className="font-semibold text-neutral-900">
                          {frDate(end.end_on)}
                          {end.notified_on && <span className="ml-xs font-normal text-neutral-500">· avis écrit envoyé le {frDate(end.notified_on)}</span>}
                        </dd>
                      </div>
                    )}
                  </dl>
                </details>
              )}
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
