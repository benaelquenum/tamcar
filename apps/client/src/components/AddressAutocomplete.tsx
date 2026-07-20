'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BENIN_POPULAR_PLACES,
  COTONOU_CENTER,
  geocode,
  popularPlaceToFeature,
  reverseGeocode as mapboxReverseGeocode,
  type GeocodeFeature,
} from '@/lib/mapbox';
import { useT } from '@/lib/i18n-client';
import {
  fetchRecentAddresses,
  placeToFeature,
  recentToFeature,
  searchPlaces,
  type RecentAddress,
} from '@/lib/places';
import {
  googlePlacesSearch,
  googlePlacesConfigured,
  googleReverseGeocode,
} from '@/lib/google-places';
import { CheckIcon, CrosshairIcon, PinIcon } from './Icon';

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
  showLocationButton?: boolean;
  /** Callback pour demander au parent d'entrer en mode "choisir sur la carte" ciblé sur ce champ */
  onPickOnMap?: () => void;
  /** Callback pour demander au parent d'ouvrir le modal "Suggérer un lieu" avec le query saisi */
  onSuggestPlace?: (query: string) => void;
};

function truncateChip(s: string): string {
  const noBenin = s.replace(/, Bénin$/i, '');
  if (noBenin.length <= 28) return noBenin;
  return noBenin.slice(0, 26) + '…';
}

