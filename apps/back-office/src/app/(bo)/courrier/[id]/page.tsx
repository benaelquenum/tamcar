import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  DOC_KIND_LABELS,
  DOC_STATUS_LABELS,
  DOC_STATUS_STYLES,
  formatDate,
  formatSize,
  type BoDocument,
} from '@/lib/bo';
import { ChevronLeftIcon, DownloadIcon } from '@/components/Icon';
import { StatusButtons } from './StatusButtons';

export const dynamic = 'force-dynamic';

export default async function DocumentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('bo_documents')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (!data) notFound();
  const doc = data as BoDocument;

  let fileUrl: string | null = null;
  let isImage = false;
  let isPdf = false;
  if (doc.storage_path) {
    const { data: signed } = await supabase.storage
      .from('backoffice')
      .createSignedUrl(doc.storage_path, 3600);
    fileUrl = signed?.signedUrl ?? null;
    isImage = !!doc.mime_type?.startsWith('image/');
    isPdf = doc.mime_type === 'application/pdf';
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/courrier"
        className="flex w-fit items-center gap-xs text-sm font-semibold text-neutral-500 hover:text-neutral-800"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Registre du courrier
      </Link>

      <div className="mt-lg rounded-xl bg-white p-xl shadow-sm ring-1 ring-neutral-200">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <p className="font-mono text-xs text-neutral-400">
              {doc.reg_number}
            </p>
            <h1 className="mt-xs text-xl font-extrabold text-neutral-900">
              {doc.title}
            </h1>
            <p className="mt-xs text-sm text-neutral-500">
              {DOC_KIND_LABELS[doc.kind]}
              {doc.correspondent ? ` — ${doc.correspondent}` : ''}
            </p>
          </div>
          <span
            className={`rounded-full px-md py-xs text-xs font-bold ${DOC_STATUS_STYLES[doc.status]}`}
          >
            {DOC_STATUS_LABELS[doc.status]}
          </span>
        </div>

        <dl className="mt-lg grid grid-cols-2 gap-md text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Date du document
            </dt>
            <dd className="mt-xs text-neutral-800">{formatDate(doc.doc_date)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Enregistré le
            </dt>
            <dd className="mt-xs text-neutral-800">{formatDate(doc.logged_on)}</dd>
          </div>
          {doc.size_bytes ? (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Fichier
              </dt>
              <dd className="mt-xs text-neutral-800">
                {formatSize(doc.size_bytes)}
              </dd>
            </div>
          ) : null}
        </dl>

        {doc.notes && (
          <div className="mt-lg rounded-lg bg-neutral-50 p-md text-sm text-neutral-700">
            {doc.notes}
          </div>
        )}

        <StatusButtons docId={doc.id} current={doc.status} />
      </div>

      {fileUrl && (
        <div className="mt-lg rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
              Pièce numérisée
            </h2>
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-sm rounded-lg bg-neutral-100 px-md py-sm text-xs font-bold text-neutral-700 hover:bg-neutral-200"
            >
              <DownloadIcon className="h-4 w-4" />
              Ouvrir / télécharger
            </a>
          </div>
          <div className="mt-md overflow-hidden rounded-lg ring-1 ring-neutral-200">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl} alt={doc.title} className="w-full" />
            ) : isPdf ? (
              <iframe src={fileUrl} className="h-[70vh] w-full" title={doc.title} />
            ) : (
              <p className="p-lg text-sm text-neutral-500">
                Aperçu indisponible pour ce format — utilisez « Ouvrir /
                télécharger ».
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
