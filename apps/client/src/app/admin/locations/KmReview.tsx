'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { settleExtraAction, validateKmAction } from './actions';

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

/**
 * Location terminée : photos du compteur, kilomètres déclarés par le chauffeur, validation,
 * puis encaissement du supplément éventuel.
 */
export function KmReview({
  id,
  hours,
  odometerStart,
  odometerEnd,
  startPhotoUrl,
  endPhotoUrl,
  kmIncludedPerDay,
  kmExtraFcfa,
  kmStatus,
  extraFcfa,
  extraKm,
  extraSettled,
}: {
  id: string;
  hours: number;
  odometerStart: number | null;
  odometerEnd: number | null;
  startPhotoUrl: string | null;
  endPhotoUrl: string | null;
  kmIncludedPerDay: number;
  kmExtraFcfa: number;
  kmStatus: string;
  extraFcfa: number | null;
  extraKm: number | null;
  extraSettled: boolean;
}) {
  const router = useRouter();
  const [start, setStart] = useState(odometerStart != null ? String(odometerStart) : '');
  const [end, setEnd] = useState(odometerEnd != null ? String(odometerEnd) : '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const s = parseInt(start, 10);
  const e = parseInt(end, 10);
  const valid = Number.isFinite(s) && Number.isFinite(e) && e >= s;
  const days = Math.max(1, Math.ceil(hours / 24));
  const used = valid ? e - s : null;
  const allowance = kmIncludedPerDay * days;
  const previewExtraKm = used != null ? Math.max(0, used - allowance) : null;

  function validate() {
    setError(null);
    if (!valid) return setError('Kilométrages invalides.');
    startTransition(async () => {
      const res = await validateKmAction(id, s, e);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function settle() {
    setError(null);
    if (!window.confirm(`Confirmer que le supplément de ${fmt(extraFcfa ?? 0)} F a été encaissé ? Il sera réparti (chauffeur, concessionnaire, TamCar).`)) return;
    startTransition(async () => {
      const res = await settleExtraAction(id);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const photo = (url: string | null, label: string) =>
    url ? (
      <a href={url} target="_blank" rel="noopener" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="h-28 w-full rounded-lg object-cover ring-1 ring-neutral-300" />
        <span className="mt-0.5 block text-center text-[10px] font-semibold text-neutral-500">{label}</span>
      </a>
    ) : (
      <div className="grid h-28 place-items-center rounded-lg bg-neutral-100 text-[11px] text-neutral-500">
        {label} : pas de photo
      </div>
    );

  return (
    <div className="mt-sm rounded-lg bg-neutral-100 p-sm">
      <div className="grid grid-cols-2 gap-sm">
        {photo(startPhotoUrl, 'Compteur au départ')}
        {photo(endPhotoUrl, 'Compteur à la fin')}
      </div>

      <div className="mt-sm grid grid-cols-2 gap-sm">
        <label className="block text-[11px] font-semibold text-neutral-600">
          Départ (km)
          <input
            value={start}
            onChange={(ev) => setStart(ev.target.value)}
            inputMode="numeric"
            disabled={extraSettled}
            className="mt-xs w-full rounded-md border border-neutral-300 bg-white px-sm py-xs text-sm"
          />
        </label>
        <label className="block text-[11px] font-semibold text-neutral-600">
          Fin (km)
          <input
            value={end}
            onChange={(ev) => setEnd(ev.target.value)}
            inputMode="numeric"
            disabled={extraSettled}
            className="mt-xs w-full rounded-md border border-neutral-300 bg-white px-sm py-xs text-sm"
          />
        </label>
      </div>

      <p className="mt-xs text-xs text-neutral-700">
        {used != null ? `${used} km parcourus` : '—'} · forfait {allowance} km
        {previewExtraKm != null && previewExtraKm > 0 ? (
          <strong className="ml-xs text-warning">
            · {previewExtraKm} km en plus = {fmt(previewExtraKm * kmExtraFcfa)} F
          </strong>
        ) : (
          <span className="ml-xs text-success"> · dans le forfait</span>
        )}
      </p>

      {kmStatus === 'pending' && (
        <p className="mt-xs text-[11px] font-semibold text-warning">
          À valider : contrôlez les photos puis validez les kilomètres.
        </p>
      )}

      <div className="mt-sm flex flex-wrap items-center gap-xs">
        {!extraSettled && (
          <button
            type="button"
            onClick={validate}
            disabled={pending || !valid}
            className="rounded-md bg-primary-500 px-sm py-xs text-xs font-bold text-white disabled:opacity-50"
          >
            {kmStatus === 'validated' ? 'Revalider les km' : 'Valider les km'}
          </button>
        )}
        {kmStatus === 'validated' && (extraFcfa ?? 0) > 0 && !extraSettled && (
          <button
            type="button"
            onClick={settle}
            disabled={pending}
            className="rounded-md bg-neutral-900 px-sm py-xs text-xs font-bold text-white disabled:opacity-50"
          >
            Supplément encaissé : {fmt(extraFcfa ?? 0)} F
          </button>
        )}
        {extraSettled && (
          <span className="text-xs font-bold text-success">
            Supplément de {fmt(extraFcfa ?? 0)} F ({extraKm} km) encaissé et réparti.
          </span>
        )}
      </div>
      {error && <p className="mt-xs text-xs font-semibold text-error">{error}</p>}
    </div>
  );
}
