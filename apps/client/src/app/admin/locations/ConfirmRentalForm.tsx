'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  availableDriversAction,
  cancelRentalAdminAction,
  confirmRentalAction,
  type AvailableDriver,
} from './actions';

/** Demande d'un client à confirmer : choix du chauffeur libre sur le créneau, prix, paiement. */
export function ConfirmRentalForm({
  id,
  startsAt,
  endsAt,
  priceFcfa,
}: {
  id: string;
  startsAt: string;
  endsAt: string;
  priceFcfa: number;
}) {
  const router = useRouter();
  const [drivers, setDrivers] = useState<AvailableDriver[] | null>(null);
  const [driverId, setDriverId] = useState('');
  const [price, setPrice] = useState(String(priceFcfa));
  const [mode, setMode] = useState<'cash' | 'prepaid'>('prepaid');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    availableDriversAction(startsAt, endsAt, id).then((list) => {
      if (cancelled) return;
      setDrivers(list);
      const firstFree = list.find((d) => !d.conflict);
      if (firstFree) setDriverId(firstFree.driver_id);
    });
    return () => {
      cancelled = true;
    };
  }, [id, startsAt, endsAt]);

  function confirm() {
    setError(null);
    if (!driverId) return setError('Choisissez un chauffeur.');
    const p = parseInt(price, 10);
    if (!Number.isFinite(p) || p < 0) return setError('Prix invalide.');
    startTransition(async () => {
      const res = await confirmRentalAction(id, driverId, p, mode);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function refuse() {
    const reason = window.prompt('Motif du refus (affiché au client) :', 'Aucun véhicule disponible sur ce créneau.');
    if (reason === null) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelRentalAdminAction(id, reason);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-md rounded-lg bg-neutral-100 p-md">
      {drivers === null ? (
        <p className="text-xs text-neutral-600">Recherche des chauffeurs libres…</p>
      ) : drivers.length === 0 ? (
        <p className="text-xs font-semibold text-error">Aucun chauffeur VIP actif.</p>
      ) : (
        <div className="grid grid-cols-1 gap-sm md:grid-cols-3">
          <label className="block text-xs font-semibold text-neutral-600 md:col-span-3">
            Chauffeur et véhicule
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="mt-xs w-full rounded-lg border border-neutral-300 bg-white px-sm py-sm text-sm"
            >
              <option value="">— choisir —</option>
              {drivers.map((d) => (
                <option key={d.driver_id} value={d.driver_id} disabled={Boolean(d.conflict)}>
                  {d.full_name} · {[d.vehicle_brand, d.vehicle_model].filter(Boolean).join(' ')}
                  {d.vehicle_plate ? ` (${d.vehicle_plate})` : ''}
                  {d.conflict ? ` — indisponible : ${d.conflict}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-neutral-600">
            Prix (F)
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
              className="mt-xs w-full rounded-lg border border-neutral-300 bg-white px-sm py-sm text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-neutral-600">
            Paiement
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'cash' | 'prepaid')}
              className="mt-xs w-full rounded-lg border border-neutral-300 bg-white px-sm py-sm text-sm"
            >
              <option value="cash">Le client règle le chauffeur</option>
              <option value="prepaid">Réglé à TamCar d&apos;avance</option>
            </select>
          </label>
          <div className="flex items-end gap-xs">
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="flex-1 rounded-lg bg-primary-500 px-md py-sm text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
            >
              {pending ? '…' : 'Confirmer'}
            </button>
            <button
              type="button"
              onClick={refuse}
              disabled={pending}
              className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
            >
              Refuser
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-sm text-xs font-semibold text-error">{error}</p>}
    </div>
  );
}