export function AddressAutocomplete({
  label,
  placeholder,
  value,
  onChange,
  markerColor = '#2563EB',
  showLocationButton = false,
  onPickOnMap,
  onSuggestPlace,
}: Props) {
  const t = useT();
  const [query, setQuery] = useState(value?.place_name || '');
  const [results, setResults] = useState<
    Array<GeocodeFeature & { origin: 'tamcar' | 'google' | 'mapbox'; verified?: boolean }>
  >([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [geolocating, setGeolocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentAddress[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load derniers lieux du user (async, une fois)
  useEffect(() => {
    fetchRecentAddresses(6).then(setRecents);
  }, []);

  useEffect(() => {
    setQuery(value?.place_name || '');
  }, [value]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

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
      // 1. Priorité : notre base TamCar (POI Bénin curatés + OSM enrichis)
      const local = await searchPlaces(query, COTONOU_CENTER, 8);
      const localFeatures = local.map((p) => ({
        ...placeToFeature(p),
        origin: 'tamcar' as const,
        verified: p.verified,
      }));

      // 2. Fallback : Google Places (New) si configuré — meilleur sur POI Bénin.
      //    Sinon Mapbox comme avant.
      let combined = localFeatures;
      if (localFeatures.length < 5) {
        const seenIds = new Set(localFeatures.map((f) => f.id));
        if (googlePlacesConfigured()) {
          const google = await googlePlacesSearch(query, COTONOU_CENTER, 8);
          const googleFeatures = google
            .filter((f) => !seenIds.has(f.id))
            .map((f) => ({ ...f, origin: 'google' as const, verified: false }));
          combined = [...localFeatures, ...googleFeatures].slice(0, 8);
        } else {
          const mapbox = await geocode(query, COTONOU_CENTER);
          const mapboxFeatures = mapbox
            .filter((f) => !seenIds.has(f.id))
            .map((f) => ({ ...f, origin: 'mapbox' as const, verified: false }));
          combined = [...localFeatures, ...mapboxFeatures].slice(0, 8);
        }
      }

      setResults(combined);
      setOpen(true);
      setLoading(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, value]);

  async function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setGeoError('Géolocalisation non supportée par ce navigateur');
      return;
    }
    setGeolocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { longitude, latitude } = pos.coords;
        const feature =
          (googlePlacesConfigured() ? await googleReverseGeocode(longitude, latitude) : null) ||
          (await mapboxReverseGeocode(longitude, latitude));
        const selected: SelectedAddress = feature
          ? { place_name: feature.place_name, center: feature.center }
          : {
              place_name: `Ma position (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
              center: [longitude, latitude],
            };
        onChange(selected);
        setQuery(selected.place_name);
        setResults([]);
        setOpen(false);
        setGeolocating(false);
      },
      (err) => {
        setGeolocating(false);
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Autorise la géolocalisation dans ton navigateur pour utiliser cette fonction.'
            : 'Impossible de récupérer ta position (GPS indisponible).';
        setGeoError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  function selectPlace(f: GeocodeFeature) {
    onChange({ place_name: f.place_name, center: f.center });
    setQuery(f.place_name);
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="mb-xs flex items-center justify-between gap-xs">
        <label className="text-sm font-semibold text-neutral-900">{label}</label>
        <div className="flex items-center gap-xs">
          {onPickOnMap && (
            <button
              type="button"
              onClick={onPickOnMap}
              className="inline-flex items-center gap-xs rounded-full bg-neutral-100 px-md py-xs text-xs font-bold text-neutral-700 transition hover:bg-neutral-200"
              title="Poser le point sur la carte"
            >
              <PinIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
              {t('commande.on_map')}
            </button>
          )}
          {showLocationButton && (
            <button
              type="button"
              onClick={useMyLocation}
              disabled={geolocating}
              className="inline-flex items-center gap-xs rounded-full bg-primary-50 px-md py-xs text-xs font-bold text-primary-700 transition hover:bg-primary-100 disabled:opacity-50"
            >
              <CrosshairIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
              {geolocating ? '…' : t('commande.my_position')}
            </button>
          )}
        </div>
      </div>

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
        {loading && <span className="mr-md text-xs text-neutral-400">…</span>}
      </div>

      {geoError && (
        <p className="mt-xs text-xs text-error">{geoError}</p>
      )}

      {/* Chips raccourcis : d'abord les récents du user, sinon fallback lieux populaires */}
      {!value && !open && (
        <div className="mt-md">
          {recents.length > 0 ? (
            <>
              <p className="mb-xs text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                {t('commande.recents')}
              </p>
              <div className="flex flex-wrap gap-xs">
                {recents.map((r) => (
                  <button
                    key={r.address}
                    type="button"
                    onClick={() => selectPlace(recentToFeature(r))}
                    className="rounded-full bg-primary-50 px-md py-xs text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                    title={r.address}
                  >
                    {truncateChip(r.address)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="mb-xs text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Lieux populaires
              </p>
              <div className="flex flex-wrap gap-xs">
                {BENIN_POPULAR_PLACES.slice(0, 10).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPlace(popularPlaceToFeature(p))}
                    className="rounded-full bg-neutral-100 px-md py-xs text-xs font-semibold text-neutral-900 transition hover:bg-primary-100 hover:text-primary-700"
                  >
                    {p.short}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Suggestions autocomplete Mapbox */}
      {open && (results.length > 0 || (query.trim().length >= 2 && onSuggestPlace)) && (
        <ul className="absolute z-20 mt-xs w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-neutral-200">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectPlace(r)}
                className="flex w-full items-start gap-md px-md py-md text-left text-sm text-neutral-900 hover:bg-neutral-100"
              >
                <PinIcon
                  className="mt-xs h-4 w-4 flex-none text-neutral-400"
                  strokeWidth={2}
                />
                <span className="flex-1">{r.place_name}</span>
                {r.verified && (
                  <span
                    className="mt-xs inline-flex items-center gap-xs rounded-full bg-primary-100 px-xs py-0.5 text-[10px] font-bold text-primary-700"
                    title="Lieu vérifié par TamCar"
                  >
                    <CheckIcon className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                )}
                {r.origin === 'google' && !r.verified && (
                  <span className="mt-xs text-[10px] font-medium text-neutral-400">
                    Google
                  </span>
                )}
                {r.origin === 'mapbox' && !r.verified && (
                  <span className="mt-xs text-[10px] font-medium text-neutral-400">
                    Mapbox
                  </span>
                )}
              </button>
            </li>
          ))}
          {onSuggestPlace && query.trim().length >= 2 && (
            <li className="border-t border-neutral-200 bg-neutral-100/50">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSuggestPlace(query.trim())}
                className="flex w-full items-center gap-md px-md py-md text-left text-sm font-semibold text-primary-700 hover:bg-primary-50"
              >
                <span className="grid h-4 w-4 place-items-center rounded-full bg-primary-500 text-white">
                  <span className="text-[10px] leading-none">＋</span>
                </span>
                <span className="flex-1">
                  Ajouter « {query.trim()} » à TamCar
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
