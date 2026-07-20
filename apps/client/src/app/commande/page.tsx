'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AddressAutocomplete, type SelectedAddress } from '@/components/AddressAutocomplete';
import { ArrowRightIcon, CarIcon, SnowflakeIcon, StarIcon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { Map } from '@/components/Map';
import { SuggestPlaceModal } from '@/components/SuggestPlaceModal';
import { getRoute, reverseGeocode, type RouteResult } from '@/lib/mapbox';
import { computePrice, type PriceQuote, type VehicleCategory } from '@/lib/pricing';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { isWithinServiceZone, SERVICE_ZONE_LABEL } from '@/lib/service-zone';
import { createRideAction } from './actions';

type AvailabilityRow = {
  category: VehicleCategory;
  online_count: number;
  nearest_driver_distance_m: number | null;
  eta_min: number | null;
};

type CategoryDef = {
  id: VehicleCategory;
  name: string;
  tagline: string;
  badge?: string;
};

const CATEGORIES: CategoryDef[] = [
  { id: 'moto', name: 'Moto', tagline: 'Rapide, éco, zémidjan formalisé' },
  { id: 'tricycle', name: 'Tricycle', tagline: 'Kloboto confortable à petit prix' },
  { id: 'essentiel', name: 'Essentiel', tagline: 'Voiture éco sans surprise' },
  { id: 'confort', name: 'Confort', tagline: 'Voiture premium clim incluse', badge: 'Best-seller' },
];

function formatFcfa(n: number | undefined | null): string {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

type PickingMode = 'pickup' | 'dropoff' | 'suggest' | null;

function minScheduledLocal(): string {
  // now() + 20 min, formaté YYYY-MM-DDTHH:MM (local) pour <input type="datetime-local">
  const d = new Date(Date.now() + 20 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CommandePage() {
  const searchParams = useSearchParams();
  const isScheduled = searchParams.get('scheduled') === '1';

  const [pickup, setPickup] = useState<SelectedAddress | null>(null);
  const [dropoff, setDropoff] = useState<SelectedAddress | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string>(isScheduled ? minScheduledLocal() : '');
  const [prices, setPrices] = useState<Record<VehicleCategory, PriceQuote | null>>(
    {} as Record<VehicleCategory, PriceQuote | null>,
  );
  const [availability, setAvailability] = useState<Record<VehicleCategory, AvailabilityRow | null>>(
    {} as Record<VehicleCategory, AvailabilityRow | null>,
  );
  const [selectedCat, setSelectedCat] = useState<VehicleCategory>('essentiel');
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
          with_ac: false,
          scheduled_at: isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
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

      const quotes = await Promise.all(
        CATEGORIES.map((c) =>
          computePrice({
            pickup_lat: pickup.center[1], pickup_lng: pickup.center[0],
            dropoff_lat: dropoff.center[1], dropoff_lng: dropoff.center[0],
            distance_km: r.distance_km, duration_min: r.duration_min,
            p_category: c.id,
          }),
        ),
      );

      if (cancelled) return;
      const byId = {} as Record<VehicleCategory, PriceQuote | null>;
      CATEGORIES.forEach((c, i) => { byId[c.id] = quotes[i]; });
      setPrices(byId);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [pickup, dropoff]);

  // Dispo chauffeurs par catégorie autour du pickup — refresh toutes les 30 s
  useEffect(() => {
    if (!pickup) {
      setAvailability({} as Record<VehicleCategory, AvailabilityRow | null>);
      return;
    }
    let cancelled = false;

    async function fetchAvailability() {
      const { data } = await supabaseBrowser.rpc('drivers_availability_by_category', {
        p_lat: pickup!.center[1],
        p_lng: pickup!.center[0],
        p_radius_km: 10,
      });
      if (cancelled || !Array.isArray(data)) return;
      const byId = {} as Record<VehicleCategory, AvailabilityRow | null>;
      for (const row of data as AvailabilityRow[]) {
        byId[row.category] = row;
      }
      setAvailability(byId);
    }

    fetchAvailability();
    const interval = setInterval(fetchAvailability, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [pickup]);

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

        {(() => {
          const pickupOut = pickup ? !isWithinServiceZone(pickup.center[1], pickup.center[0]) : false;
          const dropoffOut = dropoff ? !isWithinServiceZone(dropoff.center[1], dropoff.center[0]) : false;
          if (!pickupOut && !dropoffOut) return null;
          return (
            <section className="mt-md rounded-xl border border-error/30 bg-error/10 p-md text-sm text-error">
              <p className="font-bold">Hors zone de service</p>
              <p className="mt-xs text-xs">
                TamCar couvre actuellement <strong>{SERVICE_ZONE_LABEL}</strong> uniquement.
                {pickupOut && ' Ton point de départ est hors zone.'}
                {dropoffOut && ' Ta destination est hors zone.'}
              </p>
            </section>
          );
        })()}

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

        {route && (() => {
          const pickupOut = pickup ? !isWithinServiceZone(pickup.center[1], pickup.center[0]) : false;
          const dropoffOut = dropoff ? !isWithinServiceZone(dropoff.center[1], dropoff.center[0]) : false;
          const outOfZone = pickupOut || dropoffOut;
          return (
          <>
            <section className="mt-lg rounded-xl bg-primary-50 p-md text-sm text-primary-900">
              <span className="font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {route.distance_km.toFixed(1)} km
              </span>
              &nbsp;·&nbsp;{route.duration_min} min estimés
              {loading && <span className="ml-md text-primary-500">Calcul du prix…</span>}
            </section>

            {outOfZone && (
              <section className="mt-lg rounded-xl border border-error/30 bg-error/10 p-md text-sm text-error">
                <p className="font-bold">Hors zone de service</p>
                <p className="mt-xs text-xs">
                  TamCar couvre actuellement <strong>{SERVICE_ZONE_LABEL}</strong> uniquement.
                  {pickupOut && ' Ton point de départ est hors zone.'}
                  {dropoffOut && ' Ta destination est hors zone.'}
                </p>
              </section>
            )}

            <section className="mt-lg space-y-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                Choisis ta catégorie
              </p>
              {CATEGORIES.map((cat) => (
                <CategoryChoice
                  key={cat.id}
                  category={cat}
                  price={prices[cat.id] ?? null}
                  availability={availability[cat.id] ?? null}
                  selected={selectedCat === cat.id}
                  onSelect={() => setSelectedCat(cat.id)}
                  climateLabel={
                    cat.id === 'confort' ? 'Clim incluse'
                    : cat.id === 'moto' ? '2 places max'
                    : cat.id === 'tricycle' ? '3 places · plein air'
                    : 'Sans clim'
                  }
                />
              ))}

            </section>

            {isScheduled && (
              <section className="mt-lg rounded-xl bg-violet-500/10 p-md ring-1 ring-violet-500/30">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
                    Date & heure de départ
                  </span>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    min={minScheduledLocal()}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="mt-xs w-full rounded-lg bg-white px-md py-sm text-sm font-semibold text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </label>
                <p className="mt-xs text-[11px] text-neutral-600">
                  Réservation min. 15 min à l&apos;avance, jusqu&apos;à 30 jours.
                </p>
              </section>
            )}

            <section className="mt-lg">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading || confirming || !prices[selectedCat] || outOfZone || (isScheduled && !scheduledAt)}
                className="flex w-full items-center justify-center gap-sm rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CarIcon className="h-5 w-5" />
                {confirming
                  ? 'Envoi de la course…'
                  : isScheduled
                    ? `Réserver · ${formatFcfa(prices[selectedCat]?.price_total_fcfa)} FCFA`
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
          );
        })()}

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
  category, price, availability, selected, onSelect, climateLabel,
}: {
  category: CategoryDef;
  price: PriceQuote | null;
  availability: AvailabilityRow | null;
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
        {availability && (
          <p className="mt-xs inline-flex items-center gap-xs text-[11px] font-semibold">
            {availability.online_count > 0 ? (
              <>
                <span className="relative grid h-1.5 w-1.5 place-items-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-500/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-500" />
                </span>
                <span className="text-primary-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {availability.online_count} dispo
                  {availability.eta_min != null ? ` · ~${availability.eta_min} min` : ''}
                </span>
              </>
            ) : (
              <span className="text-neutral-400">Aucun chauffeur à proximité</span>
            )}
          </p>
        )}
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
