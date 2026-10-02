'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { compressImage } from '@/lib/imageCompress';

/**
 * Démarrer puis terminer une location VIP. À chaque étape : kilométrage du compteur
 * ET photo du compteur (preuve en cas de litige sur les kilomètres en plus).
 */
export function RentalActions({
  id,
  status,
  startsAt,
  odometerStart,
  isPaid,
}: {
  id: string;
  status: string;
  startsAt: string;
  odometerStart: number | null;
  isPaid: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [odo, setOdo] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const tooEarly = Date.now() < new Date(startsAt).getTime() - 60 * 60_000;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setPhoto(await compressImage(file));
  }

  function parseOdo(): number | null {
    const n = parseInt(odo.replace(/\s/g, ''), 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  /** Envoie la photo (chemin <location>/<étape>-<uuid>.jpg) puis appelle la fonction SQL. */
  function submit(kind: 'start' | 'end') {
    setError(null);
    const km = parseOdo();
    if (km === null) return setError('Indiquez le kilométrage du compteur.');
    if (!photo) return setError('Prenez une photo du compteur.');
    if (kind === 'end' && odometerStart != null && km < odometerStart) {
      return setError(`Le kilométrage de fin ne peut pas être inférieur à celui du départ (${odometerStart} km).`);
    }
    if (kind === 'end' && !window.confirm('Terminer la location ? Cette action est définitive.')) return;

    startTransition(async () => {
      const path = `${id}/${kind}-${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabaseBrowser.storage
        .from('rental-photos')
        .upload(path, photo, { contentType: 'image/jpeg', upsert: false });
      if (upErr) {
        setError('Envoi de la photo : ' + upErr.message);
        return;
      }
      const { error: rpcErr } =
        kind === 'start'
          ? await supabaseBrowser.rpc('driver_start_vehicle_rental', {
              p_id: id,
              p_odometer_start: km,
              p_photo_path: path,
            })
          : await supabaseBrowser.rpc('driver_complete_vehicle_rental', {
              p_id: id,
              p_odometer_end: km,
              p_photo_path: path,
            });
      if (rpcErr) setError(rpcErr.message);
      else router.refresh();
    });
  }

  if (status !== 'confirmed' && status !== 'in_progress') return null;

  const starting = status === 'confirmed';
  const blocked = starting && (tooEarly || !isPaid);

  return (
    <div className="mt-md rounded-lg bg-neutral-100 p-sm">
      <p className="text-[11px] font-semibold text-neutral-700">
        {starting
          ? 'Au départ : kilométrage et photo du compteur'
          : `À la fin : kilométrage et photo du compteur${odometerStart != null ? ` (départ : ${odometerStart} km)` : ''}`}
      </p>

      <input
        value={odo}
        onChange={(e) => setOdo(e.target.value)}
        inputMode="numeric"
        placeholder="Kilométrage affiché, ex. 84 250"
        className="mt-xs w-full rounded-lg border border-neutral-300 bg-white px-sm py-sm text-sm text-neutral-900"
        disabled={blocked}
      />

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />
      <div className="mt-xs flex items-center gap-sm">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Photo du compteur" className="h-14 w-14 flex-none rounded-lg object-cover ring-1 ring-neutral-300" />
        ) : null}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={blocked || pending}
          className="flex-1 rounded-lg border-2 border-primary-500 bg-white py-sm text-xs font-bold text-primary-700 disabled:opacity-50"
        >
          {photo ? 'Reprendre la photo' : 'Photographier le compteur'}
        </button>
      </div>

      <button
        type="button"
        onClick={() => submit(starting ? 'start' : 'end')}
        disabled={pending || blocked}
        className={`mt-sm w-full rounded-lg py-sm text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
          starting ? 'bg-primary-500' : 'bg-neutral-900'
        }`}
      >
        {pending ? 'Envoi…' : starting ? 'Démarrer la location' : 'Terminer la location'}
      </button>

      {starting && !isPaid && (
        <p className="mt-xs text-[11px] font-semibold text-warning">
          Location pas encore réglée à TamCar : vous ne pouvez pas la démarrer. Contactez l&apos;équipe.
        </p>
      )}
      {starting && isPaid && tooEarly && (
        <p className="mt-xs text-[11px] text-neutral-500">Disponible 1 h avant le début.</p>
      )}
      {error && <p className="mt-xs text-xs font-semibold text-error">{error}</p>}
    </div>
  );
}
