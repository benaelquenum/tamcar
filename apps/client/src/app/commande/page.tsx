'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AddressAutocomplete, type SelectedAddress } from '@/components/AddressAutocomplete';
import { ArrowRightIcon, CarIcon, StarIcon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { Map } from '@/components/Map';
import { getRoute, type RouteResult } from '@/lib/mapbox';
import { computePrice, type PriceQuote, type VehicleCategory } from '@/lib/pricing';

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

export default function CommandePage() {
  const [pickup, setPickup] = useState<SelectedAddress | null>(null);
  const [dropoff, setDropoff] = useState<SelectedAddress | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [prices, setPrices] = useState<Record<VehicleCategory, PriceQuote | null>>(
    {} as Record<VehicleCategory, PriceQuote | null>,
  );
  const [selectedCat, setSelectedCat] = useState<VehicleCategory>('essentiel');
  const [loading, setLoading] = useState(false);

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
          pickup_lat: pickup.center[1],
          pickup_lng: pickup.center[0],
          dropoff_lat: dropoff.center[1],
          dropoff_lng: dropoff.center[0],
          distance_km: r.distance_km,
          duration_min: r.duration_min,
          p_category: 'essentiel',
        }),
        computePrice({
          pickup_lat: pickup.center[1],
          pickup_lng: pickup.center[0],
          dropoff_lat: dropoff.center[1],
          dropoff_lng: dropoff.center[0],
          distance_km: r.distance_km,
          duration_min: r.duration_min,
          p_category: 'confort',
        }),
      ]);

      if (cancelled) return;
      setPrices({ essentiel, confort } as Record<VehicleCategory, PriceQuote | null>);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff]);

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
          />
          <AddressAutocomplete
            label="Destination"
            placeholder="Où voulez-vous aller ?"
            value={dropoff}
            onChange={setDropoff}
            markerColor="#8B5CF6"
          />
        </section>

        <section className="mt-lg">
          <Map
            pickup={pickup?.center ?? null}
            dropoff={dropoff?.center ?? null}
            route={route?.geometry ?? null}
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
                />
              ))}
            </section>

            <section className="mt-lg">
              <button
                type="button"
                disabled={loading || !prices[selectedCat]}
                className="flex w-full items-center justify-center gap-sm rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CarIcon className="h-5 w-5" />
                Confirmer la course · {formatFcfa(prices[selectedCat]?.price_total_fcfa)} FCFA
                <ArrowRightIcon />
              </button>
              <p className="mt-md text-center text-[11px] text-neutral-400">
                Prochaine étape : matching chauffeur + suivi temps réel (à venir)
              </p>
            </section>
          </>
        )}

        <div className="h-2xl" />
      </div>
    </main>
  );
}

function CategoryChoice({
  category,
  price,
  selected,
  onSelect,
}: {
  category: CategoryDef;
  price: PriceQuote | null;
  selected: boolean;
  onSelect: () => void;
}) {
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
            <span className="inline-flex items-center gap-xs rounded-full bg-gold px-sm py-0.5 text-[10px] font-bold text-neutral-900">
              <StarIcon className="h-2.5 w-2.5" />
              {category.badge}
            </span>
          )}
        </div>
        <p className="mt-xs text-xs text-neutral-600">{category.tagline}</p>
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
