'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import {
  APPLICATION_TYPE_META,
  formatSlotDay,
  formatSlotFull,
  formatSlotTime,
  slotDayKey,
  slotDayParts,
  slotHour,
  type AvailableSlot,
  type DriverApplicationType,
} from '@/lib/appointment';
import { DocsChecklist } from '../DocsChecklist';

type Prefill = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
};

export function BookingForm({
  slots,
  prefill,
}: {
  slots: AvailableSlot[];
  prefill: Prefill;
}) {
  const router = useRouter();
  const [applicationType, setApplicationType] = useState<DriverApplicationType | null>(null);
  const [firstName, setFirstName] = useState(prefill.first_name);
  const [lastName, setLastName] = useState(prefill.last_name);
  const [phone, setPhone] = useState(prefill.phone);
  const [email, setEmail] = useState(prefill.email);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vue compacte : les jours sont rangés par semaine (une rangée lundi-vendredi) ; toucher un jour déroule ses créneaux
  const [openDay, setOpenDay] = useState<string | null>(null);
  const weeks = useMemo(() => {
    const byDay = new Map<string, AvailableSlot[]>();
    for (const s of slots) {
      const key = slotDayKey(s.slot_at);
      const list = byDay.get(key);
      if (list) list.push(s);
      else byDay.set(key, [s]);
    }
    const byWeek = new Map<string, { key: string; dow: number; slots: AvailableSlot[] }[]>();
    for (const [key, daySlots] of Array.from(byDay.entries())) {
      const d = new Date(`${key}T12:00:00Z`);
      const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      d.setUTCDate(d.getUTCDate() - (dow - 1));
      const monday = d.toISOString().slice(0, 10);
      const list = byWeek.get(monday) ?? [];
      list.push({ key, dow, slots: daySlots });
      byWeek.set(monday, list);
    }
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monday, days]) => ({ monday, days: days.sort((a, b) => a.dow - b.dow) }));
  }, [slots]);

  const canSubmit =
    applicationType !== null &&
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    phone.trim().length >= 8 &&
    selectedSlot !== null &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !applicationType || !selectedSlot) return;
    setSubmitting(true);
    setError(null);

    const { error: rpcError } = await supabaseBrowser.rpc('book_appointment', {
      p_application_type: applicationType,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_phone: phone.trim(),
      p_email: email.trim() || null,
      p_slot_at: selectedSlot,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSubmitting(false);
      return;
    }

    router.push('/devenir-chauffeur/statut');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-xl space-y-lg">
      {/* Formule */}
      <section>
        <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          1. Choisissez votre formule
        </p>
        <div className="mt-md space-y-sm">
          {(['cession', 'proprietaire'] as const).map((t) => {
            const meta = APPLICATION_TYPE_META[t];
            const selected = applicationType === t;
            return (
              <button
                type="button"
                key={t}
                onClick={() => setApplicationType(t)}
                className={`w-full rounded-xl border-2 p-md text-left transition ${
                  selected
                    ? 'border-primary-500 bg-primary-50 shadow-glow'
                    : 'border-neutral-200 bg-white hover:border-primary-300'
                }`}
              >
                <div className="flex items-center justify-between gap-md">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">{meta.label}</p>
                    <p className="text-xs text-neutral-600">{meta.sub}</p>
                    <p className="mt-xs text-[10px] font-semibold text-primary-700">
                      {meta.split}
                    </p>
                  </div>
                  <span
                    className={`grid h-6 w-6 flex-none place-items-center rounded-full border-2 ${
                      selected ? 'border-primary-500 bg-primary-500' : 'border-neutral-300 bg-white'
                    }`}
                  >
                    {selected && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Coordonnées */}
      <section>
        <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          2. Vos coordonnées
        </p>
        <div className="mt-md grid grid-cols-2 gap-sm">
          <Input
            label="Prénom"
            value={firstName}
            onChange={setFirstName}
            required
            placeholder="Jean"
          />
          <Input
            label="Nom"
            value={lastName}
            onChange={setLastName}
            required
            placeholder="ADANDÉ"
          />
        </div>
        <div className="mt-sm">
          <Input
            label="Téléphone"
            value={phone}
            onChange={setPhone}
            required
            type="tel"
            placeholder="+229 XX XX XX XX"
          />
        </div>
        <div className="mt-sm">
          <Input
            label="Email (optionnel)"
            value={email}
            onChange={setEmail}
            type="email"
            placeholder="vous@exemple.com"
          />
        </div>
      </section>

      {/* Créneau */}
      <section>
        <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          3. Choisissez un créneau
        </p>
        <p className="mt-xs text-[10px] text-neutral-500">
          Du lundi au vendredi, de 9h00 à 11h30 puis de 14h00 à 18h00 (heure de Cotonou), par tranches de 30 min. Touchez un
          jour pour voir ses horaires libres.
        </p>

        {weeks.length === 0 ? (
          <div className="mt-md rounded-xl bg-warning/10 p-lg text-center text-sm text-neutral-900">
            Aucun créneau disponible actuellement. Revenez plus tard ou contactez l&apos;équipe.
          </div>
        ) : (
          <div className="mt-md space-y-md">
            {weeks.map(({ monday, days }) => {
              const open = days.find((d) => d.key === openDay);
              const weekMonth = slotDayParts(`${monday}T12:00:00Z`).month;
              return (
                <div key={monday}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Semaine du {slotDayParts(`${monday}T12:00:00Z`).day} {slotDayParts(`${monday}T12:00:00Z`).month}
                  </p>
                  <div className="mt-xs grid grid-cols-5 gap-xs">
                    {days.map((d) => {
                      const parts = slotDayParts(d.slots[0].slot_at);
                      const isOpen = openDay === d.key;
                      const hasChoice = selectedSlot !== null && slotDayKey(selectedSlot) === d.key;
                      return (
                        <button
                          type="button"
                          key={d.key}
                          onClick={() => setOpenDay(isOpen ? null : d.key)}
                          aria-expanded={isOpen}
                          style={{ gridColumnStart: d.dow }}
                          className={`flex flex-col items-center rounded-lg py-xs text-center transition ${
                            hasChoice
                              ? 'bg-primary-500 text-white shadow-glow'
                              : isOpen
                                ? 'bg-primary-50 text-primary-700 ring-2 ring-primary-500'
                                : 'bg-neutral-100 text-neutral-900 hover:bg-primary-100'
                          }`}
                        >
                          <span className="text-[10px] font-semibold uppercase">{parts.weekday}</span>
                          <span className="text-lg font-extrabold leading-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {parts.day}
                          </span>
                          {parts.month !== weekMonth && <span className="text-[10px] font-semibold">{parts.month}</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Créneaux du jour touché, déroulés sous sa semaine */}
                  {open && (
                    <div className="mt-xs rounded-xl bg-neutral-50 p-md ring-1 ring-neutral-200">
                      <p className="text-xs font-bold text-neutral-900 first-letter:uppercase">
                        {formatSlotDay(open.slots[0].slot_at)}
                        <span className="ml-xs font-medium text-neutral-500">
                          · {open.slots.length} créneau{open.slots.length > 1 ? 'x' : ''} libre{open.slots.length > 1 ? 's' : ''}
                        </span>
                      </p>
                      {([['Matin', (h: number) => h < 13], ['Après-midi', (h: number) => h >= 13]] as const).map(([label, inPart]) => {
                        const part = open.slots.filter((s) => inPart(slotHour(s.slot_at)));
                        if (part.length === 0) return null;
                        return (
                          <div key={label} className="mt-sm">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
                            <div className="mt-xs grid grid-cols-4 gap-xs">
                              {part.map((s) => {
                                const selected = selectedSlot === s.slot_at;
                                return (
                                  <button
                                    type="button"
                                    key={s.slot_at}
                                    onClick={() => setSelectedSlot(s.slot_at)}
                                    className={`rounded-lg py-xs text-sm font-semibold transition ${
                                      selected
                                        ? 'bg-primary-500 text-white shadow-glow'
                                        : 'bg-white text-neutral-900 ring-1 ring-neutral-200 hover:bg-primary-100'
                                    }`}
                                    style={{ fontVariantNumeric: 'tabular-nums' }}
                                  >
                                    {formatSlotTime(s.slot_at)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {selectedSlot && (
          <p className="mt-md rounded-xl bg-primary-50 p-md text-sm font-semibold text-primary-700">
            Créneau choisi : {formatSlotFull(selectedSlot)}
          </p>
        )}
      </section>

      {/* Pièces à apporter : visibles au moment de réserver, selon la formule choisie */}
      <section>
        <p className="mb-md text-xs font-bold uppercase tracking-wider text-neutral-500">
          4. Notez les pièces à apporter
        </p>
        <DocsChecklist type={applicationType} title="À apporter le jour du rendez-vous" />
      </section>

      {error && (
        <div className="rounded-xl bg-error/10 p-md text-sm text-error">{error}</div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition disabled:opacity-40 disabled:shadow-none"
      >
        {submitting ? 'Réservation…' : 'Confirmer mon rendez-vous'}
      </button>
    </form>
  );
}

function Input({
  label,
  value,
  onChange,
  required,
  type,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <input
        type={type ?? 'text'}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-xs w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </label>
  );
}
