import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { displayBeninPhone } from '@/lib/phone';
import { createServerSupabase } from '@/lib/supabase-server';
import { endCityManagerAction, setCityManagerAction } from './actions';

export const dynamic = 'force-dynamic';

type ManagerRow = {
  id: string;
  profile_id: string;
  full_name: string;
  phone: string | null;
  profile_role: 'client' | 'driver' | 'dealer' | 'admin';
  city: string;
  rate_pct: number;
  monthly_cap_fcfa: number;
  active: boolean;
  started_on: string;
  ended_on: string | null;
  settled_through_month: string | null;
  month_start: string;
  rides_count: number;
  volume_fcfa: number;
  pay_fcfa: number;
  cap_reached: boolean;
};

type CityRow = { city: string; active: boolean };

function fmt(n: number): string {
  return Math.round(Number(n) || 0)
    .toLocaleString('fr-FR')
    .replace(/[  ,]/g, ' ');
}

const ROLE_LABEL: Record<ManagerRow['profile_role'], string> = {
  client: 'Client',
  driver: 'Chauffeur',
  dealer: 'Partenaire véhicule',
  admin: 'Admin',
};

export default async function AdminOpsPage() {
  const supabase = createServerSupabase();

  const [{ data: managersData }, { data: citiesData }] = await Promise.all([
    supabase.rpc('admin_city_managers'),
    supabase.from('ops_cities').select('city, active').order('city'),
  ]);

  const managers = (managersData ?? []) as ManagerRow[];
  const cities = ((citiesData ?? []) as CityRow[]).filter((c) => c.active);

  const active = managers.filter((m) => m.active);
  const past = managers.filter((m) => !m.active);
  const totalPay = active.reduce((s, m) => s + Number(m.pay_fcfa), 0);
  const monthLabel = active[0]?.month_start
    ? new Date(`${active[0].month_start}T00:00:00Z`).toLocaleDateString('fr-FR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : 'ce mois';

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between gap-md">
        <h1 className="text-2xl font-extrabold text-neutral-900">Responsables ville</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-primary-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {active.length}
          </strong>{' '}
          en poste ·{' '}
          <strong className="text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(totalPay)} F
          </strong>{' '}
          à verser ({monthLabel})
        </p>
      </div>

      <p className="mb-lg rounded-md bg-neutral-100 p-md text-xs leading-relaxed text-neutral-600">
        Le responsable opérations perçoit <strong>3 % du volume des courses de sa ville</strong>{' '}
        (prix total des courses terminées partant de la ville), plafonné à{' '}
        <strong>150 000 F par mois</strong>. Le droit d&apos;accès à son espace{' '}
        <code className="rounded bg-white px-xs">/ops</code> vient de cette nomination, pas du rôle
        du compte : un chauffeur peut être responsable. Les montants ci-dessous sont{' '}
        <strong>calculés, pas encore versés</strong> — le règlement se fait hors application.
      </p>

      {/* ---------- Villes ---------- */}
      <section className="mb-2xl space-y-md">
        {cities.map((c) => {
          const m = active.find((a) => a.city === c.city);
          return (
            <div
              key={c.city}
              className="rounded-xl border border-neutral-200 bg-white p-lg shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-md">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                    {c.city}
                  </p>
                  {m ? (
                    <>
                      <p className="mt-xs text-base font-extrabold text-neutral-900">
                        {m.full_name}
                      </p>
                      <p className="text-xs text-neutral-600">
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {m.phone ? displayBeninPhone(m.phone) : '—'}
                        </span>
                        {' · '}
                        {ROLE_LABEL[m.profile_role]}
                        {' · depuis le '}
                        {new Date(`${m.started_on}T00:00:00Z`).toLocaleDateString('fr-FR', {
                          timeZone: 'UTC',
                        })}
                      </p>
                      <p className="mt-xs text-xs text-neutral-600">
                        {Number(m.rate_pct)} % · plafond {fmt(m.monthly_cap_fcfa)} F
                      </p>
                    </>
                  ) : (
                    <p className="mt-xs text-sm font-bold text-warning">Aucun responsable</p>
                  )}
                </div>

                {m && (
                  <div className="flex-none text-right">
                    <p
                      className="text-xl font-extrabold text-neutral-900"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {fmt(m.pay_fcfa)} F
                    </p>
                    <p
                      className="text-[11px] text-neutral-600"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {fmt(m.rides_count)} courses · {fmt(m.volume_fcfa)} F
                    </p>
                    {m.cap_reached && (
                      <p className="text-[11px] font-bold text-gold">Plafond atteint</p>
                    )}
                    <form action={endCityManagerAction} className="mt-sm">
                      <input type="hidden" name="id" value={m.id} />
                      <ConfirmSubmit
                        message={`Mettre fin au mandat de ${m.full_name} sur ${c.city} ?`}
                        className="rounded-lg border border-neutral-200 px-md py-xs text-[11px] font-bold text-neutral-600 transition hover:border-error/40 hover:text-error disabled:opacity-50"
                      >
                        Fin de mandat
                      </ConfirmSubmit>
                    </form>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* ---------- Nommer ---------- */}
      <section className="mb-2xl rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
        <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-600">
          Nommer un responsable
        </h2>
        <form action={setCityManagerAction} className="grid gap-md sm:grid-cols-4">
          <label className="sm:col-span-2 block">
            <span className="mb-xs block text-xs font-semibold text-neutral-600">
              Téléphone du responsable
            </span>
            <input
              name="phone"
              type="tel"
              required
              placeholder="01 67 59 18 17"
              className="w-full rounded-lg border border-neutral-200 px-md py-sm text-sm text-neutral-900 outline-none focus:border-primary-500"
            />
          </label>

          <label className="block">
            <span className="mb-xs block text-xs font-semibold text-neutral-600">Ville</span>
            <select
              name="city"
              required
              defaultValue={cities[0]?.city ?? ''}
              className="w-full rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 outline-none focus:border-primary-500"
            >
              {cities.map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-sm">
            <label className="block">
              <span className="mb-xs block text-xs font-semibold text-neutral-600">Taux %</span>
              <input
                name="rate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                defaultValue="3"
                className="w-full rounded-lg border border-neutral-200 px-md py-sm text-sm text-neutral-900 outline-none focus:border-primary-500"
              />
            </label>
            <label className="block">
              <span className="mb-xs block text-xs font-semibold text-neutral-600">Plafond F</span>
              <input
                name="cap"
                type="number"
                step="1000"
                min="0"
                defaultValue="150000"
                className="w-full rounded-lg border border-neutral-200 px-md py-sm text-sm text-neutral-900 outline-none focus:border-primary-500"
              />
            </label>
          </div>

          <div className="sm:col-span-4">
            <ConfirmSubmit
              message="Confirmer la nomination ? Le responsable actuellement en poste sur cette ville sera automatiquement remplacé."
              className="w-full rounded-lg bg-primary-500 px-lg py-sm text-sm font-bold text-white transition hover:bg-primary-700 disabled:opacity-50 sm:w-auto"
              pendingLabel="Enregistrement…"
            >
              Nommer
            </ConfirmSubmit>
          </div>
        </form>
      </section>

      {/* ---------- Mandats terminés ---------- */}
      {past.length > 0 && (
        <section>
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-600">
            Mandats terminés
          </h2>
          <div className="space-y-sm">
            {past.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-md rounded-xl border border-neutral-200 bg-white p-md text-xs shadow-sm"
              >
                <div>
                  <p className="font-bold text-neutral-900">
                    {m.full_name} <span className="font-normal text-neutral-600">· {m.city}</span>
                  </p>
                  <p className="text-neutral-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {new Date(`${m.started_on}T00:00:00Z`).toLocaleDateString('fr-FR', {
                      timeZone: 'UTC',
                    })}
                    {' → '}
                    {m.ended_on
                      ? new Date(`${m.ended_on}T00:00:00Z`).toLocaleDateString('fr-FR', {
                          timeZone: 'UTC',
                        })
                      : '—'}
                  </p>
                </div>
                <span
                  className="flex-none font-bold text-neutral-900"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {fmt(m.pay_fcfa)} F
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
