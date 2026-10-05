'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangleIcon, CheckIcon } from '@/components/Icon';
import { processPortrait, warmUpPortraitDetector, type PortraitResult } from '@/lib/portrait';
import { savePortraitAction } from './photoActions';

/**
 * Photo officielle du chauffeur : on choisit (ou on prend) la photo, l'outil la contrôle et la
 * corrige tout seul (visage de face, cadrage, lumière, netteté), puis on l'enregistre : elle devient
 * la photo que les clients voient. Marche aussi depuis un téléphone (l'appareil photo s'ouvre).
 */
export function PortraitUploader({
  profileId,
  driverId,
  name,
  currentUrl,
  verifiedAt,
}: {
  profileId: string;
  driverId: string;
  name: string;
  currentUrl: string | null;
  verifiedAt: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PortraitResult | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    warmUpPortraitDetector();
  }, []);

  useEffect(() => {
    return () => {
      if (result?.previewUrl) URL.revokeObjectURL(result.previewUrl);
      if (originalUrl) URL.revokeObjectURL(originalUrl);
    };
  }, [result, originalUrl]);

  async function onFile(file: File) {
    setMessage(null);
    setBusy(true);
    if (result?.previewUrl) URL.revokeObjectURL(result.previewUrl);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setResult(null);
    setOriginalUrl(URL.createObjectURL(file));
    try {
      setResult(await processPortrait(file));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!result?.blob || !result.ok) return;
    setSaving(true);
    setMessage(null);
    const fd = new FormData();
    fd.set('profile_id', profileId);
    fd.set('driver_id', driverId);
    fd.set('photo', new File([result.blob], 'portrait.jpg', { type: 'image/jpeg' }));
    const r = await savePortraitAction(fd);
    setSaving(false);
    if (r.ok) {
      setMessage({ ok: true, text: 'Photo enregistrée : les clients verront cette photo.' });
      setResult(null);
      setOriginalUrl(null);
      router.refresh();
    } else {
      setMessage({ ok: false, text: r.error ?? 'Échec de l’enregistrement.' });
    }
  }

  const hasWarn = result?.issues.some((i) => i.level === 'warn') ?? false;

  return (
    <section className="mt-md rounded-2xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">Photo officielle</h2>
        <p className="text-[11px] text-neutral-500">
          Visage de face, lumière de face, fond uni, à environ 1 mètre. L’outil contrôle et corrige la photo tout seul.
        </p>
      </div>

      <div className="mt-md flex flex-wrap items-start gap-lg">
        <div className="text-center">
          <p className="mb-xs text-[10px] font-bold uppercase tracking-wider text-neutral-500">Actuelle</p>
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt="" className="h-28 w-28 rounded-full object-cover ring-1 ring-neutral-200" />
          ) : (
            <span className="grid h-28 w-28 place-items-center rounded-full bg-neutral-100 text-[11px] text-neutral-500">Aucune</span>
          )}
          <p className={`mt-xs max-w-[7.5rem] text-[10px] font-semibold ${verifiedAt ? 'text-primary-700' : 'text-neutral-500'}`}>
            {verifiedAt
              ? `Vérifiée par TamCar le ${new Date(verifiedAt).toLocaleDateString('fr-FR', { timeZone: 'Africa/Porto-Novo' })}`
              : currentUrl
                ? 'Non vérifiée : pas de badge côté client'
                : ''}
          </p>
        </div>

        {(busy || result) && (
          <div className="text-center">
            <p className="mb-xs text-[10px] font-bold uppercase tracking-wider text-neutral-500">Nouvelle photo, traitée</p>
            {busy && (
              <div className="grid h-28 w-28 place-items-center rounded-full bg-neutral-100 text-[11px] text-neutral-500">
                Analyse…
              </div>
            )}
            {result?.previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.previewUrl} alt="" className="h-28 w-28 rounded-full object-cover ring-2 ring-primary-500" />
            )}
          </div>
        )}

        {originalUrl && result && (
          <div className="text-center">
            <p className="mb-xs text-[10px] font-bold uppercase tracking-wider text-neutral-500">Photo d’origine</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={originalUrl} alt="" className="h-28 w-auto max-w-[9rem] rounded-lg object-cover ring-1 ring-neutral-200" />
          </div>
        )}

        {result && (
          <ul className="min-w-[240px] flex-1 space-y-xs">
            {result.issues.map((i, k) => (
              <li
                key={`${i.code}-${k}`}
                className={`flex items-start gap-xs text-xs ${
                  i.level === 'error' ? 'font-semibold text-error' : i.level === 'warn' ? 'text-neutral-800' : 'text-neutral-600'
                }`}
              >
                {i.level === 'ok' ? (
                  <CheckIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-success" strokeWidth={3} />
                ) : (
                  <AlertTriangleIcon className={`mt-0.5 h-3.5 w-3.5 flex-none ${i.level === 'error' ? 'text-error' : 'text-warning'}`} />
                )}
                <span>{i.message}</span>
              </li>
            ))}
            {result.bytes > 0 && (
              <li className="text-[11px] text-neutral-400">Image finale : 800 × 800, {Math.round(result.bytes / 1024)} Ko.</li>
            )}
          </ul>
        )}
      </div>

      {message && (
        <p
          className={`mt-md rounded-md p-md text-sm ${message.ok ? 'bg-primary-50 font-semibold text-primary-700' : 'bg-error/10 text-error'}`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-md flex flex-wrap items-center gap-sm">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || saving}
          className="rounded-lg border border-neutral-200 bg-white px-md py-sm text-xs font-bold text-neutral-800 hover:border-primary-500 disabled:opacity-50"
        >
          {result ? 'Choisir une autre photo' : `Prendre ou choisir la photo de ${name}`}
        </button>
        {result?.ok && result.blob && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-gradient-to-r from-primary-500 to-primary-700 px-lg py-sm text-xs font-bold text-white shadow-glow disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : hasWarn ? 'Enregistrer malgré les avertissements' : 'Enregistrer comme photo officielle'}
          </button>
        )}
      </div>
    </section>
  );
}
