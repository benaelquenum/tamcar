'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase-browser';
import {
  PAYMENT_ACCOUNTS,
  formatFcfa,
  type BoExpenseCategory,
  type BoPendingOperation,
  type OperationAnalysis,
} from '@/lib/bo';

// Compression côté client : accélère l'envoi, économise le stockage et
// reste sous les limites d'analyse (les photos de téléphone font 5-12 Mo).
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const MAX = 1800;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Compression impossible'))),
      'image/jpeg',
      0.85,
    );
  });
}

type Step = 'input' | 'review';

export function OperationForm({
  categories,
}: {
  categories: BoExpenseCategory[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('input');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<OperationAnalysis | null>(null);
  const [pendingResult, setPendingResult] = useState<BoPendingOperation | null>(null);

  async function analyze() {
    setError(null);
    const file = fileRef.current?.files?.[0] ?? null;
    if (!file && !rawText.trim()) {
      setError('Ajoutez une photo du justificatif ou décrivez l’opération.');
      return;
    }

    setBusy('Analyse en cours…');
    try {
      // 1. Envoi de la pièce dans le coffre (une seule fois)
      let path = storagePath;
      let mime = mimeType;
      if (file && !path) {
        let blob: Blob = file;
        mime = file.type || 'application/octet-stream';
        if (mime.startsWith('image/')) {
          blob = await compressImage(file);
          mime = 'image/jpeg';
        } else if (mime !== 'application/pdf') {
          throw new Error('Format non pris en charge (photo ou PDF).');
        }
        if (blob.size > 20 * 1024 * 1024) {
          throw new Error('Pièce trop lourde même compressée (20 Mo max).');
        }
        const ext = mime === 'application/pdf' ? 'pdf' : 'jpg';
        const year = new Date().getFullYear();
        path = `${year}/piece_comptable/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabaseBrowser.storage
          .from('backoffice')
          .upload(path, blob, { contentType: mime });
        if (upErr) throw new Error(`Envoi impossible : ${upErr.message}`);
        setStoragePath(path);
        setMimeType(mime);
        setFileSize(blob.size);
      }

      // 2. Analyse IA
      const { data, error: fnErr } = await supabaseBrowser.functions.invoke(
        'analyze-operation',
        {
          body: {
            storage_path: path,
            mime_type: mime,
            text: rawText.trim() || null,
          },
        },
      );
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      setAnalysis({
        supplier: data.supplier ?? '',
        doc_date: data.doc_date || new Date().toISOString().slice(0, 10),
        amount_fcfa: data.amount_fcfa ?? 0,
        category: data.category ?? 'autres',
        payment_account: data.payment_account ?? '',
        confidence: data.confidence ?? 0,
        notes: data.notes ?? '',
      });
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      setBusy(null);
    }
  }

  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!analysis) return;
    setError(null);
    const fd = new FormData(e.currentTarget);

    const amount = parseInt(String(fd.get('amount') || '').replace(/\s/g, ''), 10);
    if (!amount || amount <= 0) {
      setError('Montant invalide.');
      return;
    }

    setBusy('Enregistrement…');
    try {
      // Justificatif → GED (pièce numérotée PC-…)
      let documentId: string | null = null;
      if (storagePath) {
        const { data: doc, error: docErr } = await supabaseBrowser.rpc(
          'bo_create_document',
          {
            p_kind: 'piece_comptable',
            p_title: `Justificatif — ${categories.find((c) => c.code === String(fd.get('category')))?.label ?? ''}${fd.get('supplier') ? ` (${fd.get('supplier')})` : ''}`,
            p_correspondent: String(fd.get('supplier') || '') || null,
            p_doc_date: String(fd.get('date') || '') || null,
            p_storage_path: storagePath,
            p_mime_type: mimeType,
            p_size_bytes: fileSize,
            p_notes: String(fd.get('notes') || '') || null,
          },
        );
        if (docErr) throw new Error(docErr.message);
        documentId = doc.id;
      }

      const { data: op, error: rpcErr } = await supabaseBrowser.rpc(
        'bo_submit_operation',
        {
          p_category: String(fd.get('category')),
          p_amount_fcfa: amount,
          p_date: String(fd.get('date') || '') || null,
          p_supplier: String(fd.get('supplier') || '') || null,
          p_payment_account: String(fd.get('payment') || '') || null,
          p_document_id: documentId,
          p_notes: String(fd.get('notes') || '') || null,
          p_raw_text: rawText.trim() || null,
          p_confidence: analysis.confidence,
        },
      );
      if (rpcErr) throw new Error(rpcErr.message);

      const result = op as BoPendingOperation;
      if (result.status === 'posted' && result.entry_id) {
        router.push(`/compta/ecritures/${result.entry_id}`);
        router.refresh();
      } else {
        setPendingResult(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      setBusy(null);
    }
  }

  if (pendingResult) {
    return (
      <div className="mt-xl rounded-xl bg-warning/10 p-xl text-center">
        <p className="text-lg font-extrabold text-warning">
          Envoyée en validation
        </p>
        <p className="mt-sm text-sm text-neutral-700">
          Cette opération de {formatFcfa(pendingResult.amount_fcfa)} F dépasse
          le seuil de comptabilisation automatique (100 000 F). Le fondateur la
          validera depuis la page Validations.
        </p>
        <div className="mt-lg flex justify-center gap-sm">
          <Link
            href="/tresorerie/validations"
            className="rounded-lg bg-neutral-900 px-lg py-md text-sm font-bold text-white"
          >
            Voir les validations
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-primary-500 px-lg py-md text-sm font-bold text-white"
          >
            Nouvelle opération
          </button>
        </div>
      </div>
    );
  }

  if (step === 'input') {
    return (
      <div className="mt-xl flex flex-col gap-lg">
        {error && (
          <div className="rounded-md bg-error/10 p-md text-sm text-error">
            {error}
          </div>
        )}

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Photo du justificatif (ou PDF)
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 file:mr-md file:rounded-md file:border-0 file:bg-primary-50 file:px-md file:py-xs file:text-xs file:font-bold file:text-primary-700"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Ou décrivez l&apos;opération
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={3}
            placeholder="Ex. : payé 45 000 F de carburant à la station JNP en espèces ce matin"
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="mt-xs text-xs text-neutral-400">
            Les deux ensemble donnent la meilleure analyse : la photo fait foi,
            la description apporte le contexte.
          </p>
        </div>

        <button
          type="button"
          disabled={!!busy}
          onClick={analyze}
          className="rounded-lg bg-primary-500 py-md text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ?? 'Analyser'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="mt-xl flex flex-col gap-lg">
      {error && (
        <div className="rounded-md bg-error/10 p-md text-sm text-error">
          {error}
        </div>
      )}

      <div
        className={`rounded-md p-md text-sm ${
          (analysis?.confidence ?? 0) >= 0.75
            ? 'bg-success/10 text-success'
            : 'bg-warning/10 text-warning'
        }`}
      >
        <span className="font-bold">
          Analyse terminée — confiance {Math.round((analysis?.confidence ?? 0) * 100)} %.
        </span>{' '}
        <span className="text-neutral-600">
          Vérifiez les champs pré-remplis avant de confirmer.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-lg sm:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Date
          </label>
          <input
            name="date"
            type="date"
            required
            defaultValue={analysis?.doc_date}
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Montant (FCFA)
          </label>
          <input
            name="amount"
            required
            inputMode="numeric"
            defaultValue={analysis?.amount_fcfa || ''}
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Catégorie
        </label>
        <select
          name="category"
          defaultValue={analysis?.category}
          className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label} ({c.account_code})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-lg sm:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Fournisseur / bénéficiaire
          </label>
          <input
            name="supplier"
            defaultValue={analysis?.supplier}
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Payé par
          </label>
          <select
            name="payment"
            defaultValue={analysis?.payment_account ?? ''}
            className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {PAYMENT_ACCOUNTS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Notes
        </label>
        <input
          name="notes"
          defaultValue={analysis?.notes}
          className="mt-xs w-full rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="flex gap-sm">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => setStep('input')}
          className="rounded-lg bg-neutral-100 px-lg py-md text-sm font-bold text-neutral-700"
        >
          Retour
        </button>
        <button
          type="submit"
          disabled={!!busy}
          className="flex-1 rounded-lg bg-primary-500 py-md text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ?? 'Confirmer et comptabiliser'}
        </button>
      </div>
    </form>
  );
}
