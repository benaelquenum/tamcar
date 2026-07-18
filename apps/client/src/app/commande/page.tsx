'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { AddressAutocomplete, type SelectedAddress } from '@/components/AddressAutocomplete';
import { ArrowRightIcon, CarIcon, SnowflakeIcon, StarIcon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { Map } from '@/components/Map';
import { SuggestPlaceModal } from '@/components/SuggestPlaceModal';
import { getRoute, reverseGeocode, type RouteResult } from '@/lib/mapbox';
import { computePrice, type PriceQuote, type VehicleCategory } from '@/lib/pricing';
import { createRideAction } from './actions';

type CategoryDef = {
  id: VehicleCategory;
  name: string;
  tagline: string;
  badge?: string;
};

const CATEGORIES: CategoryDef[] = [
  { id: 'essentiel', name: 'Essentiel', tagline: 'Ta course sans surprise' },
  { id: 'confort', name: 'Confort', tagline: 'Le voyage sans compromis', badge: 'Best-seller' },
];

function formatFcfa(n: number | undefined | null): string {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

type PickingMode = 'pickup' | 'dropoff' | 'suggest' | null;

export default function CommandePage() {
  const [pickup, setPickup] = useState<SelectedAddress | null>(null);
  const [dropoff, setDropoff] = useState<SelectedAddress | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [prices, setPrices] = useState<Record<VehicleCategory, PriceQuote | null>>(
    {} as Record<VehicleCategory, PriceQuote | null>,
  );
  const [selectedCat, setSelectedCat] = useState<VehicleCategory>('essentiel');
  const [withAc, setWithAc] = useState(false);
  const [loading, setLoading] = useState(false);

  // Mode sélection sur carte
  const [pickingMode, setPickingMode] = useState<PickingMode>(null);
  const [candidate, setCandidate] = useState<[number, number] | null>(null);

  // Modal Suggest place
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestInitialName, setSuggestInitialName] = useState('');
  const [suggestCenter, setSuggestCenter] = useState<[number, number] | null>(null);

  // Confirmation ride (server action + redirect)
  const [confirming, startConfirm] = useTransition();
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function handleConfirm() {
    if (!pickup || !dropoff || !route || !prices[selectedCat]) return;
    setConfirmError(null);
    startConfirm(async () => {
      try {
        await createRideAction({
          category: selectedCat,
          pickup_lat: pickup.center[1],
          pickup_lng: pickup.center[0],
          pickup_address: pickup.place_name,
          dropoff_lat: dropoff.center[1],
          dropoff_lng: dropoff.center[0],
          dropoff_address: dropoff.place_name,
          distance_km: route.distance_km,
          duration_min: route.duration_min,
          is_night: false,
          with_ac: selectedCat === 'essentiel' && withAc,
        });
      } catch (e) {
        setConfirmError(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  useEffect(() => {
    if (!pickup || !dropoff) {
      setRoute(null);
      setPrices({} as Record<VehicleCategory, PriceQuote | null>);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const r = await getRoute(pickup.center, dropoff.center);
      if (cancelled) return;
      setRoute(r);

      if (!r) {
        setPrices({} as Record<VehicleCategory, PriceQuote | null>);
        setLoading(false);
        return;
      }

      const [essentiel, confort] = await Promise.all([
        computePrice({
          pickup_lat: pickup.center[1], pickup_lng: pickup.center[0],
          dropoff_lat: dropoff.center[1], dropoff_lng: dropoff.center[0],
          distance_km: r.distance_km, duration_min: r.duration_min,
          p_category: 'essentiel',
          with_ac: withAc,
        }),
        computePrice({
          pickup_lat: pickup.center[1], pickup_lng: pickup.center[0],
          dropoff_lat: dropoff.center[1], dropoff_lng: dropoff.center[0],
          distance_km: r.distance_km, duration_min: r.duration_min,
          p_category: 'confort',
        }),
      ]);

      if (cancelled) return;
      setPrices({ essentiel, confort } as Record<VehicleCategory, PriceQuote | null>);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [pickup, dropoff, withAc]);

  async function handleMapClick(lngLat: [number, number]) {
    // Debug clic carte — visible dans F12 console si Terence a un souci
    // eslint-disable-next-line no-console
    console.log('[map click]', { lngLat, pickingMode });
    if (!pickingMode) return;

    const target = pickingMode; // capture avant l'await pour éviter une race si l'user annule
    setCandidate(lngLat);
    const feature = await reverseGeocode(lngLat[0], lngLat[1]);
    // eslint-disable-next-line no-console
    console.log('[reverseGeocode result]', feature);
    const place: SelectedAddress = feature
      ? { place_name: feature.place_name, center: feature.center }
      : {
          place_name: `Point sur la carte (${lngLat[1].toFixed(4)}, ${lngLat[0].toFixed(4)})`,
          center: lngLat,
        };

    if (target === 'pickup') {
      setPickup(place);
      setPickingMode(null);
      setCandidate(null);
    } else if (target === 'dropoff') {
      setDropoff(place);
      setPickingMode(null);
      setCandidate(null);
    } else if (target === 'suggest') {
      setSuggestCenter(lngLat);
      setSuggestOpen(true);
      setPickingMode(null);
    }
    // Scroll doux vers le champ concerné pour que le user voie que sa
    // sélection a été prise en compte
    if (target === 'pickup' || target === 'dropoff') {
      setTimeout(() => {
        document.querySelector('input[type="text"]')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
    }
  }

  function startSuggest(query: string) {
    setSuggestInitialName(query);
    // Point par défaut = milieu de la carte / route existante / Cotonou
    const defaultCenter: [number, number] =
      pickup?.center ?? dropoff?.center ?? [2.42, 6.36];
    setSuggestCenter(defaultCenter);
    setSuggestOpen(true);
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-64 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-70 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <Link
            href="/"
            aria-label="Retour à l'accueil"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
        </header>

        <h1 className="mt-lg text-2xl font-extrabold leading-tight text-neutral-900">
          Où allez-vous ?
        </h1>

        <section className="mt-lg space-y-md">
          <AddressAutocomplete
            label="Départ"
            placeholder="Adresse ou lieu de départ"
            value={pickup}
            onChange={setPickup}
            markerColor="#2563EB"
            showLocationButton
            onPickOnMap={() => setPickingMode('pickup')}
            onSuggestPlace={startSuggest}
          />
          <AddressAutocomplete
            label="Destination"
            placeholder="Où voulez-vous aller ?"
            value={dropoff}
            onChange={setDropoff}
            markerColor="#8B5CF6"
            onPickOnMap={() => setPickingMode('dropoff')}
            onSuggestPlace={startSuggest}
          />
        </section>

        {pickingMode && (
          <div className="mt-md flex items-center justify-between gap-md rounded-xl bg-primary-50 p-md text-sm ring-1 ring-primary-200">
            <span className="font-semibold text-neutral-900">
              Touchez la carte pour poser votre point de{' '}
              {pickingMode === 'pickup' ? 'départ' : pickingMode === 'dropoff' ? 'destination' : 'lieu à proposer'}.
            </span>
            <button
              type="button"
              onClick={() => { setPickingMode(null); setCandidate(null); }}
              className="rounded-full bg-white px-md py-xs text-xs font-bold text-neutral-900 shadow-sm"
            >
              Annuler
            </button>
          </div>
        )}

        <section className="mt-lg">
          <Map
            pickup={pickup?.center ?? null}
            dropoff={dropoff?.center ?? null}
            route={route?.geometry ?? null}
            candidate={candidate}
            onMapClick={pickingMode ? handleMapClick : undefined}
            className="h-64 w-full rounded-xl bg-neutral-100 shadow-sm ring-1 ring-neutral-200"
          />
        </section>

        {route && (
          <>
            <section className="mt-lg rounded-xl bg-primary-50 p-md text-sm text-primary-900">
              <span className="font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {route.distance_km.toFixed(1)} km
              </span>
              &nbsp;·&nbsp;{route.duration_min} min estimés
              {loading && <span className="ml-md text-primary-500">Calcul du prix…</span>}
            </section>

            <section className="mt-lg space-y-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                Choisis ta catégorie
              </p>
              {CATEGORIES.map((cat) => (
                <CategoryChoice
                  key={cat.id}
                  category={cat}
                  price={prices[cat.id] ?? null}
                  selected={selectedCat === cat.id}
                  onSelect={() => setSelectedCat(cat.id)}
                  climateLabel={
                    cat.id === 'essentiel'
                      ? withAc
                        ? 'Clim ajoutée'
                        : 'Sans clim (option)'
                      : 'Clim incluse'
                  }
                />
              ))}

              {/* Toggle climatisation — visible seulement quand Essentiel sélectionné */}
              {selectedCat === 'essentiel' && (
                <button
                  type="button"
                  onClick={() => setWithAc((v) => !v)}
                  className={`flex w-full items-center gap-md rounded-xl border-2 p-md text-left transition ${
                    withAc
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-neutral-200 bg-white hover:border-cyan-300'
                  }`}
                >
                  <span
                    className={`grid h-11 w-11 flex-none place-items-center rounded-lg transition ${
                      withAc ? 'bg-cyan-500 text-white shadow-md' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    <SnowflakeIcon className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-neutral-900">
                      {withAc ? 'Climatisation activée' : 'Ajouter la climatisation'}
                    </p>
                    <p className="text-[11px] text-neutral-600">
                      40 FCFA par km · 200 FCFA minimum
                    </p>
                  </div>
                  <span
                    className={`grid h-6 w-11 flex-none items-center rounded-full p-0.5 transition ${
                      withAc ? 'bg-cyan-500' : 'bg-neutral-300'
                    }`}
                  >
                    <span
                      className={`block h-5 w-5 rounded-full bg-white shadow transition ${
                        withAc ? 'translate-x-5' : ''
                      }`}
                    />
                  </span>
                </button>
              )}
            </section>

            <section className="mt-lg">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading || confirming || !prices[selectedCat]}
                className="flex w-full items-center justify-center gap-sm rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CarIcon className="h-5 w-5" />
                {confirming
                  ? 'Envoi de la course…'
                  : `Confirmer la course · ${formatFcfa(prices[selectedCat]?.price_total_fcfa)} FCFA`}
                {!confirming && <ArrowRightIcon />}
              </button>
              {confirmError && (
                <p className="mt-md text-center text-sm font-medium text-error">
                  {confirmError}
                </p>
              )}
              <p className="mt-md text-center text-[11px] text-neutral-400">
                Prochaine étape : matching chauffeur automatique (à venir)
              </p>
            </section>
          </>
        )}

        <div className="h-2xl" />
      </div>

      {suggestOpen && suggestCenter && (
        <SuggestPlaceModal
          open={suggestOpen}
          onClose={() => { setSuggestOpen(false); setCandidate(null); }}
          initialName={suggestInitialName}
          center={suggestCenter}
          onSuggested={() => {
            /* Le lieu est en attente de modération — on ne l'utilise pas encore comme address */
          }}
        />
      )}
    </main>
  );
}

function CategoryChoice({
  category, price, selected, onSelect, climateLabel,
}: {
  category: CategoryDef;
  price: PriceQuote | null;
  selected: boolean;
  onSelect: () => void;
  climateLabel: string;
}) {
  const climateTint =
    category.id === 'confort' || climateLabel === 'Clim ajoutée'
      ? 'text-cyan-500'
      : 'text-neutral-500';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-xl border-2 p-md text-left transition ${
        selected
          ? 'border-primary-500 bg-primary-50 shadow-md'
          : 'border-neutral-200 bg-white hover:border-primary-300'
      }`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-xs">
          <p className="font-bold text-neutral-900">TamCar {category.name}</p>
          {category.badge && (
            <span className="inline-flex items-center gap-xs rounded-full bg-primary-500 px-sm py-0.5 text-[10px] font-bold text-white">
              <StarIcon className="h-2.5 w-2.5" />
              {category.badge}
            </span>
          )}
        </div>
        <p className="mt-xs text-xs text-neutral-600">{category.tagline}</p>
        <p className={`mt-xs inline-flex items-center gap-xs text-[11px] font-semibold ${climateTint}`}>
          <SnowflakeIcon className="h-3 w-3" strokeWidth={2.5} />
          {climateLabel}
        </p>
        {price?.is_corridor && (
          <p className="mt-xs text-xs font-semibold text-primary-500">
            Prix fixe corridor
          </p>
        )}
      </div>
      <p
        className="text-xl font-extrabold text-neutral-900"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {formatFcfa(price?.price_total_fcfa)}
        <span className="ml-xs text-xs font-medium text-neutral-600">FCFA</span>
      </p>
    </button>
  );
}
