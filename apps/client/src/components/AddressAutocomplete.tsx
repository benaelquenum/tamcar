'use client';

import { useEffect, useRef, useState } from 'react';
import { COTONOU_CENTER, geocode, type GeocodeFeature } from '@/lib/mapbox';
import { PinIcon } from './Icon';

export type SelectedAddress = {
  place_name: string;
  center: [number, number];
};

type Props = {
  label: string;
  placeholder: string;
  value: SelectedAddress | null;
  onChange: (value: SelectedAddress | null) => void;
  markerColor?: string;
};

export function AddressAutocomplete({
  label,
  placeholder,
  value,
  onChange,
  markerColor = '#2563EB',
}: Props) {
  const [query, setQuery] = useState(value?.place_name || '');
  const [results, setResults] = useState<GeocodeFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync externe → interne
  useEffect(() => {
    setQuery(value?.place_name || '');
  }, [value]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Ne pas re-geocoder si l'input correspond déjà à une sélection
    if (query === value?.place_name) {
      setResults([]);
      return;
    }
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const features = await geocode(query, COTONOU_CENTER);
      setResults(features);
      setOpen(true);
      setLoading(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, value]);

  return (
    <div className="relative">
      <label className="mb-xs block text-sm font-semibold text-neutral-900">
        {label}
      </label>
      <div className="flex items-center overflow-hidden rounded-xl bg-neutral-100 shadow-sm ring-1 ring-neutral-200 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-primary-500">
        <span
          className="grid h-11 w-11 flex-none place-items-center"
          style={{ color: markerColor }}
        >
          <PinIcon strokeWidth={2.5} />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value) onChange(null);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-md py-lg text-base text-neutral-900 outline-none placeholder:text-neutral-400"
        />
        {loading && (
          <span className="mr-md text-xs text-neutral-400">…</span>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-xs w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-neutral-200">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} /* évite le blur avant click */
                onClick={() => {
                  onChange({ place_name: r.place_name, center: r.center });
                  setQuery(r.place_name);
                  setResults([]);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-md px-md py-md text-left text-sm text-neutral-900 hover:bg-neutral-100"
              >
                <PinIcon className="mt-xs h-4 w-4 flex-none text-neutral-400" strokeWidth={2} />
                <span className="flex-1">{r.place_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
