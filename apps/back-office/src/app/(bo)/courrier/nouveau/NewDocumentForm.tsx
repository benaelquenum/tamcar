'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { DOC_KIND_LABELS, type BoDocKind } from '@/lib/bo';

const MAX_SIZE = 25 * 1024 * 1024; // 25 Mo

export function NewDocumentForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const kind = String(fd.get('kind')) as BoDocKind;
    const title = String(fd.get('title') || '').trim();
    const correspondent = String(fd.get('correspondent') || '').trim();
    const docDate = String(fd.get('doc_date') || '');
    const notes = String(fd.get('notes') || '').trim();
    const file = fd.get('file') as File | null;

    if (!title) {
      setError("Renseignez l'objet du document.");
      return;
    }
    if (file && file.size > MAX_SIZE) {
      setError('Fichier trop lourd (25 Mo max). Réduisez la qualité du scan.');
      return;
    }

    setBusy(true);
    try {
      let storagePath: string | null = null;
      let mimeType: string | null = null;
      let sizeBytes: number | null = null;

      if (file && file.size > 0) {
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const year = new Date().getFullYear();
        storagePath = `${year}/${kind}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabaseBrowser.storage
          .from('backoffice')
          .upload(storagePath, file, {
            contentType: file.type || undefined,
            upsert: false,
          });
        if (upErr) throw new Error(`Envoi du fichier impossible : ${upErr.message}`);
        mimeType = file.type || null;
        sizeBytes = file.size;
      }

      const { data, error: rpcErr } = await supabaseBrowser.rpc(
        'bo_create_document',
        {
          p_kind: kind,
          p_title: title,
          p_correspondent: correspondent || null,
          p_doc_date: docDate || null,
          p_storage_path: storagePath,
          p_mime_type: mimeType,
          p_size_bytes: sizeBytes,
          p_notes: notes || null,
        },
      );
      if (rpcErr) throw new Error(rpcErr.message);

      router.push(`/courrier/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-xl flex flex-col gap-lg">
      {error && (
        <div className="rounded-md bg-error/10 p-md text-sm text-error">
          {error}
        </div>
      )}

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Type de document
        </label>
        <select
          name="kind"
          defaultValue="courrier_arrivee"
          className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {Object.entries(DOC_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Objet
        </label>
        <input
          name="title"
          required
          placeholder="Ex. : Demande d'autorisation ANATT — renouvellement"
          className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-lg sm:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Expéditeur / destinataire
          </label>
          <input
            name="correspondent"
            placeholder="Ex. : ANATT, Direction des transports"
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Date du document
          </label>
          <input
            name="doc_date"
            type="date"
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Scan ou photo de la pièce
        </label>
        <input
          name="file"
          type="file"
          accept="image/*,application/pdf"
          className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 file:mr-md file:rounded-md file:border-0 file:bg-primary-50 file:px-md file:py-xs file:text-xs file:font-bold file:text-primary-700"
        />
        <p className="mt-xs text-xs text-neutral-400">
          PDF ou image, 25 Mo max. Depuis un téléphone, la caméra s&apos;ouvre
          directement.
        </p>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Notes internes
        </label>
        <textarea
          name="notes"
          rows={3}
          placeholder="Contexte, suite à donner…"
          className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-primary-500 py-md text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Enregistrement…' : 'Numéroter et classer'}
      </button>
    </form>
  );
}
