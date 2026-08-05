import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  DOC_KIND_LABELS,
  DOC_STATUS_LABELS,
  DOC_STATUS_STYLES,
  formatDate,
  formatFcfa,
  type BoDeadline,
  type BoDocument,
} from '@/lib/bo';
import {
  AlertIcon,
  CalendarIcon,
  HelpIcon,
  InboxIcon,
  PlusIcon,
} from '@/components/Icon';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createServerSupabase();

  const in30days = new Date(Date.now() + 30 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const [{ count: toProcess }, { data: deadlines }, { data: recentDocs }] =
    await Promise.all([
      supabase
        .from('bo_documents')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'a_traiter'),
      supabase
        .from('bo_deadlines')
        .select('*')
        .eq('status', 'pending')
        .lte('due_date', in30days)
        .order('due_date', { ascending: true })
        .limit(6),
      supabase
        .from('bo_documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

  const overdue = (deadlines ?? []).filter(
    (d: BoDeadline) => d.due_date < new Date().toISOString().slice(0, 10),
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900">
            Tableau de bord
          </h1>
          <p className="mt-xs text-sm text-neutral-600">
            Secrétariat et administration TamCar — vue du jour.
          </p>
        </div>
        <Link
          href="/courrier/nouveau"
          className="flex items-center gap-sm rounded-lg bg-primary-500 px-lg py-md text-sm font-bold text-white shadow-md transition hover:brightness-110"
        >
          <PlusIcon className="h-4 w-4" />
          Enregistrer un document
        </Link>
      </div>

      <Link
        href="/guide"
        className="mt-lg flex items-center gap-md rounded-xl bg-primary-50 p-lg ring-1 ring-primary-100 transition hover:bg-primary-100"
      >
        <HelpIcon className="h-6 w-6 shrink-0 text-primary-700" />
        <div>
          <p className="text-sm font-bold text-primary-800">
            Première fois ici ? Lisez le guide d&apos;utilisation.
          </p>
          <p className="text-xs text-primary-700">
            Comment enregistrer un document, saisir une dépense, comprendre les
            statuts et corriger une erreur — en quinze minutes.
          </p>
        </div>
      </Link>

      <div className="mt-xl grid grid-cols-1 gap-lg sm:grid-cols-3">
        <div className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <div className="flex items-center gap-sm text-warning">
            <InboxIcon className="h-5 w-5" />
            <p className="text-xs font-bold uppercase tracking-wider">
              À traiter
            </p>
          </div>
          <p className="mt-sm text-3xl font-extrabold text-neutral-900">
            {toProcess ?? 0}
          </p>
          <p className="text-xs text-neutral-500">documents en attente</p>
        </div>

        <div className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <div className="flex items-center gap-sm text-info">
            <CalendarIcon className="h-5 w-5" />
            <p className="text-xs font-bold uppercase tracking-wider">
              Échéances 30 jours
            </p>
          </div>
          <p className="mt-sm text-3xl font-extrabold text-neutral-900">
            {deadlines?.length ?? 0}
          </p>
          <p className="text-xs text-neutral-500">à venir ou en retard</p>
        </div>

        <div className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <div className="flex items-center gap-sm text-error">
            <AlertIcon className="h-5 w-5" />
            <p className="text-xs font-bold uppercase tracking-wider">
              En retard
            </p>
          </div>
          <p className="mt-sm text-3xl font-extrabold text-neutral-900">
            {overdue}
          </p>
          <p className="text-xs text-neutral-500">échéances dépassées</p>
        </div>
      </div>

      <div className="mt-xl grid grid-cols-1 gap-lg lg:grid-cols-2">
        <section className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
              Prochaines échéances
            </h2>
            <Link
              href="/echeances"
              className="text-xs font-bold text-primary-600 hover:underline"
            >
              Tout voir
            </Link>
          </div>
          {(deadlines ?? []).length === 0 ? (
            <p className="mt-md text-sm text-neutral-500">
              Aucune échéance dans les 30 prochains jours.
            </p>
          ) : (
            <ul className="mt-md divide-y divide-neutral-100">
              {(deadlines as BoDeadline[]).map((d) => {
                const late =
                  d.due_date < new Date().toISOString().slice(0, 10);
                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between py-sm"
                  >
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">
                        {d.label}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {d.category}
                        {d.amount_fcfa
                          ? ` — ${formatFcfa(d.amount_fcfa)} F`
                          : ''}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-md py-xs text-xs font-bold ${
                        late
                          ? 'bg-error/10 text-error'
                          : 'bg-info/10 text-info'
                      }`}
                    >
                      {formatDate(d.due_date)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
              Derniers documents
            </h2>
            <Link
              href="/documents"
              className="text-xs font-bold text-primary-600 hover:underline"
            >
              Tout voir
            </Link>
          </div>
          {(recentDocs ?? []).length === 0 ? (
            <p className="mt-md text-sm text-neutral-500">
              Aucun document enregistré pour le moment. Commencez par «
              Enregistrer un document ».
            </p>
          ) : (
            <ul className="mt-md divide-y divide-neutral-100">
              {(recentDocs as BoDocument[]).map((doc) => (
                <li key={doc.id} className="py-sm">
                  <Link
                    href={`/courrier/${doc.id}`}
                    className="flex items-center justify-between gap-md hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">
                        <span className="font-mono text-xs text-neutral-400">
                          {doc.reg_number}
                        </span>{' '}
                        {doc.title}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {DOC_KIND_LABELS[doc.kind]}
                        {doc.correspondent ? ` — ${doc.correspondent}` : ''}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-md py-xs text-xs font-bold ${DOC_STATUS_STYLES[doc.status]}`}
                    >
                      {DOC_STATUS_LABELS[doc.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
