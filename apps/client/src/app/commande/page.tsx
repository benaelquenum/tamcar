'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AddressAutocomplete, type SelectedAddress } from '@/components/AddressAutocomplete';
import { ArrowRightIcon, CarIcon, PlusIcon, StarIcon, LuggageIcon } from '@/components/Icon';
import { Map } from '@/components/Map';
import { useLivePosition } from '@/lib/useLivePosition';
import { SuggestPlaceModal } from '@/components/SuggestPlaceModal';
import { getRouteThrough, reverseGeocode, type RouteResult, BENIN_POPULAR_PLACES } from '@/lib/mapbox';
import { MAX_STOPS } from '@/lib/route-change';
import { googlePlacesConfigured, googleReverseGeocode } from '@/lib/google-places';
import { computePrice, type PriceQuote, type VehicleCategory } from '@/lib/pricing';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { isWithinServiceZone, SERVICE_ZONE_LABEL } from '@/lib/service-zone';
import { useT } from '@/lib/i18n-client';
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
  { id: 'essentiel', name: 'Essentiel', tagline: 'Voiture basique, fonctionnelle' },
  { id: 'confort', name: 'Confort', tagline: 'Voiture confortable, bien entretenue', badge: 'Best-seller' },
  { id: 'premium', name: 'VIP', tagline: 'Voiture de prestige, confort premium' },
];

