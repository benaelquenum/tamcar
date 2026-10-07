'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { AddressAutocomplete, type SelectedAddress } from '@/components/AddressAutocomplete';
import { CalendarIcon, CheckIcon, ClockIcon } from '@/components/Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { requestRentalAction } from './actions';

export type RentalRate = {
  /** Tarif de l'heure : appliqué HORS de la plage du forfait journée. */
  hour_fcfa: number;
  /** Forfait d'une journée (plage day_start_hour - day_end_hour). Null = tarif horaire seul. */
  day_fcfa: number | null;
  day_start_hour: number;
  day_end_hour: number;
  min_hours: number;
  max_hours: number;
  km_included_per_day: number;
  km_extra_fcfa: number;
  lead_minutes: number;
};

const HOUR_CHOICES = [4, 8, 12, 15, 24];

type Quote = { days: number; off_hours: number; price_fcfa: number };

function fmtFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

/** Date (yyyy-mm-dd) + heure (hh:mm) saisies à l'heure du Bénin (UTC+1, sans heure d'été). */
function toIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function todayInBenin(): string {
  // Date du jour au Bénin, sans dépendre du fuseau de l'appareil.
  const d = new Date(Date.now() + 60 * 60_000);
  return d.toISOString().slice(0, 10);
}

export function RentalForm({ rate }: { rate: RentalRate }) {
  const dayHours = rate.day_end_hour - rate.day_start_hour;
  const hourChoices = useMemo(
    () => HOUR_CHOICES.filter((h) => h >= rate.min_hours && h <= rate.max_hours),
    [rate.min_hours, rate.max_hours],
  );
  const [date, setDate] = useState('');
  const [time, setTime] = useState('08:00');
  const [hours, setHours] = useState<number>(hourChoices.includes(8) ? 8 : hourChoices[0]);
  const [pickup, setPickup] = useState<SelectedAddress | null>(null);
  const [forSomeone, setForSomeone] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const startsAt = toIso(date, time);
  const [quote, setQuote] = useState<Quote | null>(null);

  // Le prix vient du serveur (mêmes règles que la demande : forfait par journée, heures hors plage).
  useEffect(() => {
    if (!startsAt) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      supabaseBrowser.rpc('rental_quote', { p_starts_at: startsAt, p_hours: hours }).then(({ data, error: err }) => {
        if (cancelled) return;
        const row = (Array.isArray(data) ? data[0] : data) as Quote | undefined;
        setQuote(err || !row ? null : row);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [startsAt, hours]);

  const price = quote?.price_fcfa ?? rate.day_fcfa ?? rate.hour_fcfa * hours;
  const breakdown = quote && rate.day_fcfa != null
    ? [
        quote.days > 0 ? `${quote.days} journée${quote.days > 1 ? 's' : ''} × ${fmtFcfa(rate.day_fcfa)} F` : null,
        quote.off_hours > 0 ? `${quote.off_hours} h hors plage × ${fmtFcfa(rate.hour_fcfa)} F` : null,
      ].filter(Boolean).join(' + ')
    : null;

  function pickFullDay() {
    setTime(`${String(rate.day_start_hour).padStart(2, '0')}:00`);
    setHours(dayHours);
  }

  function submit() {
    setError(null);
    if (!startsAt) return setError('Choisissez la date et l’heure de début.');
    if (new Date(startsAt).getTime() < Date.now() + rate.lead_minutes * 60_000) {
      return setError(`Réservez au moins ${Math.round(rate.lead_minutes / 60)} h à l’avance.`);
    }
    if (!pickup) return setError('Indiquez le lieu de prise en charge.');
    if (forSomeone && (!contactName.trim() || !contactPhone.trim())) {
      return setError('Indiquez le nom et le téléphone de la personne sur place.');
    }
    startTransition(async () => {
      const res = await requestRentalAction({
        starts_at: startsAt,
        hours,
        pickup_address: pickup.place_name,
        pickup_lat: pickup.center[1],
        pickup_lng: pickup.center[0],
        notes: notes.trim() || null,
        contact_name: forSomeone ? contactName.trim() : null,
        contact_phone: forSomeone ? contactPhone.trim() : null,
      });
      if (res && 'error' in res) setError(res.error);
    });
  }

  return (
    <div className="mt-lg space-y-lg">
      <section className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
        <h2 className="flex items-center gap-xs text-sm font-bold text-neutral-900">
          <CalendarIcon className="h-4 w-4 text-violet-700" />
          Quand ?
        </h2>
        <div className="mt-sm grid grid-cols-2 gap-sm">
          <label className="block text-xs font-semibold text-neutral-600">
            Date
            <input
              type="date"
              min={todayInBenin()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-xs w-full rounded-lg border border-neutral-300 px-sm py-sm text-sm text-neutral-900"
            />
          </label>
          <label className="block text-xs font-semibold text-neutral-600">
            Heure de début
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-xs w-full rounded-lg border border-neutral-300 px-sm py-sm text-sm text-neutral-900"
            />
          </label>
        </div>

        <h2 className="mt-md flex items-center gap-xs text-sm font-bold text-neutral-900">
          <ClockIcon className="h-4 w-4 text-violet-700" />
          Combien de temps ?
        </h2>
        {rate.day_fcfa != null && (
          <button
            type="button"
            onClick={pickFullDay}
            className={`mt-sm w-full rounded-xl border-2 px-md py-sm text-left transition ${
              hours === dayHours && time === `${String(rate.day_start_hour).padStart(2, '0')}:00`
                ? 'border-primary-500 bg-primary-50'
                : 'border-neutral-200 bg-white hover:border-primary-300'
            }`}
          >
            <span className="block text-sm font-extrabold text-neutral-900">
              Journée {rate.day_start_hour} h – {rate.day_end_hour} h
            </span>
            <span className="block text-xs text-neutral-600">
              {fmtFcfa(rate.day_fcfa)} F, forfait fixe quelle que soit la durée dans la journée
            </span>
          </button>
        )}
        <div className="mt-sm flex flex-wrap gap-xs">
          {hourChoices.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHours(h)}
              className={`rounded-full px-md py-sm text-sm font-bold transition ${
                hours === h
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
              aria-pressed={hours === h}
            >
              {h} h
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
        <AddressAutocomplete
          label="Lieu de prise en charge"
          placeholder="Hôtel, bureau, domicile…"
          value={pickup}
          onChange={setPickup}
          showLocationButton
        />

        <label className="mt-md flex items-center gap-sm text-sm text-neutral-800">
          <input
            type="checkbox"
            checked={forSomeone}
            onChange={(e) => setForSomeone(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Le véhicule est pour une autre personne
        </label>
        {forSomeone && (
          <div className="mt-sm grid grid-cols-1 gap-sm">
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Nom de la personne sur place"
              className="w-full rounded-lg border border-neutral-300 px-sm py-sm text-sm"
            />
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              inputMode="tel"
              placeholder="Son téléphone"
              className="w-full rounded-lg border border-neutral-300 px-sm py-sm text-sm"
            />
          </div>
        )}

        <label className="mt-md block text-xs font-semibold text-neutral-600">
          Précisions (facultatif)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Programme de la journée, bagages, étapes prévues…"
            className="mt-xs w-full rounded-lg border border-neutral-300 px-sm py-sm text-sm text-neutral-900"
          />
        </label>
      </section>

      <section className="rounded-xl bg-neutral-900 p-md text-white shadow-md">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-white/80">
            VIP avec chauffeur · {hours} h
          </p>
          <p className="text-2xl font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmtFcfa(price)} F
          </p>
        </div>
        {breakdown && <p className="mt-xs text-right text-[11px] text-white/70">{breakdown}</p>}
        <ul className="mt-sm space-y-xs text-xs text-white/80">
          {rate.day_fcfa != null ? (
            <>
              <li className="flex items-start gap-xs">
                <CheckIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-gold-500" strokeWidth={3} />
                Forfait journée {rate.day_start_hour} h – {rate.day_end_hour} h : {fmtFcfa(rate.day_fcfa)} F, même prix
                pour 4 h ou {dayHours} h dans la plage
              </li>
              <li className="flex items-start gap-xs">
                <CheckIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-gold-500" strokeWidth={3} />
                Hors de cette plage : {fmtFcfa(rate.hour_fcfa)} F de l’heure
              </li>
            </>
          ) : (
            <li className="flex items-start gap-xs">
              <CheckIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-gold-500" strokeWidth={3} />
              {fmtFcfa(rate.hour_fcfa)} F de l’heure, minimum {rate.min_hours} h
            </li>
          )}
          <li className="flex items-start gap-xs">
            <CheckIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-gold-500" strokeWidth={3} />
            {rate.km_included_per_day} km inclus par journée ; au-delà {fmtFcfa(rate.km_extra_fcfa)} F le km
          </li>
          <li className="flex items-start gap-xs">
            <CheckIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-gold-500" strokeWidth={3} />
            Carburant à votre charge
          </li>
          <li className="flex items-start gap-xs">
            <CheckIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-gold-500" strokeWidth={3} />
            L’équipe TamCar confirme votre demande et vous présente votre chauffeur
          </li>
        </ul>
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-error/10 px-md py-sm text-sm font-semibold text-error">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-xl bg-primary-500 py-md text-base font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? 'Envoi…' : 'Envoyer la demande'}
      </button>
      <p className="pb-lg text-center text-[11px] text-neutral-500">
        Aucun paiement n’est demandé maintenant. Vous pouvez annuler tant que la location n’a pas commencé.
      </p>
    </div>
  );
}
