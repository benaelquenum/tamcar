import { createServerSupabase } from '@/lib/supabase-server';
import { createPromoCode, togglePromoCode } from './actions';

type PromoRow = {
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_uses_total: number | null;
  max_uses_per_user: number;
  valid_from: string;
  valid_until: string | null;
  active: boolean;
  description: string | null;
  created_at: string;
};

type Usage = {
  code: string;
  n: number;
  total_discount: number;
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function AdminPromosPage() {
  const supabase = createServerSupabase();
  const [{ data: promosData }, { data: usageData }] = await Promise.all([
    supabase.from('promo_codes').select('*').order('created_at', { ascending: false }),
    supabase
      .from('promo_code_redemptions')
      .select('code, discount_applied_fcfa'),
  ]);

  const promos = (promosData ?? []) as PromoRow[];
  const usage: Record<string, Usage> = {};
  for (const row of (usageData ?? []) as Array<{ code: string; discount_applied_fcfa: number }>) {
    if (!usage[row.code]) usage[row.code] = { code: row.code, n: 0, total_discount: 0 };
    usage[row.code].n += 1;
    usage[row.code].total_discount += row.discount_applied_fcfa;
  }

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Codes promo</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-neutral-900">{promos.filter((p) => p.active).length}</strong> actifs ·{' '}
          <strong className="text-neutral-500">{promos.length}</strong> au total
        </p>
      </div>

      <section className="mb-2xl rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <h2 className="mb-md text-lg font-bold text-neutral-900">Créer un code</h2>
        <form action={createPromoCode} className="grid grid-cols-1 gap-md md:grid-cols-2">
          <Field label="Code" name="code" required placeholder="LANCEMENT" />
          <div className="grid grid-cols-2 gap-sm">
            <Field label="Type" name="discount_type" required as="select" options={[
              { v: 'percent', l: '% réduction' },
              { v: 'fixed', l: 'F fixe' },
            ]} />
            <Field label="Valeur" name="discount_value" required type="number" placeholder="20" />
          </div>
          <Field label="Limite totale (vide = illimité)" name="max_uses_total" type="number" placeholder="1000" />
          <Field label="Limite par user" name="max_uses_per_user" type="number" defaultValue="1" required />
          <Field label="Valide jusqu'à (optionnel)" name="valid_until" type="date" />
          <Field label="Description (interne)" name="description" placeholder="Campagne lancement août" />
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-primary-500 px-lg py-sm text-sm font-bold text-white shadow-sm hover:brightness-110"
            >
              Créer le code
            </button>
          </div>
        </form>
      </section>

      {promos.length === 0 ? (
        <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          Aucun code promo créé.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full">
            <thead className="border-b border-neutral-200 bg-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-600">
              <tr>
                <th className="px-md py-sm">Code</th>
                <th className="px-md py-sm">Réduction</th>
                <th className="px-md py-sm">Limites</th>
                <th className="px-md py-sm">Validité</th>
                <th className="px-md py-sm text-right">Utilisations</th>
                <th className="px-md py-sm text-right">Coût cumulé</th>
                <th className="px-md py-sm text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => {
                const u = usage[p.code] ?? { n: 0, total_discount: 0 };
                return (
                  <tr key={p.code} className="border-b border-neutral-100 last:border-0">
                    <td className="px-md py-md">
                      <p className="font-mono text-sm font-bold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {p.code}
                      </p>
                      {p.description && <p className="text-[10px] text-neutral-500">{p.description}</p>}
                      {!p.active && (
                        <span className="mt-xs inline-block rounded-full bg-neutral-200 px-sm py-0.5 text-[10px] font-bold text-neutral-600">
                          Désactivé
                        </span>
                      )}
                    </td>
                    <td className="px-md py-md text-sm text-neutral-900">
                      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {p.discount_value}
                      </strong>
                      {p.discount_type === 'percent' ? ' %' : ' F'}
                    </td>
                    <td className="px-md py-md text-xs text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {p.max_uses_total ? `${p.max_uses_total} au total` : 'Illimité'}
                      <br />
                      {p.max_uses_per_user}× par user
                    </td>
                    <td className="px-md py-md text-xs text-neutral-700">
                      Depuis {fmtDate(p.valid_from)}
                      {p.valid_until && <><br />Jusqu&apos;au {fmtDate(p.valid_until)}</>}
                    </td>
                    <td className="px-md py-md text-right text-sm font-bold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {u.n}
                      {p.max_uses_total && (
                        <p className="text-[10px] font-normal text-neutral-500">
                          / {p.max_uses_total}
                        </p>
                      )}
                    </td>
                    <td className="px-md py-md text-right text-sm text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(u.total_discount)} F
                    </td>
                    <td className="px-md py-md text-right">
                      <form action={togglePromoCode} className="inline">
                        <input type="hidden" name="code" value={p.code} />
                        <input type="hidden" name="active" value={p.active ? 'false' : 'true'} />
                        <button
                          type="submit"
                          className={`rounded-md px-md py-xs text-xs font-bold ${
                            p.active
                              ? 'bg-warning/10 text-warning hover:bg-warning/20'
                              : 'bg-primary-500 text-white hover:brightness-110'
                          }`}
                        >
                          {p.active ? 'Désactiver' : 'Réactiver'}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({
  label, name, type = 'text', required, defaultValue, placeholder, as, options,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  as?: 'input' | 'select';
  options?: { v: string; l: string }[];
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</span>
      {as === 'select' ? (
        <select
          name={name}
          required={required}
          defaultValue={defaultValue}
          className="mt-xs w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {options?.map((o) => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          name={name}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="mt-xs w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      )}
    </label>
  );
}
