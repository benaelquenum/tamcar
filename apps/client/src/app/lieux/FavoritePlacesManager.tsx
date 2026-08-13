'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddressAutocomplete, type SelectedAddress } from '@/components/AddressAutocomplete';
import {
  BriefcaseIcon,
  CheckIcon,
  HomeIcon,
  StarIcon,
} from '@/components/Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { FavoritePlace } from '@/components/QuickDestinations';

const KINDS = [
  { id: 'home' as const, label: 'Maison', Icon: HomeIcon },
  { id: 'work' as const, label: 'Travail', Icon: BriefcaseIcon },
  { id: 'other' as const, label: 'Autre', Icon: StarIcon },
];

export function FavoritePlacesManager({
  initial,
  initialKind,
}: {
  initial: FavoritePlace[];
  initialKind: 'home' | 'work' | 'other';
}) {
  const router = useRouter();
  const [places, setPlaces] = useState(initial);
  const [kind, setKind] = useState<'home' | 'work' | 'other'>(initialKind);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState<SelectedAddress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const { data } = await supabaseBrowser.rpc('my_favorite_places');
    setPlaces(Array.isArray(data) ? (data as FavoritePlace[]) : []);
    router.refresh();
  }

  async function handleSave() {
    if (!address) {
      setError('Choisissez une adresse.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabaseBrowser.rpc('save_favorite_place', {
      p_kind: kind,
      p_label: kind === 'other' ? label.trim() || address.place_name : null,
      p_address: address.place_name,
      p_lat: address.center[1],
      p_lng: address.center[0],
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setAddress(null);
    setLabel('');
    await reload();
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce lieu enregistré ?')) return;
    setBusy(true);
    const { error: err } = await supabaseBrowser.rpc('delete_favorite_place', { p_id: id });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    await reload();
  }

  return (
    <>
      <section className="mt-lg rounded-xl bg-white p-md shadow-sm ring-1 ring-neutral-200">
        <h2 className="text-sm font-bold text-neutral-900">Ajouter un lieu</h2>

        <div className="mt-md flex gap-xs">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={`flex flex-1 flex-col items-center gap-xs rounded-lg border-2 py-sm text-[11px] font-bold transition ${
                kind === k.id
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-neutral-200 bg-white text-neutral-500'
              }`}
            >
              <k.Icon className="h-4 w-4" />
              {k.label}
            </button>
          ))}
        </div>

        {kind === 'other' && (
          <label className="mt-md block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Nom du lieu
            </span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Bibliothèque, salle de sport…"
              maxLength={40}
              className="mt-xs w-full rounded-lg bg-white px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
        )}

        <div className="mt-md">
          <AddressAutocomplete
            label="Adresse"
            placeholder="Rechercher un lieu…"
            value={address}
            onChange={setAddress}
            showLocationButton
          />
        </div>

        {error && (
          <p className="mt-md rounded-lg bg-error/10 p-sm text-xs font-semibold text-error">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !address}
          className="mt-md flex w-full items-center justify-center gap-xs rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:opacity-50"
        >
          <CheckIcon className="h-4 w-4" strokeWidth={3} />
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>

        {kind !== 'other' && (
          <p className="mt-sm text-[11px] text-neutral-500">
            Vous ne pouvez avoir qu&apos;une maison et qu&apos;un lieu de travail :
            enregistrer remplace le précédent.
          </p>
        )}
      </section>

      <section className="mt-lg">
        <h2 className="mb-sm text-xs font-bold uppercase tracking-wider text-neutral-500">
          Mes lieux ({places.length})
        </h2>
        {places.length === 0 ? (
          <p className="rounded-xl bg-neutral-100 p-lg text-center text-sm text-neutral-600">
            Aucun lieu enregistré pour l&apos;instant.
          </p>
        ) : (
          <ul className="space-y-sm">
            {places.map((p) => {
              const K = KINDS.find((k) => k.id === p.kind) ?? KINDS[2];
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-sm rounded-xl border border-neutral-200 bg-white p-md"
                >
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-primary-50 text-primary-700">
                    <K.Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-neutral-900">
                      {p.label}
                    </span>
                    <span className="block truncate text-[11px] text-neutral-500">
                      {p.address}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    disabled={busy}
                    className="flex-none rounded-lg px-sm py-xs text-[11px] font-bold text-error disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
