import { createServerSupabase } from '@/lib/supabase-server';
import { formatFcfa } from '@/lib/bo';
import { AlertIcon, CheckIcon } from '@/components/Icon';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

type FsLine = {
  ref: string;
  label: string;
  sort: number;
  level: number;
  is_total: boolean;
  sign: number;
  brut: number;
  amort: number;
  net: number;
  prev_net: number;
  note_no: string | null;
};

type CfLine = {
  ref: string;
  label: string;
  sort: number;
  is_total: boolean;
  amount: number;
};

type FsCheck = {
  label: string;
  left_value: number;
  right_value: number;
  ok: boolean;
};

type SearchParams = { du?: string; au?: string };

function money(n: number): string {
  if (n === 0) return '—';
  return formatFcfa(n);
}

export default async function EtatsFinanciersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createServerSupabase();

  const today = new Date().toISOString().slice(0, 10);
  const au = searchParams.au || today;
  const du = searchParams.du || `${au.slice(0, 4)}-01-01`;
  const year = Number(au.slice(0, 4));
  const prevDu = `${year - 1}-01-01`;
  const prevAu = `${year - 1}-12-31`;

  const [actifRes, passifRes, resultatRes, cfRes, checksRes] = await Promise.all([
    supabase.rpc('bo_financial_statement', {
      p_statement: 'actif',
      p_to: au,
      p_prev_to: prevAu,
    }),
    supabase.rpc('bo_financial_statement', {
      p_statement: 'passif',
      p_to: au,
      p_prev_to: prevAu,
    }),
    supabase.rpc('bo_financial_statement', {
      p_statement: 'resultat',
      p_to: au,
      p_from: du,
      p_prev_to: prevAu,
      p_prev_from: prevDu,
    }),
    supabase.rpc('bo_cash_flow', { p_from: du, p_to: au }),
    supabase.rpc('bo_fs_checks', { p_to: au, p_from: du }),
  ]);

  const actif = (actifRes.data ?? []) as FsLine[];
  const passif = (passifRes.data ?? []) as FsLine[];
  const resultat = (resultatRes.data ?? []) as FsLine[];
  const flux = (cfRes.data ?? []) as CfLine[];
  const checks = (checksRes.data ?? []) as FsCheck[];

  const error =
    actifRes.error?.message ??
    passifRes.error?.message ??
    resultatRes.error?.message ??
    cfRes.error?.message ??
    checksRes.error?.message ??
    null;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

  return (
    <div className="pb-2xl">
      <div className="flex flex-wrap items-end justify-between gap-md print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900">
            États financiers
          </h1>
          <p className="mt-xs text-sm text-neutral-600">
            Bilan, compte de résultat et tableau des flux de trésorerie, au
            format de la liasse SYSCOHADA — Système Normal.
          </p>
        </div>
        <div className="flex items-end gap-sm">
          <form method="get" className="flex items-end gap-sm">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Exercice du
              </label>
              <input
                type="date"
                name="du"
                defaultValue={du}
                className="block rounded-lg bg-white px-md py-sm text-sm ring-1 ring-neutral-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Au
              </label>
              <input
                type="date"
                name="au"
                defaultValue={au}
                className="block rounded-lg bg-white px-md py-sm text-sm ring-1 ring-neutral-200"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white"
            >
              Générer
            </button>
          </form>
          <PrintButton />
        </div>
      </div>

      <p className="mt-lg hidden text-sm font-bold print:block">
        TamCar SARL — États financiers de l&apos;exercice du {fmtDate(du)} au{' '}
        {fmtDate(au)}
      </p>

      {error && (
        <div className="mt-lg rounded-md bg-error/10 p-md text-sm text-error">
          {error} — la migration des états financiers a-t-elle été exécutée ?
        </div>
      )}

      {/* Contrôles */}
      {checks.length > 0 && (
        <div className="mt-lg grid grid-cols-1 gap-md sm:grid-cols-3">
          {checks.map((c) => (
            <div
              key={c.label}
              className={`rounded-xl p-md ring-1 ${
                c.ok
                  ? 'bg-success/5 ring-success/20'
                  : 'bg-error/5 ring-error/20'
              }`}
            >
              <div
                className={`flex items-center gap-sm ${c.ok ? 'text-success' : 'text-error'}`}
              >
                {c.ok ? (
                  <CheckIcon className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertIcon className="h-4 w-4 shrink-0" />
                )}
                <p className="text-xs font-bold">{c.label}</p>
              </div>
              {!c.ok && (
                <p className="mt-xs text-xs text-neutral-600">
                  {formatFcfa(c.left_value)} contre {formatFcfa(c.right_value)} —
                  écart de {formatFcfa(Math.abs(c.left_value - c.right_value))} F
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Statement
        title="Bilan — Actif"
        subtitle={`Au ${fmtDate(au)}`}
        lines={actif}
        columns="actif"
        prevLabel={`Net au 31/12/${year - 1}`}
      />
      <Statement
        title="Bilan — Passif"
        subtitle={`Au ${fmtDate(au)}`}
        lines={passif}
        columns="simple"
        prevLabel={`Net au 31/12/${year - 1}`}
      />
      <Statement
        title="Compte de résultat"
        subtitle={`Du ${fmtDate(du)} au ${fmtDate(au)}`}
        lines={resultat}
        columns="resultat"
        prevLabel={`Exercice ${year - 1}`}
      />

      {/* Tableau des flux */}
      <section className="mt-xl break-inside-avoid">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-primary-700">
          Tableau des flux de trésorerie
        </h2>
        <p className="text-xs text-neutral-500">
          Du {fmtDate(du)} au {fmtDate(au)} — méthode de la capacité
          d&apos;autofinancement globale
        </p>
        <div className="mt-sm overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-neutral-100">
              {flux.map((l) => (
                <tr key={l.ref} className={l.is_total ? 'bg-neutral-50' : ''}>
                  <td className="w-12 px-lg py-sm font-mono text-xs text-neutral-400">
                    {l.ref}
                  </td>
                  <td
                    className={`px-lg py-sm ${l.is_total ? 'font-extrabold text-neutral-900' : 'text-neutral-700'}`}
                  >
                    {l.label}
                  </td>
                  <td
                    className={`w-40 px-lg py-sm text-right tabular-nums ${
                      l.is_total ? 'font-extrabold' : 'font-semibold'
                    } ${l.amount < 0 ? 'text-error' : 'text-neutral-900'}`}
                  >
                    {money(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-xl rounded-xl bg-info/5 p-lg text-sm leading-relaxed text-neutral-700 ring-1 ring-info/20 print:hidden">
        <p className="font-extrabold text-info">Avant tout dépôt à la DGI</p>
        <p className="mt-xs">
          Ces états sont générés automatiquement depuis vos écritures. Ils
          doivent être <strong>revus et visés par un expert-comptable inscrit
          à l&apos;ONECCA</strong>, qui produira également les 36 notes
          annexées — celles-ci ne sont pas générées ici. Vérifiez d&apos;abord
          que les trois contrôles ci-dessus sont au vert : un déséquilibre
          signale une écriture à reprendre, pas une erreur de présentation.
        </p>
      </div>
    </div>
  );
}

function Statement({
  title,
  subtitle,
  lines,
  columns,
  prevLabel,
}: {
  title: string;
  subtitle: string;
  lines: FsLine[];
  columns: 'actif' | 'simple' | 'resultat';
  prevLabel: string;
}) {
  if (lines.length === 0) return null;

  return (
    <section className="mt-xl">
      <h2 className="text-sm font-extrabold uppercase tracking-wider text-primary-700">
        {title}
      </h2>
      <p className="text-xs text-neutral-500">{subtitle}</p>

      <div className="mt-sm overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-lg py-sm font-bold">Réf.</th>
              <th className="px-lg py-sm font-bold">Libellé</th>
              <th className="px-lg py-sm text-center font-bold">Note</th>
              {columns === 'actif' && (
                <>
                  <th className="px-lg py-sm text-right font-bold">Brut</th>
                  <th className="px-lg py-sm text-right font-bold">
                    Amort. et déprec.
                  </th>
                </>
              )}
              <th className="px-lg py-sm text-right font-bold">
                {columns === 'resultat' ? 'Exercice' : 'Net'}
              </th>
              <th className="px-lg py-sm text-right font-bold">{prevLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.map((l) => {
              const bold = l.is_total;
              const strong = bold && l.level >= 2;
              return (
                <tr
                  key={l.ref}
                  className={strong ? 'bg-primary-50' : bold ? 'bg-neutral-50' : ''}
                >
                  <td className="px-lg py-sm font-mono text-xs text-neutral-400">
                    {l.ref}
                  </td>
                  <td
                    className={`px-lg py-sm ${
                      bold
                        ? 'font-extrabold text-neutral-900'
                        : 'text-neutral-700'
                    }`}
                  >
                    {columns === 'resultat' && !bold && (
                      <span
                        className={`mr-sm font-mono text-xs ${l.sign < 0 ? 'text-error' : 'text-success'}`}
                      >
                        {l.sign < 0 ? '−' : '+'}
                      </span>
                    )}
                    {l.label}
                  </td>
                  <td className="px-lg py-sm text-center text-xs text-neutral-400">
                    {l.note_no ?? ''}
                  </td>
                  {columns === 'actif' && (
                    <>
                      <td className="px-lg py-sm text-right tabular-nums text-neutral-600">
                        {money(l.brut)}
                      </td>
                      <td className="px-lg py-sm text-right tabular-nums text-neutral-600">
                        {money(l.amort)}
                      </td>
                    </>
                  )}
                  <td
                    className={`px-lg py-sm text-right tabular-nums ${
                      bold ? 'font-extrabold' : 'font-semibold'
                    } ${l.net < 0 ? 'text-error' : 'text-neutral-900'}`}
                  >
                    {money(l.net)}
                  </td>
                  <td className="px-lg py-sm text-right tabular-nums text-neutral-500">
                    {money(l.prev_net)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
