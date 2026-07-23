'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AddressAutocomplete,
  type SelectedAddress,
} from '@/components/AddressAutocomplete';
import { getRoute, type RouteResult } from '@/lib/mapbox';
import { computePrice, type VehicleCategory } from '@/lib/pricing';
import { supabaseBrowser } from '@/lib/supabase-browser';

const CATEGORIES: { code: VehicleCategory; label: string }[] = [
  { code: 'moto', label: 'Moto' },
  { code: 'tricycle', label: 'Tricycle' },
  { code: 'essentiel', label: 'Essentiel' },
  { code: 'confort', label: 'Confort' },
];

const DAYS: { n: number; label: string }[] = [
  { n: 1, label: 'L' },
  { n: 2, label: 'M' },
  { n: 3, label: 'M' },
  { n: 4, label: 'J' },
  { n: 5, label: 'V' },
  { n: 6, label: 'S' },
  { n: 7, label: 'D' },
];

const WEEKS_OPTIONS: { weeks: number; label: string }[] = [
  { weeks: 1, label: '1 semaine' },
  { weeks: 2, label: '2 semaines' },
  { weeks: 4, label: '1 mois' },
];

/** Barème de remise par fréquence — miroir du serveur (source de vérité : SQL). */
function discountFor(ridesTotal: number): number {
  if (ridesTotal >= 40) return 15;
  if (ridesTotal >= 20) return 10;
  if (ridesTotal >= 10) return 5;
  return 0;
}

function fmtFcfa(n: number): string {
  return n.toLocaleString('fr-FR');
}