function formatFcfa(n: number | undefined | null): string {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function formatKm(km: number): string {
  return km.toFixed(1).replace('.', ',');
}

function promoReasonLabel(reason: string): string {
  switch (reason) {
    case 'unknown': return 'Code inconnu';
    case 'inactive': return 'Ce code n\'est plus actif';
    case 'not_started': return 'Ce code n\'est pas encore actif';
    case 'expired': return 'Ce code a expiré';
    case 'exhausted': return 'Ce code a atteint sa limite d\'utilisations';
    case 'already_used_by_you': return 'Vous avez déjà utilisé ce code';
    case 'empty': return 'Entrez un code';
    default: return 'Code invalide';
  }
}

type PickingMode = 'pickup' | 'dropoff' | 'suggest' | null;

/** Course directe : un chauffeur que le client a déjà eu (liste « Mes chauffeurs »). */
type DirectDriver = {
  driver_id: string;
  driver_name: string;
  driver_rating: number | null;
  vehicle_category: VehicleCategory;
  vehicle_label: string | null;
  is_online: boolean;
};

/** Les trois écrans de la commande : définir le trajet, choisir le véhicule, confirmer. */
type Step = 'route' | 'vehicle' | 'confirm';

// Une réservation part au minimum dans 30 minutes — en deçà, c'est une
// course immédiate. Le serveur tolère 28 min pour absorber la saisie.
const MIN_SCHEDULE_MS = 30 * 60 * 1000;

function minScheduledLocal(): string {
  // now() + 30 min, formaté YYYY-MM-DDTHH:MM (local) pour <input type="datetime-local">
  const d = new Date(Date.now() + MIN_SCHEDULE_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Commande en trois écrans, un seul sujet par écran :
 *   1. Trajet — départ, destination, carte, distance et durée. Aucune
 *      catégorie ici : on ne propose un véhicule qu'une fois le trajet connu.
 *   2. Véhicule — liste courte, une carte par catégorie, prix et délai
 *      d'arrivée. Le bouton du bas porte le prix de la catégorie choisie.
 *   3. Confirmation — récapitulatif, paiement, code promo, pour qui. Rien
 *      n'est ressaisi : tout ce qui a été validé avant est conservé.
 *
 * L'écran courant vit dans l'URL (?step=) : le bouton retour du téléphone
 * revient à l'écran précédent au lieu de quitter la commande. Les écrans 2 et
 * 3 n'existent que si le trajet est calculé — recharger la page ramène à
 * l'écran 1, où l'état (lui, en mémoire) a de toute façon disparu.
 */
// Points où l'on voyage presque toujours avec des valises : aéroport et gare routière.
const LUGGAGE_HUB_IDS = ['cotonou-airport', 'cotonou-jonquet'];

function metersBetweenPoints(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLng = (b[0] - a[0]) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Départ depuis l'aéroport ou une gare : l'adresse le dit, ou le point est à moins de 1,5 km du lieu connu. */
function isLuggageHub(pickup: { place_name: string; center: [number, number] } | null): boolean {
  if (!pickup) return false;
  if (/a[ée]roport|airport|\bgare\b/i.test(pickup.place_name)) return true;
  return BENIN_POPULAR_PLACES.some(
    (p) => LUGGAGE_HUB_IDS.includes(p.id) && metersBetweenPoints(pickup.center, p.center) <= 1500,
  );
}

export default function CommandePage() {
  const t = useT();
  const searchParams = useSearchParams();
  const isScheduled = searchParams.get('scheduled') === '1';
  const isProche = searchParams.get('proche') === '1';
  const urlStep = searchParams.get('step');
  // ?driver=<id> : commande DIRECTE à un chauffeur déjà eu (depuis « Mes
  // chauffeurs »). Pas de choix de véhicule — c'est le sien — et une
  // réservation à l'avance ne peut pas être directe.
  const driverParam = isScheduled ? null : searchParams.get('driver');

  const [pickup, setPickup] = useState<SelectedAddress | null>(null);

  // Destination pré-remplie par un lien de localisation ouvert depuis une
  // autre application (WhatsApp, Google Maps…) — cf. /ouvrir.
  const [dropoff, setDropoff] = useState<SelectedAddress | null>(() => {
    const lat = Number(searchParams.get('dest_lat'));
    const lng = Number(searchParams.get('dest_lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;
    return {
      place_name:
        searchParams.get('dest') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      center: [lng, lat],
    };
  });
  // Arrêts demandés dès la commande (3 au plus). Une case vide est une case
  // ouverte, pas encore remplie : seuls les arrêts renseignés comptent.
  const [stops, setStops] = useState<Array<SelectedAddress | null>>([]);
  const filledStops = stops.filter((x): x is SelectedAddress => x !== null);
  const stopsKey = filledStops.map((x) => x.center.join(',')).join('|');

  const [directDriver, setDirectDriver] = useState<DirectDriver | null>(null);
  const [directState, setDirectState] = useState<'none' | 'loading' | 'ready' | 'missing'>(
    driverParam ? 'loading' : 'none',
  );
  const [route, setRoute] = useState<RouteResult | null>(null);
  // « failed » : les deux adresses sont valides mais l'itinéraire n'a pas pu
  // être calculé — on l'explique au lieu de laisser un écran muet.
  const [routeStatus, setRouteStatus] = useState<'idle' | 'loading' | 'ok' | 'failed'>('idle');
  const [pricesFailed, setPricesFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [scheduledAt, setScheduledAt] = useState<string>(isScheduled ? minScheduledLocal() : '');
  const [prices, setPrices] = useState<Record<VehicleCategory, PriceQuote | null>>(
    {} as Record<VehicleCategory, PriceQuote | null>,
  );
  const [availability, setAvailability] = useState<Record<VehicleCategory, AvailabilityRow | null>>(
    {} as Record<VehicleCategory, AvailabilityRow | null>,
  );
  const [selectedCat, setSelectedCat] = useState<VehicleCategory>('essentiel');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'tamcar_credit'>('cash');
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [promoCode, setPromoCode] = useState<string>('');
  const [promoPreview, setPromoPreview] = useState<{
    valid: boolean;
    reason: string;
    discount_fcfa: number;
    final_price_fcfa: number;
  } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [loading, setLoading] = useState(false);

  // Course pour un proche : le passager n'est pas le titulaire du compte
  // (?proche=1 depuis l'accueil pré-sélectionne le mode proche)
  const [forWhom, setForWhom] = useState<'me' | 'other'>(isProche ? 'other' : 'me');
  // Bagages : facultatif, sans supplément ; mis en avant sur le corridor et aux départs aéroport / gare.
  const [hasLuggage, setHasLuggage] = useState(false);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');

  // Mode sélection sur carte
  const [pickingMode, setPickingMode] = useState<PickingMode>(null);
  const [candidate, setCandidate] = useState<[number, number] | null>(null);

  // Position live du client (hors course) — même modèle que le chauffeur :
  // veille GPS continue filtrée + lissée, affichée en beacon sur la carte
  // et réutilisée par « Ma position » (précision GPS, pas centre géocodé).
  const liveCoord = useLivePosition(true);

  // Le départ par défaut est la position actuelle. On ne le pose qu'une fois,
  // et jamais par-dessus un choix du client (y compris un champ vidé).
  const pickupTouched = useRef(false);
  function changePickup(v: SelectedAddress | null) {
    pickupTouched.current = true;
    setPickup(v);
  }

  // Modal Suggest place
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestInitialName, setSuggestInitialName] = useState('');
  const [suggestCenter, setSuggestCenter] = useState<[number, number] | null>(null);

  // Confirmation ride (server action + redirect)
  const [confirming, startConfirm] = useTransition();
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const stopsOut = filledStops.some((x) => !isWithinServiceZone(x.center[1], x.center[0]));
  const outOfZone =
    (pickup ? !isWithinServiceZone(pickup.center[1], pickup.center[0]) : false) ||
    (dropoff ? !isWithinServiceZone(dropoff.center[1], dropoff.center[0]) : false) ||
    stopsOut;
  const pickupOut = pickup ? !isWithinServiceZone(pickup.center[1], pickup.center[0]) : false;
  const dropoffOut = dropoff ? !isWithinServiceZone(dropoff.center[1], dropoff.center[0]) : false;

  const isDirect = directDriver !== null;
  const selectedPrice = prices[selectedCat] ?? null;
  const finalPrice = promoPreview?.valid
    ? promoPreview.final_price_fcfa
    : selectedPrice?.price_total_fcfa;

  // Écran courant : un écran avancé n'existe que si le trajet est calculé.
  const step: Step =
    route && !outOfZone && (urlStep === 'vehicle' || urlStep === 'confirm') ? urlStep : 'route';

  function goStep(next: Step) {
    const p = new URLSearchParams(window.location.search);
    if (next === 'route') p.delete('step');
    else p.set('step', next);
    const qs = p.toString();
    // pushState natif : Next le synchronise avec useSearchParams, sans
    // aller-retour serveur — l'état de la commande reste en mémoire.
    window.history.pushState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }

  // Un écran avancé demandé par l'URL alors que rien n'est calculé (page
  // rechargée, lien copié) est effacé de l'URL : sinon il s'ouvrirait tout
  // seul dès que le trajet serait calculé.
  useEffect(() => {
    if (urlStep !== 'vehicle' && urlStep !== 'confirm') return;
    const p = new URLSearchParams(window.location.search);
    p.delete('step');
    const qs = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCheckPromo() {
    const code = promoCode.trim().toUpperCase();
    const basePrice = prices[selectedCat]?.price_total_fcfa ?? 0;
    if (!code || basePrice === 0) return;
    setPromoChecking(true);
    setPromoPreview(null);
    const { data } = await supabaseBrowser.rpc('preview_promo_code', {
      p_code: code,
      p_price_total: basePrice,
    });
    setPromoChecking(false);
    if (Array.isArray(data) && data[0]) {
      setPromoPreview(data[0] as {
        valid: boolean;
        reason: string;
        discount_fcfa: number;
        final_price_fcfa: number;
      });
    }
  }

  function handleConfirm() {
    if (!pickup || !dropoff || !route || !prices[selectedCat]) return;
    setConfirmError(null);
    if (forWhom === 'other') {
      if (!passengerName.trim()) {
        setConfirmError('Indiquez le nom du passager.');
        return;
      }
      if (passengerPhone.replace(/\D/g, '').length < 8) {
        setConfirmError('Numéro du passager invalide.');
        return;
      }
    }
    if (isScheduled) {
      const ts = new Date(scheduledAt).getTime();
      if (!Number.isFinite(ts)) {
        setConfirmError('Choisissez une date et une heure de départ.');
        return;
      }
      // L'heure pré-remplie vieillit pendant que l'on choisit les adresses :
      // au-delà de quelques minutes elle repasse sous le minimum accepté par
      // le serveur. On la remonte au lieu de laisser partir une demande vouée
      // à être refusée.
      if (ts < Date.now() + MIN_SCHEDULE_MS) {
        setScheduledAt(minScheduledLocal());
        setConfirmError(
          "L'heure de départ était trop proche — elle a été avancée au minimum (30 min). Pour partir plus tôt, commandez une course immédiate.",
        );
        return;
      }
      if (ts > Date.now() + 30 * 24 * 60 * 60 * 1000) {
        setConfirmError("Réservation possible jusqu'à 30 jours à l'avance.");
        return;
      }
    }
    startConfirm(async () => {
      try {
        const result = await createRideAction({
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
          payment_method: paymentMethod,
          promo_code: promoPreview?.valid ? promoCode.trim().toUpperCase() : null,
          passenger_name: forWhom === 'other' ? passengerName.trim() : null,
          passenger_phone: forWhom === 'other' ? passengerPhone.replace(/[^0-9+]/g, '') : null,
          target_driver_id: directDriver?.driver_id ?? null,
          has_luggage: hasLuggage,
          stops: filledStops.map((x) => ({
            address: x.place_name,
            lat: x.center[1],
            lng: x.center[0],
          })),
        });
        // Succès = redirection côté serveur, la fonction ne retourne rien.
        if (result?.error) setConfirmError(result.error);
      } catch (e) {
        // Réseau coupé pendant l'envoi : on ne sait pas si la demande est
        // partie. Le message le dit — et renvoie vers « Courses » plutôt que
        // d'inviter à recommander à l'aveugle.
        setConfirmError(
          e instanceof Error && e.message && !/fetch|network|failed/i.test(e.message)
            ? e.message
            : 'Connexion interrompue : votre demande n’est peut-être pas partie. Vérifiez « Courses » avant de commander à nouveau.',
        );
      }
    });
  }

  // L'heure pré-remplie doit rester valide tant que l'écran est ouvert :
  // choisir un départ et une destination prend facilement plus de 5 minutes,
  // et l'heure figée au montage finissait par tomber sous le minimum.
  useEffect(() => {
    if (!isScheduled) return;
    const id = setInterval(() => {
      const min = minScheduledLocal();
      // Format YYYY-MM-DDTHH:MM : l'ordre lexicographique est chronologique.
      setScheduledAt((cur) => (!cur || cur < min ? min : cur));
    }, 30_000);
    return () => clearInterval(id);
  }, [isScheduled]);

  // Fetch balance TamCar Crédit au mount pour griser l'option si insuffisant
  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser.rpc('my_wallets');
      if (Array.isArray(data)) {
        const credit = (data as Array<{ kind: string; balance_fcfa: number }>)
          .find((w) => w.kind === 'tamcar_credit');
        setCreditBalance(credit?.balance_fcfa ?? 0);
      }
    })();
  }, []);

  // Course directe : retrouve le chauffeur dans « Mes chauffeurs » ; sa
  // catégorie devient celle de la course.
  useEffect(() => {
    if (!driverParam) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser.rpc('my_recent_drivers', { p_limit: 50 });
      if (cancelled) return;
      const found = ((data as DirectDriver[] | null) ?? []).find((d) => d.driver_id === driverParam);
      if (!found) {
        setDirectState('missing');
        return;
      }
      setDirectDriver(found);
      setSelectedCat(found.vehicle_category);
      setDirectState('ready');
    })();
    return () => { cancelled = true; };
  }, [driverParam]);

  // Départ par défaut = position actuelle, dès qu'un fix précis est disponible.
  useEffect(() => {
    if (!liveCoord || pickup || pickupTouched.current) return;
    let cancelled = false;
    (async () => {
      const [lng, lat] = liveCoord;
      let feature = null;
      try {
        feature =
          (googlePlacesConfigured() ? await googleReverseGeocode(lng, lat) : null) ||
          (await reverseGeocode(lng, lat));
      } catch {
        feature = null;
      }
      if (cancelled || pickupTouched.current) return;
      // Le géocodage inverse ne fournit que le NOM : on garde les coordonnées
      // GPS exactes (le centre du lieu géocodé peut être à 100 m+ du point).
      setPickup({
        place_name: feature?.place_name ?? `Ma position (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        center: [lng, lat],
      });
    })();
    return () => { cancelled = true; };
  }, [liveCoord, pickup]);

  // Une autre catégorie = un autre prix de base : le code promo vérifié
  // sur l'ancien ne vaut plus.
  useEffect(() => {
    setPromoPreview(null);
  }, [selectedCat]);

  // Le crédit n'est proposé que s'il couvre la course ; sinon on revient aux espèces.
  useEffect(() => {
    const price = finalPrice ?? 0;
    if (paymentMethod === 'tamcar_credit' && creditBalance < price) setPaymentMethod('cash');
  }, [paymentMethod, creditBalance, finalPrice]);

  useEffect(() => {
    if (!pickup || !dropoff) {
      setRoute(null);
      setRouteStatus('idle');
      setPricesFailed(false);
      setPrices({} as Record<VehicleCategory, PriceQuote | null>);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setRouteStatus('loading');
    setPricesFailed(false);

    (async () => {
      let r: RouteResult | null = null;
      try {
        // départ → arrêts (dans l'ordre) → destination, en un seul appel :
        // la distance et la durée sont celles de TOUT l'itinéraire, donc le
        // prix aussi.
        r = await getRouteThrough([
          pickup.center,
          ...filledStops.map((x) => x.center),
          dropoff.center,
        ]);
      } catch {
        r = null;
      }
      if (cancelled) return;
      setRoute(r);

      if (!r) {
        setRouteStatus('failed');
        setPrices({} as Record<VehicleCategory, PriceQuote | null>);
        setLoading(false);
        return;
      }
      setRouteStatus('ok');

      const quotes = await Promise.all(
        CATEGORIES.map((c) =>
          computePrice({
            pickup_lat: pickup.center[1], pickup_lng: pickup.center[0],
            dropoff_lat: dropoff.center[1], dropoff_lng: dropoff.center[0],
            distance_km: r!.distance_km, duration_min: r!.duration_min,
            p_category: c.id,
          }).catch(() => null),
        ),
      );

      if (cancelled) return;
      const byId = {} as Record<VehicleCategory, PriceQuote | null>;
      CATEGORIES.forEach((c, i) => { byId[c.id] = quotes[i]; });
      setPrices(byId);
      setPricesFailed(quotes.every((q) => q === null));
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup, dropoff, stopsKey, attempt]);

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
    if (!pickingMode) return;

    const target = pickingMode; // capture avant l'await pour éviter une race si l'user annule
    setCandidate(lngLat);
    const feature = await reverseGeocode(lngLat[0], lngLat[1]);
    // Le point EXACT touché sur la carte est conservé ; le géocodage
    // inverse ne fournit que le libellé (son center peut être décalé).
    const place: SelectedAddress = {
      place_name:
        feature?.place_name ??
        `Point sur la carte (${lngLat[1].toFixed(4)}, ${lngLat[0].toFixed(4)})`,
      center: lngLat,
    };

    if (target === 'pickup') {
      changePickup(place);
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
  }

  function startSuggest(query: string) {
    setSuggestInitialName(query);
    // Point par défaut = milieu de la carte / route existante / Cotonou
    const defaultCenter: [number, number] =
      pickup?.center ?? dropoff?.center ?? [2.42, 6.36];
    setSuggestCenter(defaultCenter);
    setSuggestOpen(true);
  }

  const catDef = CATEGORIES.find((c) => c.id === selectedCat)!;
  const tripLine = route
    ? `${formatKm(route.distance_km)} km · ${route.duration_min} min ${t('commande.min_distance')}` +
      (filledStops.length > 0 ? ` · ${filledStops.length} arrêt${filledStops.length > 1 ? 's' : ''}` : '')
    : null;
  const directFirst = directDriver ? directDriver.driver_name.split(' ')[0] : '';
  const nextStepAfterRoute: Step = isDirect ? 'confirm' : 'vehicle';

  function setStopAt(i: number, v: SelectedAddress | null) {
    setStops((cur) => cur.map((x, k) => (k === i ? v : x)));
  }
  function removeStopAt(i: number) {
    setStops((cur) => cur.filter((_, k) => k !== i));
  }

  // ------------------------------------------------------------------ écran 1 : trajet
  const routeScreen = (
    <main className="flex h-dvh flex-col bg-white">
      <StepHeader
        title={t('commande.route_title')}
        back={<BackLink href="/" label="Retour à l'accueil" />}
      />

      {directState === 'ready' && directDriver && (
        <div className="mx-lg mb-sm rounded-xl bg-primary-50 px-md py-sm text-xs text-primary-900">
          Course directe avec <strong>{directDriver.driver_name}</strong>
          {directDriver.driver_rating != null && ` · ★ ${Number(directDriver.driver_rating).toFixed(1)}`}
          {directDriver.vehicle_label ? ` · ${directDriver.vehicle_label}` : ''}
          {!directDriver.is_online && (
            <span className="font-semibold text-amber-700"> · actuellement hors ligne : il peut tarder à répondre</span>
          )}
        </div>
      )}
      {directState === 'missing' && (
        <div className="mx-lg mb-sm rounded-xl border border-amber-300 bg-amber-50 px-md py-sm text-xs text-amber-900">
          Ce chauffeur ne fait pas partie de vos chauffeurs : la course sera une commande ordinaire.
        </div>
      )}

      <section className="relative z-20 space-y-sm px-lg">
        <AddressAutocomplete
          compact
          label={t('commande.pickup')}
          placeholder={t('commande.pickup_placeholder')}
          value={pickup}
          onChange={changePickup}
          markerColor="#2563EB"
          showLocationButton
          livePosition={liveCoord}
          onPickOnMap={() => setPickingMode('pickup')}
          onSuggestPlace={startSuggest}
        />
        {stops.map((st, i) => (
          <div key={i} className="flex items-center gap-sm">
            <div className="min-w-0 flex-1">
              <AddressAutocomplete
                compact
                label={`Arrêt ${i + 1}`}
                placeholder="Où voulez-vous passer ?"
                value={st}
                onChange={(v) => setStopAt(i, v)}
                markerColor="#F59E0B"
                onSuggestPlace={startSuggest}
              />
            </div>
            <button
              type="button"
              onClick={() => removeStopAt(i)}
              aria-label={`Retirer l'arrêt ${i + 1}`}
              className="grid h-9 w-9 flex-none place-items-center rounded-full bg-neutral-100 text-lg text-neutral-600 transition active:scale-95"
            >
              ×
            </button>
          </div>
        ))}
        <AddressAutocomplete
          compact
          label={t('commande.dropoff')}
          placeholder={t('commande.dropoff_placeholder')}
          value={dropoff}
          onChange={setDropoff}
          markerColor="#8B5CF6"
          onPickOnMap={() => setPickingMode('dropoff')}
          onSuggestPlace={startSuggest}
        />
        {stops.length < MAX_STOPS && (
          <button
            type="button"
            onClick={() => setStops((cur) => [...cur, null])}
            className="inline-flex items-center gap-xs text-xs font-bold text-primary-600"
          >
            <PlusIcon className="h-3.5 w-3.5" strokeWidth={3} />
            Ajouter un arrêt
            <span className="font-medium text-neutral-400">
              ({stops.length}/{MAX_STOPS})
            </span>
          </button>
        )}
      </section>

      {outOfZone && (
        <section className="mx-lg mt-sm rounded-xl border border-error/30 bg-error/10 p-md text-sm text-error">
          <p className="font-bold">{t('commande.out_of_zone_title')}</p>
          <p className="mt-xs text-xs">
            {t('commande.out_of_zone_body', { zone: SERVICE_ZONE_LABEL })}
            {pickupOut && ` ${t('commande.out_of_zone_pickup')}`}
            {dropoffOut && ` ${t('commande.out_of_zone_dropoff')}`}
          </p>
        </section>
      )}

      {pickingMode && (
        <div className="mx-lg mt-sm flex items-center justify-between gap-md rounded-xl bg-primary-50 p-md text-sm ring-1 ring-primary-200">
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

      {/* La carte prend tout l'espace restant ; distance et durée en petit bandeau. */}
      <section className="relative z-0 mt-md min-h-[180px] flex-1">
        <Map
          pickup={pickup?.center ?? null}
          dropoff={dropoff?.center ?? null}
          route={route?.geometry ?? null}
          stops={filledStops.map((x, i) => ({ lat: x.center[1], lng: x.center[0], label: i + 1 }))}
          candidate={candidate}
          clientLocation={liveCoord}
          onMapClick={pickingMode ? handleMapClick : undefined}
          className="absolute inset-0 h-full w-full bg-neutral-100"
        />

        {tripLine && (
          <div className="pointer-events-none absolute inset-x-0 top-md flex justify-center">
            <span
              className="rounded-full bg-white px-lg py-xs text-sm font-bold text-primary-900 shadow-lg ring-1 ring-primary-100"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {tripLine}
            </span>
          </div>
        )}
        {routeStatus === 'loading' && (
          <div className="pointer-events-none absolute inset-x-0 top-md flex justify-center">
            <span className="rounded-full bg-white px-lg py-xs text-sm font-semibold text-neutral-600 shadow-lg ring-1 ring-neutral-200">
              Calcul du trajet…
            </span>
          </div>
        )}

        {routeStatus === 'failed' && (
          <div className="absolute inset-x-md top-md rounded-xl bg-white p-md text-sm shadow-lg ring-1 ring-error/30">
            <p className="font-bold text-error">{t('commande.route_failed_title')}</p>
            <p className="mt-xs text-xs text-neutral-700">{t('commande.route_failed_body')}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-sm rounded-full bg-primary-500 px-lg py-xs text-xs font-bold text-white"
            >
              {t('commande.retry')}
            </button>
          </div>
        )}
      </section>

      <BottomBar>
        {!route && routeStatus === 'idle' && (
          <p className="mb-sm text-center text-xs text-neutral-500">{t('commande.route_hint')}</p>
        )}
        <PrimaryButton
          onClick={() => goStep(nextStepAfterRoute)}
          disabled={
            !route || outOfZone || routeStatus !== 'ok' ||
            (isDirect ? !selectedPrice : false) ||
            directState === 'loading'
          }
        >
          <CarIcon className="h-5 w-5" />
          {isDirect ? t('commande.continue') : t('commande.choose_vehicle')}
          <ArrowRightIcon />
        </PrimaryButton>
      </BottomBar>
    </main>
  );

  // ------------------------------------------------------------------ écran 2 : véhicule
  const vehicleScreen = (
    <main className="flex h-dvh flex-col bg-white">
      <StepHeader
        title={t('commande.vehicle_title')}
        back={<BackButton onClick={() => window.history.back()} label="Revenir au trajet" />}
      />

      <div className="mx-lg rounded-xl bg-primary-50 px-md py-sm">
        <p className="text-sm font-bold text-primary-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {tripLine}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-primary-900/70">
          {pickup?.place_name.replace(/, Bénin$/i, '')} → {dropoff?.place_name.replace(/, Bénin$/i, '')}
        </p>
      </div>

      <div className="mt-md flex-1 space-y-sm overflow-y-auto px-lg pb-md" role="radiogroup" aria-label={t('commande.choose_category')}>
        {pricesFailed && (
          <div className="rounded-xl border border-error/30 bg-error/10 p-md text-sm text-error">
            <p className="font-bold">{t('commande.price_unavailable')}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-sm rounded-full bg-white px-lg py-xs text-xs font-bold text-error ring-1 ring-error/30"
            >
              {t('commande.retry')}
            </button>
          </div>
        )}
        {CATEGORIES.map((cat) => (
          <CategoryChoice
            key={cat.id}
            category={{ ...cat, tagline: t(`cat.${cat.id}.tagline`) }}
            price={prices[cat.id] ?? null}
            priceLoading={loading}
            availability={availability[cat.id] ?? null}
            selected={selectedCat === cat.id}
            onSelect={() => setSelectedCat(cat.id)}
            noDriverLabel={t('commande.no_driver_nearby')}
            etaLabel={(min) => t('commande.eta_arrival', { min })}
            unavailableLabel={t('commande.price_unavailable')}
          />
        ))}
      </div>

      <BottomBar>
        <PrimaryButton
          onClick={() => goStep('confirm')}
          disabled={loading || !selectedPrice}
        >
          {t('commande.continue')} · {formatFcfa(selectedPrice?.price_total_fcfa)} FCFA
          <ArrowRightIcon />
        </PrimaryButton>
      </BottomBar>
    </main>
  );

  // ------------------------------------------------------------------ écran 3 : confirmation
  const creditEnough = creditBalance >= (finalPrice ?? 0);
  const balanceFmt = formatFcfa(creditBalance);
  const confirmScreen = (
    <main className="flex h-dvh flex-col bg-white">
      <StepHeader
        title={t('commande.recap_title')}
        back={<BackButton onClick={() => window.history.back()} label="Revenir au choix du véhicule" />}
      />

      <div className="flex-1 space-y-md overflow-y-auto px-lg pb-md">
        {/* Trajet */}
        <section className="rounded-2xl bg-white p-md ring-1 ring-neutral-200">
          <div className="flex items-start gap-md">
            <div className="mt-1.5 flex flex-none flex-col items-center">
              <span className="h-2.5 w-2.5 rounded-full bg-primary-500" />
              <span className="my-0.5 h-6 w-px bg-neutral-300" />
              {filledStops.map((_, i) => (
                <span key={i} className="contents">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="my-0.5 h-6 w-px bg-neutral-300" />
                </span>
              ))}
              <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
            </div>
            <div className="min-w-0 flex-1 space-y-sm">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{t('commande.pickup')}</p>
                <p className="text-sm font-semibold leading-snug text-neutral-900">{pickup?.place_name.replace(/, Bénin$/i, '')}</p>
              </div>
              {filledStops.map((x, i) => (
                <div key={i}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Arrêt {i + 1}</p>
                  <p className="text-sm font-semibold leading-snug text-neutral-900">{x.place_name.replace(/, Bénin$/i, '')}</p>
                </div>
              ))}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{t('commande.dropoff')}</p>
                <p className="text-sm font-semibold leading-snug text-neutral-900">{dropoff?.place_name.replace(/, Bénin$/i, '')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => goStep('route')}
              className="flex-none text-xs font-bold text-primary-600"
            >
              {t('commande.edit')}
            </button>
          </div>
          <p className="mt-sm text-xs text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {tripLine}
          </p>
        </section>

        {/* Véhicule et tarif */}
        <section className="flex items-center gap-md rounded-2xl bg-primary-50/70 p-md ring-2 ring-primary-500">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/categories/${catDef.id}.webp`} alt="" className="h-12 w-16 flex-none object-contain" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-neutral-900">
              {isDirect ? directDriver!.driver_name : `TamCar ${catDef.name}`}
            </p>
            <p className="truncate text-xs text-neutral-600">
              {isDirect
                ? `Course directe · TamCar ${catDef.name}${directDriver!.driver_rating != null ? ` · ★ ${Number(directDriver!.driver_rating).toFixed(1)}` : ''}`
                : t(`cat.${catDef.id}.tagline`)}
            </p>
            {selectedPrice?.is_corridor && (
              <p className="text-[11px] font-semibold text-primary-600">Prix fixe corridor</p>
            )}
          </div>
          <div className="flex-none text-right">
            <p className="text-lg font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatFcfa(finalPrice)}
              <span className="ml-xs text-[10px] font-medium text-neutral-600">FCFA</span>
            </p>
            {promoPreview?.valid && (
              <p className="text-[11px] text-neutral-400 line-through" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatFcfa(selectedPrice?.price_total_fcfa)}
              </p>
            )}
            {!isDirect && (
              <button type="button" onClick={() => window.history.back()} className="text-xs font-bold text-primary-600">
                {t('commande.edit')}
              </button>
            )}
          </div>
        </section>

        {isScheduled && (
          <section className="rounded-xl bg-violet-500/10 p-md ring-1 ring-violet-500/30">
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
              Réservation min. 30 min à l&apos;avance, jusqu&apos;à 30 jours.
              Pour partir plus tôt, commandez une course immédiate.
            </p>
          </section>
        )}

        {/* Paiement : une option indisponible est dite telle, sans bloquer les espèces. */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
            {t('commande.payment_method')}
          </p>
          <div className="mt-sm grid grid-cols-2 gap-sm">
            <PaymentChoice
              id="cash"
              label={t('commande.payment_cash')}
              sub={t('commande.payment_cash_sub')}
              selected={paymentMethod === 'cash'}
              onSelect={() => setPaymentMethod('cash')}
            />
            <PaymentChoice
              id="tamcar_credit"
              label={t('commande.payment_credit')}
              sub={creditEnough ? `${balanceFmt} F` : `${t('commande.payment_credit_low')} · ${balanceFmt} F`}
              disabled={!creditEnough}
              selected={paymentMethod === 'tamcar_credit'}
              onSelect={() => creditEnough && setPaymentMethod('tamcar_credit')}
            />
          </div>
          {!creditEnough && (
            <Link
              href="/wallet"
              className="mt-sm inline-flex items-center gap-xs text-xs font-bold text-primary-600"
            >
              {t('commande.payment_recharge')} TamCar Crédit
              <ArrowRightIcon className="h-3 w-3" />
            </Link>
          )}
          <p className="mt-xs text-[10px] text-neutral-400">{t('commande.payment_momo_soon')}</p>
        </section>

        {/* Code promo, facultatif */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
            {t('commande.promo_optional')}
          </p>
          <div className="mt-sm flex gap-sm">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => { setPromoCode(e.target.value); setPromoPreview(null); }}
              placeholder="Ex : LANCEMENT"
              maxLength={20}
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm font-mono uppercase tracking-widest text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
            <button
              type="button"
              onClick={handleCheckPromo}
              disabled={promoChecking || !promoCode.trim() || !selectedPrice}
              className="rounded-lg bg-primary-500 px-md text-xs font-bold text-white shadow-sm disabled:opacity-50"
            >
              {promoChecking ? '…' : t('commande.promo_apply')}
            </button>
          </div>
          {promoPreview && (
            promoPreview.valid ? (
              <p className="mt-xs text-xs font-semibold text-primary-700">
                Code valide — remise de{' '}
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatFcfa(promoPreview.discount_fcfa)} F
                </strong>{' '}
                · nouveau prix{' '}
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatFcfa(promoPreview.final_price_fcfa)} F
                </strong>
              </p>
            ) : (
              <p className="mt-xs text-xs font-semibold text-error">
                {promoReasonLabel(promoPreview.reason)}
              </p>
            )
          )}
        </section>

        {/* Bagages : facultatif, sans supplément. Mis en avant sur le corridor et aux départs aéroport / gare. */}
        {(() => {
          const prominent = Boolean(selectedPrice?.is_corridor) || isLuggageHub(pickup);
          const small = selectedCat === 'moto' || selectedCat === 'tricycle';
          const smallLabel = selectedCat === 'moto' ? 'Moto' : 'Tricycle';
          return (
            <section className={prominent ? 'rounded-2xl bg-primary-50/70 p-md ring-1 ring-primary-100' : ''}>
              {prominent ? (
                <>
                  <p className="flex items-center gap-xs text-sm font-bold text-neutral-900">
                    <LuggageIcon className="h-4 w-4 text-primary-600" />
                    Voyagez-vous avec des bagages ?
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-600">
                    Le chauffeur le voit avant d&apos;accepter, pour préparer le coffre. Sans supplément.
                  </p>
                  <div className="mt-sm grid grid-cols-2 gap-sm">
                    <button
                      type="button"
                      onClick={() => setHasLuggage(false)}
                      className={`rounded-xl border-2 px-md py-sm text-sm font-bold transition ${
                        !hasLuggage ? 'border-primary-500 bg-white text-primary-700' : 'border-neutral-200 bg-white text-neutral-700 hover:border-primary-300'
                      }`}
                    >
                      Non
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasLuggage(true)}
                      className={`rounded-xl border-2 px-md py-sm text-sm font-bold transition ${
                        hasLuggage ? 'border-primary-500 bg-white text-primary-700' : 'border-neutral-200 bg-white text-neutral-700 hover:border-primary-300'
                      }`}
                    >
                      Oui, des valises
                    </button>
                  </div>
                </>
              ) : (
                <label className="flex cursor-pointer items-center gap-sm rounded-xl border border-neutral-200 bg-white p-md">
                  <input
                    type="checkbox"
                    checked={hasLuggage}
                    onChange={(e) => setHasLuggage(e.target.checked)}
                    className="h-4 w-4 rounded border-neutral-300"
                  />
                  <span className="flex-1 text-sm font-semibold text-neutral-900">
                    J&apos;ai des bagages <span className="font-normal text-neutral-500">(valises, gros sacs)</span>
                  </span>
                  <LuggageIcon className="h-4 w-4 text-neutral-400" />
                </label>
              )}
              {small && (
                <p
                  className={`mt-sm rounded-lg px-md py-sm text-[11px] font-semibold ${
                    hasLuggage ? 'bg-warning/15 text-warning' : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {smallLabel} : bagages limités ({selectedCat === 'moto' ? 'un petit sac' : 'quelques sacs'}).{' '}
                  Pour des valises, choisissez Essentiel ou Confort.
                </p>
              )}
            </section>
          );
        })()}

        {/* Pour qui */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
            Pour qui est cette course ?
          </p>
          <div className="mt-sm grid grid-cols-2 gap-sm">
            <button
              type="button"
              onClick={() => setForWhom('me')}
              className={`rounded-xl border-2 p-md text-left transition ${
                forWhom === 'me'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-neutral-200 bg-white hover:border-primary-300'
              }`}
            >
              <p className="text-sm font-bold text-neutral-900">Pour moi</p>
              <p className="text-[10px] text-neutral-600">Je suis le passager</p>
            </button>
            <button
              type="button"
              onClick={() => setForWhom('other')}
              className={`rounded-xl border-2 p-md text-left transition ${
                forWhom === 'other'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-neutral-200 bg-white hover:border-primary-300'
              }`}
            >
              <p className="text-sm font-bold text-neutral-900">Pour un proche</p>
              <p className="text-[10px] text-neutral-600">Quelqu&apos;un d&apos;autre voyage</p>
            </button>
          </div>
          {forWhom === 'other' && (
            <div className="mt-sm space-y-sm rounded-xl bg-primary-50/60 p-md ring-1 ring-primary-100">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  Nom du passager
                </span>
                <input
                  type="text"
                  value={passengerName}
                  onChange={(e) => setPassengerName(e.target.value)}
                  placeholder="Ex : Maman Rose"
                  className="mt-xs w-full rounded-lg bg-white px-md py-sm text-sm font-semibold text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  Téléphone du passager
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={passengerPhone}
                  onChange={(e) => setPassengerPhone(e.target.value)}
                  placeholder="+229 01 XX XX XX XX"
                  className="mt-xs w-full rounded-lg bg-white px-md py-sm text-sm font-semibold text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </label>
              <p className="text-[11px] text-neutral-600">
                Le chauffeur verra le nom du passager et l&apos;appellera directement à ce
                numéro. Vous suivez la course et payez depuis votre compte.
              </p>
            </div>
          )}
        </section>
      </div>

      <BottomBar>
        {confirmError && (
          <p className="mb-sm text-center text-sm font-medium text-error">{confirmError}</p>
        )}
        <PrimaryButton
          onClick={handleConfirm}
          disabled={loading || confirming || !selectedPrice || outOfZone || (isScheduled && !scheduledAt)}
        >
          <CarIcon className="h-5 w-5" />
          {confirming
            ? '…'
            : isDirect
              ? `Envoyer la demande à ${directFirst} · ${formatFcfa(finalPrice)} FCFA`
              : `${isScheduled ? t('commande.reserve') : t('commande.confirm_ride')} · ${formatFcfa(finalPrice)} FCFA`}
        </PrimaryButton>
        {!isScheduled && (
          <p className="mt-sm text-center text-[11px] text-neutral-400">
            {isDirect
              ? `Votre course est confirmée quand ${directFirst} l’accepte. Sans réponse après 2 minutes, vous pourrez relancer ou commander une course ordinaire.`
              : 'Votre course n’est confirmée que lorsqu’un chauffeur l’accepte.'}
          </p>
        )}
      </BottomBar>
    </main>
  );

  return (
    <>
      {step === 'route' ? routeScreen : step === 'vehicle' ? vehicleScreen : confirmScreen}

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
    </>
  );
}

// ---------------------------------------------------------------------------
// Éléments communs aux trois écrans

function StepHeader({ title, back }: { title: string; back: React.ReactNode }) {
  return (
    <header className="flex items-center gap-md px-lg pb-md pt-lg">
      {back}
      <h1 className="text-xl font-extrabold leading-tight text-neutral-900">{title}</h1>
    </header>
  );
}

const BACK_CLASS =
  'grid h-11 w-11 flex-none place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200 transition active:scale-95';

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label} className={BACK_CLASS}>
      <span className="text-xl leading-none">←</span>
    </Link>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={BACK_CLASS}>
      <span className="text-xl leading-none">←</span>
    </button>
  );
}

