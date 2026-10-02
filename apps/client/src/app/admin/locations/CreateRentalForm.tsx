'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AddressAutocomplete, type SelectedAddress } from '@/components/AddressAutocomplete';
import {
  availableDriversAction,
  createRentalAction,
  findClientAction,
  type AvailableDriver,
  type ClientHit,
} from './actions';

/** Date + heure saisies à l'heure du Bénin (UTC+1, sans heure d'été). */
function toIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const inputCls = 'mt-xs w-full rounded-lg border border-neutral-300 bg-white px-sm py-sm text-sm';

export function CreateRentalForm({ hourFcfa, minHours }: { hourFcfa: number; minHours: number }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [client, setClient] = useState<ClientHit | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('08:00');
  const [hours, setHours] = useState('8');
  const [pickup, setPickup] = useState<SelectedAddress | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [drivers, setDrivers] = useState<AvailableDriver[] | null>(null);
  const [driverId, setDriverId] = useState('');
  const [price, setPrice] = useState('');
  const [paid, setPaid] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const hoursNum = parseInt(hours, 10);
  const startsAt = toIso(date, time);
  const endsAt =
    startsAt && Number.isFinite(hoursNum) && hoursNum > 0
      ? new Date(new Date(startsAt).getTime() + hoursNum * 3_600_000).toISOString()
      : null;
  const autoPrice = Number.isFinite(hoursNum) ? hourFcfa * Math.max(hoursNum, minHours) : 0;

  // Recherche du client (≥ 3 caractères), avec un léger délai de frappe.
  useEffect(() => {
    if (client || query.trim().length < 3) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      findClientAction(query.trim()).then((list) => {
        if (!cancelled) setHits(list);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, client]);

  // Chauffeurs libres sur le créneau.
  useEffect(() => {
    if (!startsAt || !endsAt) {
      setDrivers(null);
      return;
    }
    let cancelled = false;
    setDrivers(null);
    availableDriversAction(startsAt, endsAt, null).then((list) => {
      if (cancelled) return;
      setDrivers(list);
      setDriverId((cur) => (list.some((d) => d.driver_id === cur && !d.conflict) ? cur : ''));
    });
    return () => {
      cancelled = true;
    };
  }, [startsAt, endsAt]);

  function submit() {
    setError(null);
    setDone(false);
    if (!client) return setError('Choisissez le client (recherche par téléphone ou nom).');
    if (!startsAt || !endsAt) return setError('Indiquez le début et la durée.');
    if (!pickup) return setError('Indiquez le lieu de prise en charge.');
    if (!driverId) return setError('Choisissez un chauffeur disponible.');
    const priceNum = price.trim() === '' ? null : parseInt(price, 10);
    if (priceNum !== null && (!Number.isFinite(priceNum) || priceNum < 0)) return setError('Prix invalide.');
    const paidNum = parseInt(paid, 10);
    startTransition(async () => {
      const res = await createRentalAction({
        client_id: client.id,
        starts_at: startsAt,
        ends_at: endsAt,
        pickup_address: pickup.place_name,
        pickup_lat: pickup.center[1],
        pickup_lng: pickup.center[0],
        driver_id: driverId,
        price_fcfa: priceNum,
        payment_mode: 'prepaid',
        paid_fcfa: Number.isFinite(paidNum) ? paidNum : 0,
        notes: notes.trim() || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setDone(true);
      setClient(null);
      setQuery('');
      setPickup(null);
      setNotes('');
      setContactName('');
      setContactPhone('');
      setPrice('');
      setPaid('0');
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-md md:grid-cols-2">
      <div className="md:col-span-2">
        <label className="block text-xs font-semibold text-neutral-600">
          Client (téléphone ou nom — le client doit avoir un compte)
          <input
            value={client ? `${client.full_name} · ${client.phone ?? ''}` : query}
            onChange={(e) => {
              setClient(null);
              setQuery(e.target.value);
            }}
            placeholder="Ex. 97 00 00 00"
            className={inputCls}
          />
        </label>
        {!client && hits.length > 0 && (
          <ul className="mt-xs overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => {
                    setClient(h);
                    setHits([]);
                  }}
                  className="block w-full px-md py-sm text-left text-sm hover:bg-neutral-100"
                >
                  <strong>{h.full_name}</strong> <span className="text-neutral-500">{h.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="block text-xs font-semibold text-neutral-600">
        Date de début
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-sm">
        <label className="block text-xs font-semibold text-neutral-600">
          Heure
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
        </label>
        <label className="block text-xs font-semibold text-neutral-600">
          Durée (heures)
          <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" className={inputCls} />
        </label>
      </div>

      <div className="md:col-span-2">
        <AddressAutocomplete
          label="Lieu de prise en charge"
          placeholder="Hôtel, bureau, domicile…"
          value={pickup}
          onChange={setPickup}
        />
      </div>

      <label className="block text-xs font-semibold text-neutral-600">
        Contact sur place (facultatif)
        <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputCls} />
      </label>
      <label className="block text-xs font-semibold text-neutral-600">
        Son téléphone
        <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} inputMode="tel" className={inputCls} />
      </label>

      <div className="md:col-span-2">
        <label className="block text-xs font-semibold text-neutral-600">
          Chauffeur et véhicule (libres sur le créneau)
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={inputCls} disabled={!drivers}>
            <option value="">
              {!startsAt ? '— indiquez d’abord le créneau —' : drivers === null ? 'Recherche…' : '— choisir —'}
            </option>
            {(drivers ?? []).map((d) => (
              <option key={d.driver_id} value={d.driver_id} disabled={Boolean(d.conflict)}>
                {d.full_name} · {[d.vehicle_brand, d.vehicle_model].filter(Boolean).join(' ')}
                {d.vehicle_plate ? ` (${d.vehicle_plate})` : ''}
                {d.conflict ? ` — indisponible : ${d.conflict}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs font-semibold text-neutral-600">
        Prix (F) — vide = {autoPrice.toLocaleString('fr-FR').replace(/,/g, ' ')} F ({hourFcfa} F × {Math.max(hoursNum || 0, minHours)} h)
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" className={inputCls} />
      </label>
      <label className="block text-xs font-semibold text-neutral-600">
        Déjà réglé à TamCar (F) — la location ne peut démarrer qu&apos;une fois soldée
        <input value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="numeric" className={inputCls} />
      </label>

      <label className="block text-xs font-semibold text-neutral-600 md:col-span-2">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
      </label>

      <div className="md:col-span-2">
        {error && <p className="mb-sm text-sm font-semibold text-error">{error}</p>}
        {done && <p className="mb-sm text-sm font-semibold text-success">Location créée et confirmée.</p>}
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-primary-500 px-lg py-sm text-sm font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
        >
          {pending ? 'Création…' : 'Créer la location'}
        </button>
      </div>
    </div>
  );
}
