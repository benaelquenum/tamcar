'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { CheckIcon, PinIcon } from './Icon';

const CATEGORIES = [
  { value: 'restaurant', label: 'Restaurant / bar' },
  { value: 'commerce', label: 'Commerce / marché' },
  { value: 'santé', label: 'Santé (pharmacie, clinique)' },
  { value: 'école', label: 'École / université' },
  { value: 'hôtel', label: 'Hôtel / hébergement' },
  { value: 'transport', label: 'Transport (gare, station)' },
  { value: 'quartier', label: 'Quartier / lieu-dit' },
  { value: 'autre', label: 'Autre' },
];

const CITIES = ['Cotonou', 'Porto-Novo', 'Abomey-Calavi', 'Sèmè-Kpodji', 'Ouidah', 'Autre'];

type Props = {
  open: boolean;
  onClose: () => void;
  initialName?: string;
  center: [number, number]; // [lng, lat] — position confirmée par l'user
  onSuggested: (place: { id: string; name: string; center: [number, number] }) => void;
};

export function SuggestPlaceModal({ open, onClose, initialName = '', center, onSuggested }: Props) {
  const [name, setName] = useState(initialName);
  const [categoryGroup, setCategoryGroup] = useState('autre');
  const [city, setCity] = useState('Cotonou');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { data, error: rpcError } = await supabaseBrowser.rpc('suggest_place', {
      p_name: name.trim(),
      p_category_group: categoryGroup,
      p_city: city,
      p_lng: center[0],
      p_lat: center[1],
    });

    setSubmitting(false);

    if (rpcError) {
      const msg = rpcError.message.includes('Auth required')
        ? 'Connecte-toi pour proposer un lieu.'
        : rpcError.message;
      setError(msg);
      return;
    }

    setSuccess(true);
    onSuggested({
      id: (data as { id: string }).id,
      name: name.trim(),
      center,
    });
    setTimeout(() => {
      onClose();
      setSuccess(false);
      setName('');
    }, 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl">
        <div className="mb-lg flex items-start justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-neutral-900">
              Proposer un lieu
            </h2>
            <p className="mt-xs text-sm text-neutral-600">
              Ton ajout sera visible dès que l&apos;équipe TamCar l&apos;aura validé.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-xs text-neutral-400 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="rounded-lg bg-success/10 p-lg text-center">
            <span className="grid mx-auto mb-md h-10 w-10 place-items-center rounded-full bg-success text-white">
              <CheckIcon className="h-5 w-5" strokeWidth={3} />
            </span>
            <p className="font-bold text-neutral-900">Merci !</p>
            <p className="mt-xs text-sm text-neutral-600">
              Ton lieu est envoyé en modération.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-md">
            <div>
              <label htmlFor="place-name" className="mb-xs block text-sm font-semibold text-neutral-900">
                Nom du lieu
              </label>
              <input
                id="place-name"
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Chez Bella Fidjrossè"
                className="w-full rounded-xl bg-neutral-100 px-lg py-md text-base text-neutral-900 shadow-sm ring-1 ring-neutral-200 transition placeholder:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-md">
              <div>
                <label htmlFor="place-cat" className="mb-xs block text-sm font-semibold text-neutral-900">
                  Catégorie
                </label>
                <select
                  id="place-cat"
                  value={categoryGroup}
                  onChange={(e) => setCategoryGroup(e.target.value)}
                  className="w-full rounded-xl bg-neutral-100 px-md py-md text-sm text-neutral-900 shadow-sm ring-1 ring-neutral-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="place-city" className="mb-xs block text-sm font-semibold text-neutral-900">
                  Ville
                </label>
                <select
                  id="place-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-xl bg-neutral-100 px-md py-md text-sm text-neutral-900 shadow-sm ring-1 ring-neutral-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="rounded-xl bg-primary-50 p-md text-sm text-primary-900">
              <p className="flex items-center gap-xs font-semibold">
                <PinIcon className="h-4 w-4" strokeWidth={2.5} />
                Position confirmée
              </p>
              <p className="mt-xs text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {center[1].toFixed(5)}°N · {center[0].toFixed(5)}°E
              </p>
            </div>

            {error && (
              <div className="rounded-md bg-error/10 p-md text-sm font-medium text-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || name.trim().length < 2}
              className="w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Envoi…' : 'Proposer ce lieu'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