/** Barre d'action du bas : toujours visible, en dehors de la zone qui défile. */
function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-none border-t border-neutral-100 bg-white px-lg pt-md pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.12)]">
      {children}
    </div>
  );
}

function PrimaryButton({
  onClick, disabled, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-sm rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function CategoryChoice({
  category, price, priceLoading, availability, selected, onSelect, noDriverLabel, etaLabel, unavailableLabel,
}: {
  category: CategoryDef;
  price: PriceQuote | null;
  priceLoading: boolean;
  availability: AvailabilityRow | null;
  selected: boolean;
  onSelect: () => void;
  noDriverLabel: string;
  etaLabel: (min: number) => string;
  unavailableLabel: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-md rounded-2xl border-2 px-md py-sm text-left transition ${
        selected
          ? 'border-primary-500 bg-primary-50/70'
          : 'border-neutral-200 bg-white hover:border-primary-300'
      }`}
    >
      {/* Visuel de la catégorie : le client reconnaît le véhicule qu'il
          commande avant même de lire le nom. Chargement paresseux — cinq
          images sur un forfait 3G se paient. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/categories/${category.id}.webp`}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-12 w-16 flex-none object-contain"
      />

      <div className="min-w-0 flex-1">
        <p className="whitespace-nowrap text-[15px] font-bold text-neutral-900">TamCar {category.name}</p>
        <p className="line-clamp-2 text-xs leading-snug text-neutral-600">{category.tagline}</p>
        {availability && (
          <p
            className={`mt-0.5 text-[11px] font-semibold ${
              availability.online_count > 0 && availability.eta_min != null
                ? 'text-primary-600'
                : 'text-neutral-400'
            }`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {availability.online_count > 0
              ? availability.eta_min != null
                ? etaLabel(availability.eta_min)
                : ''
              : noDriverLabel}
          </p>
        )}
        {price?.is_corridor && (
          <p className="text-[11px] font-semibold text-primary-500">Prix fixe corridor</p>
        )}
      </div>

      <div className="flex flex-none flex-col items-end gap-0.5">
        {category.badge && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary-500 px-sm py-0.5 text-[10px] font-bold text-white">
            <StarIcon className="h-2.5 w-2.5" />
            {category.badge}
          </span>
        )}
        <p
          className="text-right text-lg font-extrabold text-neutral-900"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {price ? (
            <>
              {formatFcfa(price.price_total_fcfa)}
              <span className="ml-xs text-[10px] font-medium text-neutral-600">FCFA</span>
            </>
          ) : priceLoading ? (
            <span className="text-neutral-300">…</span>
          ) : (
            <span className="text-[11px] font-semibold text-neutral-400">{unavailableLabel}</span>
          )}
        </p>
      </div>
    </button>
  );
}

function PaymentChoice({
  id, label, sub, selected, onSelect, disabled = false,
}: {
  id: string;
  label: string;
  sub: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`flex flex-col items-start gap-xs rounded-xl border-2 p-md text-left transition ${
        disabled
          ? 'cursor-not-allowed border-neutral-200 bg-neutral-100 opacity-60'
          : selected
            ? 'border-primary-500 bg-primary-50 shadow-md'
            : 'border-neutral-200 bg-white hover:border-primary-300'
      }`}
      aria-pressed={selected}
      aria-label={label}
      data-payment-id={id}
    >
      <span className={`text-sm font-bold ${selected ? 'text-primary-700' : 'text-neutral-900'}`}>
        {label}
      </span>
      <span className="text-[10px] text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {sub}
      </span>
    </button>
  );
}
