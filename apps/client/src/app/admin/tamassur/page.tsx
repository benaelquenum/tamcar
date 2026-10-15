import { createServerSupabase } from '@/lib/supabase-server';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { markTamassurPaid } from './actions';

type Row = {
  id: string;
  driver_id: string;
  full_name: string;
  phone: string | null;
  amount_fcfa: number;
  status: 'pending' | 'paid' | 'rejected';
  requested_at: string;
  due_at: string;
  paid_at: string | null;
  method: string | null;
};

type DriverOpt = { driver_id: string; full_name: string | null; phone: string | null; category: string | null; start_date: string | null; cotisations_fcfa: number };

type Calc = {
  driver_id: string;
  full_name: string | null;
  phone: string | null;
  category: string | null;
  start_date: string | null;
  event_date: string;
  months_elapsed: number;
  days_paid: number;
  cotisations_fcfa: number;
  epargne_constituee_fcfa: number;
  threshold_months: number;
  pct: number;
  benefit_fcfa: number;
  epargne_now_fcfa: number;
  guarantee_at_term_fcfa: number;
  term_months: number;
  debt_fcfa: number;
};

const CAT: Record<string, string> = { moto: 'Moto', tricycle: 'Tricycle', essentiel: 'Essentiel', confort: 'Confort', premium: 'VIP' };

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function dateFr(iso: string | null): string {
  return iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo', day: 'numeric', month: 'long', year: 'numeric' }) : '—';
}

function daysLeft(due: string): number {
  return Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000);
}