export default function NouveauTamPassPage() {
  const router = useRouter();

  const [category, setCategory] = useState<VehicleCategory>('moto');
  const [origin, setOrigin] = useState<SelectedAddress | null>(null);
  const [dropoff, setDropoff] = useState<SelectedAddress | null>(null);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [slotOut, setSlotOut] = useState('06:45');
  const [roundTrip, setRoundTrip] = useState(true);
  const [slotReturn, setSlotReturn] = useState('18:00');
  const [weeks, setWeeks] = useState(4);

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ridesTotal = useMemo(
    () => days.length * (roundTrip ? 2 : 1) * weeks,
    [days, roundTrip, weeks],
  );
  const discount = useMemo(() => discountFor(ridesTotal), [ridesTotal]);

  const total = useMemo(() => {
    if (unitPrice == null || ridesTotal === 0) return null;
    return Math.round(unitPrice * ridesTotal * (1 - discount / 100));
  }, [unitPrice, ridesTotal, discount]);

  // Solde wallet
  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser
        .from('wallets')
        .select('balance_fcfa')
        .eq('kind', 'tamcar_credit')
        .maybeSingle();
      setWalletBalance(data?.balance_fcfa ?? 0);
    })();
  }, []);

  // Itinéraire + prix unitaire
  useEffect(() => {
    if (!origin || !dropoff) {
      setRoute(null);
      setUnitPrice(null);
      return;
    }
    let stale = false;
    (async () => {
      setQuoting(true);
      setError(null);
      const r = await getRoute(origin.center, dropoff.center);
      if (stale) return;
      if (!r) {
        setError('Impossible de calculer l’itinéraire.');
        setQuoting(false);
        return;
      }
      setRoute(r);
      const q = await computePrice({
        pickup_lat: origin.center[1],
        pickup_lng: origin.center[0],
        dropoff_lat: dropoff.center[1],
        dropoff_lng: dropoff.center[0],
        distance_km: r.distance_km,
        duration_min: r.duration_min,
        p_category: category,
      });
      if (stale) return;
      setUnitPrice(q?.price_total_fcfa ?? null);
      setQuoting(false);
    })();
    return () => {
      stale = true;
    };
  }, [origin, dropoff, category]);

  function toggleDay(n: number) {
    setDays((d) =>
      d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort((a, b) => a - b),
    );
  }

  async function buy() {
    setError(null);
    if (!origin || !dropoff || !route)
      return setError('Renseignez le trajet (départ et destination).');
    if (days.length === 0) return setError('Choisissez au moins un jour.');
    if (!slotOut) return setError('Choisissez un créneau de départ.');

    setBuying(true);
    const { error: err } = await supabaseBrowser.rpc(
      'purchase_subscription_flex',
      {
        p_category: category,
        p_origin_lat: origin.center[1],
        p_origin_lng: origin.center[0],
        p_origin_address: origin.place_name,
        p_dropoff_lat: dropoff.center[1],
        p_dropoff_lng: dropoff.center[0],
        p_dropoff_address: dropoff.place_name,
        p_distance_km: Number(route.distance_km.toFixed(2)),
        p_duration_min: route.duration_min,
        p_days: days,
        p_slot_out: slotOut,
        p_slot_return: roundTrip ? slotReturn : null,
        p_weeks: weeks,
      },
    );
    setBuying(false);

    if (err) {
      setError(err.message);
      return;
    }
    router.push(
      '/tampass?ok=' + encodeURIComponent('Votre TamPass est actif. Bienvenue !'),
    );
  }

  const insufficient =
    total != null && walletBalance != null && walletBalance < total;

  return (
    <main className="mx-auto max-w-md px-lg py-xl">
      <header>
        <Link href="/tampass" className="text-xs font-semibold text-primary-600">
          ← TamPass
        </Link>
        <h1 className="mt-sm text-xl font-extrabold text-neutral-900">
          Créer mon TamPass
        </h1>
        <p className="text-sm text-neutral-500">
          Vous définissez tout : trajet, jours, heures, durée. Plus vous
          voyagez, plus la remise monte.
        </p>
      </header>

      {/* 1. Véhicule */}
      <section className="mt-lg">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          1 · Véhicule
        </h2>
        <div className="mt-sm grid grid-cols-4 gap-sm">
          {CATEGORIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCategory(c.code)}
              className={`rounded-xl border-2 py-md text-center text-xs font-bold transition ${
                category === c.code
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      {/* 2. Trajet */}
      <section className="mt-lg space-y-md">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          2 · Trajet
        </h2>
        <AddressAutocomplete
          label="Départ (domicile)"
          placeholder="Ex : Calavi Carrefour"
          value={origin}
          onChange={setOrigin}
          markerColor="#2563EB"
        />
        <AddressAutocomplete
          label="Destination (travail, école…)"
          placeholder="Ex : Ganhi, Cotonou"
          value={dropoff}
          onChange={setDropoff}
          markerColor="#7C3AED"
        />
        {route && (
          <p className="text-xs text-neutral-500">
            ≈ {route.distance_km.toFixed(1)} km · {route.duration_min} min
          </p>
        )}
      </section>

      {/* 3. Jours et heures */}
      <section className="mt-lg space-y-md">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          3 · Jours et heures
        </h2>
        <div className="flex gap-xs">
          {DAYS.map((d) => (
            <button
              key={d.n}
              type="button"
              onClick={() => toggleDay(d.n)}
              className={`h-10 w-10 rounded-lg text-sm font-bold transition ${
                days.includes(d.n)
                  ? 'bg-primary-500 text-white'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-md">
          <label className="flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Départ aller
            </span>
            <input
              type="time"
              value={slotOut}
              onChange={(e) => setSlotOut(e.target.value)}
              className="mt-xs w-full rounded-lg bg-neutral-100 px-md py-md text-base ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
          <label className="flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Retour
            </span>
            <div className="mt-xs flex items-center gap-sm">
              <input
                type="checkbox"
                checked={roundTrip}
                onChange={(e) => setRoundTrip(e.target.checked)}
                className="h-5 w-5 accent-primary-500"
              />
              <input
                type="time"
                value={slotReturn}
                onChange={(e) => setSlotReturn(e.target.value)}
                disabled={!roundTrip}
                className="w-full rounded-lg bg-neutral-100 px-md py-md text-base ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-40"
              />
            </div>
          </label>
        </div>
      </section>

      {/* 4. Durée */}
      <section className="mt-lg">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          4 · Durée
        </h2>
        <div className="mt-sm grid grid-cols-3 gap-sm">
          {WEEKS_OPTIONS.map((w) => (
            <button
              key={w.weeks}
              type="button"
              onClick={() => setWeeks(w.weeks)}
              className={`rounded-xl border-2 py-md text-center text-xs font-bold transition ${
                weeks === w.weeks
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </section>

      {/* Récap prix */}
      <section className="mt-xl rounded-2xl border border-neutral-200 bg-neutral-50 p-lg">
        {quoting ? (
          <p className="text-sm text-neutral-500">Calcul du prix…</p>
        ) : unitPrice != null && total != null ? (
          <>
            <div className="flex justify-between text-sm text-neutral-600">
              <span>
                {ridesTotal} trajets ×{' '}
                {CATEGORIES.find((c) => c.code === category)?.label}
              </span>
              <span>{fmtFcfa(unitPrice)} FCFA / trajet</span>
            </div>
            {discount > 0 && (
              <div className="mt-xs flex justify-between text-sm font-semibold text-primary-600">
                <span>Remise fréquence</span>
                <span>−{discount} %</span>
              </div>
            )}
            <div className="mt-sm flex items-baseline justify-between border-t border-neutral-200 pt-sm">
              <span className="font-bold text-neutral-900">Total à payer</span>
              <span className="text-xl font-extrabold text-primary-700">
                {fmtFcfa(total)} FCFA
              </span>
            </div>
            <p className="mt-xs text-xs text-neutral-500">
              Solde TamCar Crédit :{' '}
              {walletBalance != null ? `${fmtFcfa(walletBalance)} FCFA` : '…'}
            </p>
            {insufficient && (
              <Link
                href="/wallet"
                className="mt-md block rounded-lg bg-amber-50 p-md text-center text-xs font-bold text-amber-700"
              >
                Solde insuffisant — recharger mon wallet →
              </Link>
            )}
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            Renseignez le trajet pour voir le prix.
          </p>
        )}
      </section>

      {error && (
        <div className="mt-md rounded-md bg-error/10 p-md text-sm font-medium text-error">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={buy}
        disabled={buying || quoting || total == null || insufficient}
        className="mt-lg w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
      >
        {buying ? 'Achat en cours…' : 'Payer et activer mon TamPass'}
      </button>

      <p className="mt-md text-center text-[11px] text-neutral-400">
        Paiement par wallet TamCar Crédit. La recherche de votre chauffeur
        démarre jusqu&apos;à 3 h avant chaque départ — trajet garanti, sinon
        recrédité + 500 F offerts.
      </p>
    </main>
  );
}
