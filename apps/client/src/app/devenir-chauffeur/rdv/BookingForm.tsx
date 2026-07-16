'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import {
  APPLICATION_TYPE_META,
  formatSlotDay,
  formatSlotTime,
  type AvailableSlot,
  type DriverApplicationType,
} from '@/lib/appointment';

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

  // Groupe les créneaux par jour
  const slotsByDay = useMemo(() => {
    const groups = new Map<string, AvailableSlot[]>();
    for (const s of slots) {
      const dayKey = s.slot_at.slice(0, 10);
      if (!groups.has(dayKey)) groups.set(dayKey, []);
      groups.get(dayKey)!.push(s);
    }
    return Array.from(groups.entries()).slice(0, 20);
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
          1. Choisis ta formule
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
          2. Tes coordonnées
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
            placeholder="tu@exemple.com"
          />
        </div>
      </section>

      {/* Créneau */}
      <section>
        <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          3. Choisis un créneau
        </p>
        <p className="mt-xs text-[10px] text-neutral-500">
          Lun–Ven, tranches de 30 min. Un créneau non affiché est déjà pris.
        </p>

        {slotsByDay.length === 0 ? (
          <div className="mt-md rounded-xl bg-warning/10 p-lg text-center text-sm text-neutral-900">
            Aucun créneau disponible actuellement. Reviens plus tard ou contacte l&apos;équipe.
          </div>
        ) : (
          <div className="mt-md space-y-md">
            {slotsByDay.map(([dayKey, daySlots]) => (
              <div key={dayKey}>
                <p className="text-xs font-semibold uppercase text-neutral-700">
                  {formatSlotDay(daySlots[0].slot_at)}
                </p>
                <div className="mt-xs flex flex-wrap gap-xs">
                  {daySlots.map((s) => {
                    const selected = selectedSlot === s.slot_at;
                    return (
                      <button
                        type="button"
                        key={s.slot_at}
                        onClick={() => setSelectedSlot(s.slot_at)}
                        className={`rounded-lg px-md py-xs text-sm font-semibold transition ${
                          selected
                            ? 'bg-primary-500 text-white shadow-glow'
                            : 'bg-neutral-100 text-neutral-900 hover:bg-primary-100'
                        }`}
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {formatSlotTime(s.slot_at)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
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