export default async function AdminTamassurPage({ searchParams }: { searchParams: { chauffeur?: string; date?: string } }) {
  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('admin_tamassur_withdrawals');
  const rows = (data ?? []) as Row[];
  const { data: driversData } = await supabase.rpc('admin_tamassur_drivers');
  const drivers = (driversData ?? []) as DriverOpt[];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Porto-Novo' });
  const chosen = /^[0-9a-f-]{36}$/i.test(searchParams.chauffeur ?? '') ? (searchParams.chauffeur as string) : '';
  const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '') ? (searchParams.date as string) : today;
  let calc: Calc | null = null;
  let calcError = '';
  if (chosen) {
    const { data: cd, error: ce } = await supabase.rpc('admin_tamassur_death_calc', { p_driver_id: chosen, p_event_date: eventDate });
    if (ce) calcError = ce.message;
    else calc = ((cd ?? []) as Calc[])[0] ?? null;
  }
  const pending = rows.filter((r) => r.status === 'pending');
  const done = rows.filter((r) => r.status !== 'pending');
  const pendingTotal = pending.reduce((s, r) => s + r.amount_fcfa, 0);

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Retraits épargne TamAssur</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-warning" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {pending.length}
          </strong>{' '}
          en attente ·{' '}
          <strong className="text-error" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(pendingTotal)} F
          </strong>{' '}
          à payer
        </p>
      </div>

      <p className="mb-lg rounded-md bg-neutral-100 p-md text-xs text-neutral-600">
        Le montant est déjà réservé (débité de la poche Épargne du chauffeur). <strong>Rien n&apos;est viré
        automatiquement</strong> : réglez en espèces ou par Mobile Money <strong>sous 60 jours au plus</strong> à
        compter de la demande, puis marquez-la comme payée (le chauffeur est prévenu). Le chauffeur n&apos;a pu
        faire sa demande qu&apos;après la durée de son véhicule (12 mois moto, 24 mois tricycle et voiture), épargne garantie atteinte
        (250 000 F par année : 250 000 F moto, 500 000 F tricycle et voiture) et compte à jour.
      </p>

      {pending.length > 0 && (
        <section className="mb-2xl">
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
            À régler
          </h2>
          <div className="space-y-sm">
            {pending.map((r) => {
              const dl = daysLeft(r.due_at);
              return (
                <div key={r.id} className="rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
                  <div className="mb-md flex items-start justify-between gap-md">
                    <div>
                      <p className="text-sm font-bold text-neutral-900">{r.full_name}</p>
                      <p className="text-xs text-neutral-600">
                        {r.phone ? (
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.phone}</span>
                        ) : (
                          '—'
                        )}
                        {' · demandé le '}
                        {new Date(r.requested_at).toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo' })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className="whitespace-nowrap text-lg font-extrabold text-neutral-900"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {fmt(r.amount_fcfa)} F
                      </p>
                      <p className={`text-[11px] font-bold ${dl < 0 ? 'text-error' : dl <= 15 ? 'text-warning' : 'text-neutral-500'}`}>
                        {dl < 0 ? `En retard de ${-dl} j` : `${dl} j restants`}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-md">
                    <form action={markTamassurPaid}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="method" value="cash" />
                      <ConfirmSubmit
                        message={`Confirmer le paiement de ${fmt(r.amount_fcfa)} F en espèces à ${r.full_name} ?`}
                        className="w-full rounded-md bg-success py-sm text-sm font-bold text-white hover:brightness-110"
                      >
                        Payé en espèces
                      </ConfirmSubmit>
                    </form>
                    <form action={markTamassurPaid}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="method" value="mobile_money" />
                      <ConfirmSubmit
                        message={`Confirmer le paiement de ${fmt(r.amount_fcfa)} F par Mobile Money à ${r.full_name} ?`}
                        className="w-full rounded-md bg-primary-500 py-sm text-sm font-bold text-white hover:brightness-110"
                      >
                        Payé par Mobile Money
                      </ConfirmSubmit>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
            Historique
          </h2>
          <div className="space-y-sm">
            {done.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-md text-sm shadow-sm"
              >
                <div>
                  <p className="font-semibold text-neutral-900">{r.full_name}</p>
                  <p className="text-xs text-neutral-500">
                    {r.status === 'paid'
                      ? `Payé le ${r.paid_at ? new Date(r.paid_at).toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo' }) : '—'} · ${r.method === 'mobile_money' ? 'Mobile Money' : 'Espèces'}`
                      : 'Rejeté'}
                  </p>
                </div>
                <p className="font-bold text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(r.amount_fcfa)} F
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {rows.length === 0 && (
        <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          Aucune demande de retrait épargne pour l&apos;instant.
        </div>
      )}

      <section id="calculateur" className="mt-2xl">
        <h2 className="mb-xs text-lg font-extrabold text-neutral-900">Calculateur décès ou invalidité</h2>
        <p className="mb-md rounded-md bg-neutral-100 p-md text-xs text-neutral-700">
          En cas de décès ou d&apos;invalidité liés à la conduite, TamCar restitue une part des <strong>cotisations réellement prélevées</strong> jusqu&apos;à la date de l&apos;événement :{' '}
          <strong>la moitié</strong> si le chauffeur a cotisé moins de 12 mois, <strong>la totalité</strong> à partir de 12 mois. Les jours non prélevés (dimanches, jours non
          travaillés) ne comptent pas. Les dettes éventuelles ne sont pas déduites. Les taux et la durée se règlent dans Bonus chauffeur, groupe « TamAssur ».
        </p>
        <form method="get" action="/admin/tamassur" className="flex flex-wrap items-end gap-md rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
          <label className="flex min-w-[240px] flex-1 flex-col gap-xs text-xs font-bold text-neutral-600">
            Chauffeur
            <select name="chauffeur" defaultValue={chosen} className="rounded-md border border-neutral-200 px-sm py-sm text-sm font-normal text-neutral-900">
              <option value="">Choisir un chauffeur…</option>
              {drivers.map((d) => (
                <option key={d.driver_id} value={d.driver_id}>
                  {(d.full_name || 'Sans nom') + (d.category ? ` · ${CAT[d.category] ?? d.category}` : '') + (d.start_date ? ` · cotise depuis le ${dateFr(d.start_date)}` : ' · aucune cotisation')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-xs text-xs font-bold text-neutral-600">
            Date de l&apos;événement
            <input type="date" name="date" defaultValue={eventDate} className="rounded-md border border-neutral-200 px-sm py-sm text-sm font-normal text-neutral-900" />
          </label>
          <button type="submit" className="rounded-md bg-primary-500 px-lg py-sm text-sm font-bold text-white hover:brightness-110">
            Calculer
          </button>
        </form>

        {calcError && <p className="mt-md rounded-md bg-error/10 p-md text-sm font-semibold text-error">{calcError}</p>}

        {calc && (
          <div className="mt-md rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
            <div className="mb-md flex flex-wrap items-start justify-between gap-md">
              <div>
                <p className="text-sm font-bold text-neutral-900">{calc.full_name || 'Chauffeur'}</p>
                <p className="text-xs text-neutral-600">
                  {calc.category ? (CAT[calc.category] ?? calc.category) : 'Véhicule non renseigné'}
                  {calc.phone ? ` · ${calc.phone}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">À restituer</p>
                <p className="text-2xl font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(calc.benefit_fcfa)} F
                </p>
              </div>
            </div>
            <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <tbody>
                {(
                  [
                    ['Début des cotisations', calc.start_date ? dateFr(calc.start_date) : 'aucune cotisation prélevée'],
                    ['Date de l’événement', dateFr(calc.event_date)],
                    ['Durée de cotisation', `${calc.months_elapsed} mois`],
                    ['Jours de cotisation réellement prélevés', `${calc.days_paid} jours`],
                    ['Cotisations réellement prélevées', `${fmt(calc.cotisations_fcfa)} F`],
                    [
                      'Taux appliqué',
                      `${calc.pct} % (${calc.months_elapsed < calc.threshold_months ? `moins de ${calc.threshold_months} mois de cotisation` : `${calc.threshold_months} mois de cotisation ou plus`})`,
                    ],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <tr key={k} className="border-t border-neutral-100">
                    <td className="py-xs pr-md text-neutral-600">{k}</td>
                    <td className="py-xs text-right font-semibold text-neutral-900">{v}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-neutral-200">
                  <td className="py-sm pr-md font-bold text-neutral-900">Montant à restituer</td>
                  <td className="py-sm text-right text-base font-extrabold text-neutral-900">{fmt(calc.benefit_fcfa)} F</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-md text-[11px] font-bold uppercase tracking-wider text-neutral-500">Pour information</p>
            <ul className="mt-xs space-y-xs text-xs text-neutral-700">
              <li>
                Épargne constituée à cette date : <strong>{fmt(calc.epargne_constituee_fcfa)} F</strong> (part épargnée des cotisations, restituée en cas de départ avant l’échéance).
              </li>
              <li>
                Solde actuel de la poche Épargne : <strong>{fmt(calc.epargne_now_fcfa)} F</strong> · garantie à l’échéance ({calc.term_months} mois) :{' '}
                <strong>{fmt(calc.guarantee_at_term_fcfa)} F</strong>.
              </li>
              {calc.debt_fcfa > 0 && (
                <li className="text-warning">
                  Dette actuelle du chauffeur : <strong>{fmt(calc.debt_fcfa)} F</strong> (non déduite en cas de décès ou d’invalidité).
                </li>
              )}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
