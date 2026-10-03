'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { supabaseBrowser } from '@/lib/supabase-browser';
import { COTONOU_CENTER, MAPBOX_TOKEN } from '@/lib/mapbox';
import { MAP_ENGINE, maplibreConfigured, maplibreStyle } from '@/lib/map-config';
import { vehicleMarkerSvg } from '@/lib/vehicle-marker';

// Même moteur de carte que le reste de l'app (MapLibre ou Mapbox, selon NEXT_PUBLIC_MAP_ENGINE).
const GL: typeof maplibregl =
  MAP_ENGINE === 'mapbox' ? (mapboxgl as unknown as typeof maplibregl) : maplibregl;

const REFRESH_MS = 5_000;
const STALE_SECONDS = 120; // au-delà : « signal ancien »
const TZ = 'Africa/Porto-Novo';

type LiveDriver = {
  driver_id: string;
  profile_id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  lat: number | null;
  lng: number | null;
  seen_seconds: number;
  rating_avg: number | string | null;
  driver_status: string;
  category: string | null;
  vehicle_color: string | null;
  vehicle_label: string | null;
  plate_number: string | null;
  ride_id: string | null;
  ride_status: string | null;
  ride_pickup: string | null;
  ride_dropoff: string | null;
  ride_price_fcfa: number | null;
  ride_client_name: string | null;
};

type RideStop = { order: number; address: string; lat: number; lng: number; status: string };
type CurrentRide = {
  id: string;
  status: string;
  requested_at: string | null;
  matched_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  distance_km: number | string | null;
  duration_min: number | null;
  price_total_fcfa: number | null;
  payment_method: string | null;
  category: string | null;
  with_ac: boolean | null;
  has_luggage: boolean | null;
  stops_count: number | null;
  passenger_name: string | null;
  passenger_phone: string | null;
  driver_distance_at_match_m: number | null;
  client_name: string | null;
  client_phone: string | null;
  stops: RideStop[];
};
type Detail = {
  driver: {
    id: string;
    profile_id: string;
    full_name: string;
    phone: string | null;
    avatar_url: string | null;
    status: string;
    kyc_status: string;
    is_online: boolean;
    rating_avg: number | string | null;
    rating_count: number;
    application_type: string | null;
    registered_at: string;
    last_seen_at: string | null;
    lat: number | null;
    lng: number | null;
  };
  vehicle: {
    id: string;
    plate_number: string | null;
    brand: string | null;
    model: string | null;
    year: number | null;
    color: string | null;
    category: string | null;
    seats: number | null;
  } | null;
  today: { rides_completed: number; volume_fcfa: number; cancelled_by_driver: number };
  ride: CurrentRide | null;
  recent: Array<{
    id: string;
    status: string;
    pickup_address: string | null;
    dropoff_address: string | null;
    price_total_fcfa: number | null;
    at: string | null;
  }>;
  wallets: { revenus_fcfa: number; epargne_fcfa: number };
};

type Filter = 'all' | 'busy' | 'free';

// ------------------------------------------------------------ libellés et formats
const CATEGORY_LABEL: Record<string, string> = {
  moto: 'Moto', tricycle: 'Tricycle', essentiel: 'Essentiel', confort: 'Confort', premium: 'VIP',
};
const RIDE_STATUS_LABEL: Record<string, string> = {
  matched: 'En route vers le client',
  arrived: 'Arrivé chez le client',
  in_progress: 'Course en cours',
  scheduled: 'Réservée',
};
const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Espèces',
  mobile_money_mtn: 'MTN Money',
  mobile_money_moov: 'Moov Money',
  tamcar_credit: 'TamCar Crédit',
};
const PAST_STATUS_LABEL: Record<string, string> = {
  completed: 'Terminée',
  cancelled_by_client: 'Annulée (client)',
  cancelled_by_driver: 'Annulée (chauffeur)',
  cancelled_by_admin: 'Annulée (équipe)',
  expired: 'Expirée',
  requested: 'En attente',
};

const fmtFcfa = (n: number | null | undefined) =>
  n == null ? '—' : `${Math.round(n).toLocaleString('fr-FR').replace(/,/g, ' ')} F`;

function ageLabel(sec: number): string {
  if (sec < 10) return 'à l’instant';
  if (sec < 60) return `il y a ${sec} s`;
  if (sec < 3600) return `il y a ${Math.floor(sec / 60)} min`;
  if (sec < 172800) return `il y a ${Math.floor(sec / 3600)} h`;
  return `il y a ${Math.floor(sec / 86400)} j`;
}

function timeOf(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

function dateTimeOf(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const digits = (p: string | null) => (p ?? '').replace(/\D/g, '');

/** Cap (°) de a vers b, 0 = nord, sens horaire. */
function bearing(a: [number, number], b: [number, number]): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const y = Math.sin(r(b[0] - a[0])) * Math.cos(r(b[1]));
  const x = Math.cos(r(a[1])) * Math.sin(r(b[1])) - Math.sin(r(a[1])) * Math.cos(r(b[1])) * Math.cos(r(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
function meters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b[1] - a[1]);
  const dLng = r(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const PIN_GREEN =
  '<svg width="26" height="34" viewBox="0 0 32 42" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))">' +
  '<path d="M16 1C8.8 1 3 6.8 3 14c0 9 13 26 13 26s13-17 13-26C29 6.8 23.2 1 16 1Z" fill="#16A34A"/>' +
  '<circle cx="16" cy="14" r="6.5" fill="#fff"/><circle cx="16" cy="14" r="3" fill="#16A34A"/></svg>';
const PIN_RED =
  '<svg width="26" height="34" viewBox="0 0 32 42" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))">' +
  '<path d="M16 1C8.8 1 3 6.8 3 14c0 9 13 26 13 26s13-17 13-26C29 6.8 23.2 1 16 1Z" fill="#DC2626"/>' +
  '<circle cx="16" cy="14" r="6.5" fill="#fff"/><circle cx="16" cy="14" r="3" fill="#DC2626"/></svg>';

function pinEl(svg: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.lineHeight = '0';
  el.innerHTML = svg;
  return el;
}

type MarkerEntry = { marker: maplibregl.Marker; el: HTMLDivElement; sig: string; pos: [number, number]; heading: number };

function driverState(d: LiveDriver): 'busy' | 'free' | 'stale' {
  if (d.seen_seconds > STALE_SECONDS) return 'stale';
  return d.ride_id ? 'busy' : 'free';
}

const STATE_COLOR = { busy: '#F59E0B', free: '#16A34A', stale: '#9CA3AF' } as const;

function markerHtml(d: LiveDriver, selected: boolean, heading: number): string {
  const state = driverState(d);
  const ring = selected ? 'box-shadow:0 0 0 3px #2563EB,0 0 0 6px rgba(37,99,235,.25);border-radius:50%;' : '';
  return (
    `<span style="display:block;position:relative;width:44px;height:44px;${ring}opacity:${state === 'stale' ? 0.5 : 1}">` +
    `<span class="tc-veh-nub-rot" style="display:block;transform:rotate(${heading}deg)">` +
    vehicleMarkerSvg({ category: d.category ?? undefined, color: d.vehicle_color, size: 44 }) +
    '</span>' +
    `<span style="position:absolute;right:-3px;top:-3px;width:13px;height:13px;border-radius:50%;` +
    `background:${STATE_COLOR[state]};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35)"></span>` +
    '</span>'
  );
}

// ------------------------------------------------------------ composant
export function LiveDriversMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerEntry>>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (globalThis as any).Map(),
  );
  const rideMarkersRef = useRef<maplibregl.Marker[]>([]);
  const fittedRef = useRef(false);
  const selectedRef = useRef<string | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<LiveDriver[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  selectedRef.current = selectedId;

  // ---- carte (une seule fois)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let style: string | StyleSpecification;
    if (MAP_ENGINE === 'mapbox') {
      if (!MAPBOX_TOKEN) {
        setMapError('Le jeton de la carte (Mapbox) n’est pas configuré.');
        return;
      }
      mapboxgl.accessToken = MAPBOX_TOKEN;
      style = 'mapbox://styles/mapbox/streets-v12';
    } else {
      if (!maplibreConfigured()) {
        setMapError('La carte n’est pas configurée (MapLibre).');
        return;
      }
      style = maplibreStyle();
    }

    const map = new GL.Map({
      container: containerRef.current,
      style,
      center: COTONOU_CENTER,
      zoom: 11,
      attributionControl: false,
    });
    map.addControl(new GL.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    setMapReady(true);

    const markers = markersRef.current;
    return () => {
      // Les marqueurs vivent sur la carte détruite : on les oublie pour qu'un remontage les recrée.
      markers.forEach((m) => m.marker.remove());
      markers.clear();
      rideMarkersRef.current.forEach((m) => m.remove());
      rideMarkersRef.current = [];
      fittedRef.current = false;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // ---- liste des chauffeurs connectés : toutes les 5 s, onglet visible seulement
  const loadDrivers = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const { data, error: err } = await supabaseBrowser.rpc('admin_live_drivers');
    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    setDrivers((data ?? []) as LiveDriver[]);
    setUpdatedAt(Date.now());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void loadDrivers();
    const t = setInterval(() => void loadDrivers(), REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) void loadDrivers();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadDrivers]);

  // ---- fiche du chauffeur sélectionné : toutes les 5 s
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      const { data, error: err } = await supabaseBrowser.rpc('admin_live_driver_detail', { p_driver_id: selectedId });
      if (!alive) return;
      if (err) {
        setDetailError(err.message);
        return;
      }
      setDetailError(null);
      setDetail((data ?? null) as Detail | null);
    };
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [selectedId]);

  // ---- chauffeurs affichés (filtre + recherche)
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter((d) => {
      if (filter === 'busy' && !d.ride_id) return false;
      if (filter === 'free' && d.ride_id) return false;
      if (!q) return true;
      return `${d.full_name} ${d.phone ?? ''} ${d.plate_number ?? ''} ${d.vehicle_label ?? ''}`.toLowerCase().includes(q);
    });
  }, [drivers, filter, search]);

  const counts = useMemo(
    () => ({
      total: drivers.length,
      busy: drivers.filter((d) => d.ride_id).length,
      free: drivers.filter((d) => !d.ride_id).length,
      stale: drivers.filter((d) => d.seen_seconds > STALE_SECONDS).length,
      noPos: drivers.filter((d) => d.lat == null || d.lng == null).length,
    }),
    [drivers],
  );

  // ---- marqueurs sur la carte
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const markers = markersRef.current;
    const keep = new Set<string>();

    for (const d of visible) {
      if (d.lat == null || d.lng == null) continue;
      keep.add(d.driver_id);
      const pos: [number, number] = [d.lng, d.lat];
      const selected = d.driver_id === selectedId;
      const existing = markers.get(d.driver_id);
      if (!existing) {
        const el = document.createElement('div');
        el.className = 'tc-veh-marker';
        el.title = d.full_name;
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setSelectedId(d.driver_id);
        });
        const heading = 0;
        el.innerHTML = markerHtml(d, selected, heading);
        const marker = new GL.Marker({ element: el }).setLngLat(pos).addTo(map);
        markers.set(d.driver_id, { marker, el, sig: `${driverState(d)}|${selected}|${d.category}|${d.vehicle_color}`, pos, heading });
      } else {
        // Cap déduit du déplacement (la base ne stocke pas le cap) ; inchangé si le chauffeur est quasi immobile.
        let heading = existing.heading;
        if (meters(existing.pos, pos) > 12) heading = bearing(existing.pos, pos);
        const sig = `${driverState(d)}|${selected}|${d.category}|${d.vehicle_color}|${Math.round(heading / 5)}`;
        if (sig !== existing.sig) {
          existing.el.innerHTML = markerHtml(d, selected, heading);
          existing.sig = sig;
        }
        existing.el.title = d.full_name;
        if (existing.pos[0] !== pos[0] || existing.pos[1] !== pos[1]) existing.marker.setLngLat(pos);
        existing.pos = pos;
        existing.heading = heading;
      }
    }
    markers.forEach((entry, id) => {
      if (!keep.has(id)) {
        entry.marker.remove();
        markers.delete(id);
      }
    });

    // Premier cadrage : englobe tous les chauffeurs connectés, une seule fois.
    if (!fittedRef.current && loaded) {
      const pts = drivers.filter((d) => d.lat != null && d.lng != null).map((d) => [d.lng as number, d.lat as number] as [number, number]);
      if (pts.length > 0) {
        const b = new GL.LngLatBounds(pts[0], pts[0]);
        pts.forEach((p) => b.extend(p));
        map.fitBounds(b, { padding: 80, maxZoom: 15, duration: 0 });
      }
      fittedRef.current = true;
    }
  }, [visible, drivers, selectedId, mapReady, loaded]);

  // ---- départ et arrivée de la course en cours du chauffeur sélectionné
  const rideKey = detail?.ride
    ? `${detail.ride.id}|${detail.ride.pickup_lat}|${detail.ride.pickup_lng}|${detail.ride.dropoff_lat}|${detail.ride.dropoff_lng}`
    : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    rideMarkersRef.current.forEach((m) => m.remove());
    rideMarkersRef.current = [];
    const r = detail?.ride;
    if (!r) return;
    const add = (lat: number | null, lng: number | null, svg: string) => {
      if (lat == null || lng == null) return;
      const m = new GL.Marker({ element: pinEl(svg), anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
      rideMarkersRef.current.push(m);
    };
    add(r.pickup_lat, r.pickup_lng, PIN_GREEN);
    add(r.dropoff_lat, r.dropoff_lng, PIN_RED);
    // Recréé seulement quand la course ou ses points changent, pas à chaque rafraîchissement de 5 s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideKey, mapReady]);

  const selectDriver = useCallback((d: LiveDriver) => {
    setSelectedId(d.driver_id);
    const map = mapRef.current;
    if (map && d.lat != null && d.lng != null) {
      map.easeTo({ center: [d.lng, d.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
    }
  }, []);

  const selectedLive = selectedId ? drivers.find((d) => d.driver_id === selectedId) ?? null : null;

  return (
    <div className="grid gap-md lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Carte */}
      <div className="relative h-[60vh] min-h-[420px] overflow-hidden rounded-xl bg-neutral-100 shadow-sm ring-1 ring-neutral-200 lg:h-[calc(100dvh-190px)]">
        {/* Hauteur et largeur explicites : la feuille de style de la carte impose position:relative au conteneur,
            ce qui annule un positionnement absolu et le réduirait à zéro de hauteur. */}
        <div ref={containerRef} className="h-full w-full" />
        {mapError && (
          <div className="absolute inset-0 grid place-items-center p-lg text-center text-sm font-semibold text-neutral-600">{mapError}</div>
        )}
        <div className="pointer-events-none absolute left-md top-md flex flex-wrap gap-xs">
          <Chip color="bg-white text-neutral-900" label={`${counts.total} connecté${counts.total > 1 ? 's' : ''}`} />
          <Chip color="bg-warning/90 text-white" label={`${counts.busy} en course`} />
          <Chip color="bg-success/90 text-white" label={`${counts.free} libre${counts.free > 1 ? 's' : ''}`} />
        </div>
        <div className="pointer-events-none absolute bottom-md left-md rounded-lg bg-white/90 px-md py-xs text-[11px] text-neutral-600 shadow-sm">
          <span className="font-bold text-warning">●</span> en course · <span className="font-bold text-success">●</span> libre ·{' '}
          <span className="font-bold text-neutral-400">●</span> signal ancien (&gt; 2 min)
        </div>
      </div>

      {/* Panneau */}
      <aside className="flex min-h-0 flex-col rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 lg:h-[calc(100dvh-190px)]">
        {selectedId ? (
          <DriverPanel
            live={selectedLive}
            detail={detail}
            error={detailError}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <>
            <div className="border-b border-neutral-200 p-md">
              <div className="flex flex-wrap items-center gap-xs">
                {(
                  [
                    ['all', `Tous (${counts.total})`],
                    ['busy', `En course (${counts.busy})`],
                    ['free', `Libres (${counts.free})`],
                  ] as Array<[Filter, string]>
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k)}
                    className={`rounded-full px-md py-xs text-xs font-bold transition ${
                      filter === k ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom, téléphone, plaque…"
                className="mt-sm w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
              />
              <p className="mt-xs text-[11px] text-neutral-500">
                {updatedAt ? `Mis à jour à ${timeOf(new Date(updatedAt).toISOString())}` : 'Chargement…'}
                {counts.stale > 0 && ` · ${counts.stale} signal(aux) ancien(s)`}
                {counts.noPos > 0 && ` · ${counts.noPos} sans position`}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {error && <p className="m-md rounded-lg bg-error/10 p-md text-xs font-semibold text-error">{error}</p>}
              {loaded && visible.length === 0 && !error && (
                <p className="p-lg text-center text-sm text-neutral-500">
                  {drivers.length === 0 ? 'Aucun chauffeur connecté pour le moment.' : 'Aucun chauffeur ne correspond.'}
                </p>
              )}
              <ul>
                {visible.map((d) => {
                  const st = driverState(d);
                  return (
                    <li key={d.driver_id} className="border-b border-neutral-100 last:border-0">
                      <button
                        type="button"
                        onClick={() => selectDriver(d)}
                        className="flex w-full items-center gap-md px-md py-sm text-left transition hover:bg-neutral-50"
                      >
                        <Avatar name={d.full_name} url={d.avatar_url} color={STATE_COLOR[st]} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-neutral-900">{d.full_name}</span>
                          <span className="block truncate text-[11px] text-neutral-500">
                            {[CATEGORY_LABEL[d.category ?? ''] ?? null, d.vehicle_label, d.plate_number].filter(Boolean).join(' · ') || 'Véhicule non renseigné'}
                          </span>
                          <span className="block truncate text-[11px] font-semibold" style={{ color: STATE_COLOR[st] }}>
                            {d.ride_id
                              ? `${RIDE_STATUS_LABEL[d.ride_status ?? ''] ?? 'En course'}${d.ride_client_name ? ` · ${d.ride_client_name}` : ''}`
                              : 'Libre'}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-[10px] text-neutral-500">
                          {d.lat == null ? 'sans position' : ageLabel(d.seen_seconds)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

// ------------------------------------------------------------ éléments d'interface
function Chip({ color, label }: { color: string; label: string }) {
  return <span className={`rounded-full px-md py-xs text-xs font-bold shadow-sm ${color}`}>{label}</span>;
}

function Avatar({ name, url, color }: { name: string; url: string | null; color: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2" style={{ ['--tw-ring-color' as string]: color }} />
  ) : (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-extrabold text-white"
      style={{ background: color }}
    >
      {initials}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-md py-1 text-sm">
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span className="text-right font-semibold text-neutral-900">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-neutral-100 px-md py-md last:border-0">
      <h3 className="mb-xs text-[10px] font-bold uppercase tracking-wider text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

function DriverPanel({
  live,
  detail,
  error,
  onBack,
}: {
  live: LiveDriver | null;
  detail: Detail | null;
  error: string | null;
  onBack: () => void;
}) {
  const d = detail?.driver;
  const ride = detail?.ride ?? null;
  const st = live ? driverState(live) : null;
  const phone = digits(d?.phone ?? live?.phone ?? null);
  const veh = detail?.vehicle;
  const wallet = detail?.wallets;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-neutral-200 p-md">
        <button type="button" onClick={onBack} className="text-xs font-bold text-primary-700 hover:underline">
          ← Tous les chauffeurs
        </button>
        <div className="mt-sm flex items-center gap-md">
          <Avatar name={d?.full_name ?? live?.full_name ?? '?'} url={d?.avatar_url ?? live?.avatar_url ?? null} color={st ? STATE_COLOR[st] : '#9CA3AF'} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-neutral-900">{d?.full_name ?? live?.full_name ?? 'Chargement…'}</p>
            <p className="text-xs text-neutral-600">
              {d ? (d.is_online ? (st === 'stale' ? 'Connecté, signal ancien' : 'Connecté') : 'Hors ligne') : ''}
              {live && live.lat != null ? ` · position ${ageLabel(live.seen_seconds)}` : ''}
            </p>
            {d && Number(d.rating_avg) > 0 && (
              <p className="text-xs text-neutral-600">
                Note {Number(d.rating_avg).toFixed(2)} / 5 ({d.rating_count} avis)
              </p>
            )}
          </div>
        </div>
        {phone && (
          <div className="mt-sm flex gap-xs">
            <a href={`tel:+${phone}`} className="rounded-lg bg-primary-500 px-md py-xs text-xs font-bold text-white hover:brightness-110">
              Appeler
            </a>
            <a
              href={`https://wa.me/${phone}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-neutral-300 px-md py-xs text-xs font-bold text-neutral-700 hover:bg-neutral-50"
            >
              WhatsApp
            </a>
            {d && (
              <Link href={`/admin/drivers/${d.id}`} className="rounded-lg border border-neutral-300 px-md py-xs text-xs font-bold text-neutral-700 hover:bg-neutral-50">
                Historique complet
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && <p className="m-md rounded-lg bg-error/10 p-md text-xs font-semibold text-error">{error}</p>}
        {!detail && !error && <p className="p-lg text-center text-sm text-neutral-500">Chargement de la fiche…</p>}

        {detail && (
          <>
            <Section title="Course en cours">
              {ride ? (
                <div>
                  <p className="mb-xs inline-block rounded-full bg-warning/15 px-md py-0.5 text-xs font-bold text-warning">
                    {RIDE_STATUS_LABEL[ride.status] ?? ride.status}
                  </p>
                  <div className="mt-xs space-y-xs text-sm">
                    <p>
                      <span className="mr-xs font-bold text-success">Départ</span>
                      <span className="text-neutral-900">{ride.pickup_address ?? '—'}</span>
                    </p>
                    {ride.stops.map((s) => (
                      <p key={s.order}>
                        <span className="mr-xs font-bold text-primary-700">Arrêt {s.order}</span>
                        <span className="text-neutral-900">{s.address}</span>
                      </p>
                    ))}
                    <p>
                      <span className="mr-xs font-bold text-error">Arrivée</span>
                      <span className="text-neutral-900">{ride.dropoff_address ?? '—'}</span>
                    </p>
                  </div>
                  <div className="mt-sm">
                    <Row label="Client">
                      {ride.client_name ?? '—'}
                      {ride.passenger_name ? ` (pour ${ride.passenger_name})` : ''}
                    </Row>
                    {(ride.client_phone || ride.passenger_phone) && (
                      <Row label="Téléphone">
                        <a className="text-primary-700 underline" href={`tel:+${digits(ride.passenger_phone ?? ride.client_phone)}`}>
                          {ride.passenger_phone ?? ride.client_phone}
                        </a>
                      </Row>
                    )}
                    <Row label="Prix">{fmtFcfa(ride.price_total_fcfa)}</Row>
                    <Row label="Paiement">{PAYMENT_LABEL[ride.payment_method ?? ''] ?? ride.payment_method ?? '—'}</Row>
                    <Row label="Trajet">
                      {ride.distance_km != null ? `${Number(ride.distance_km).toFixed(1)} km` : '—'}
                      {ride.duration_min != null ? ` · ${ride.duration_min} min` : ''}
                    </Row>
                    <Row label="Catégorie demandée">
                      {CATEGORY_LABEL[ride.category ?? ''] ?? '—'}
                      {ride.with_ac ? ' · clim' : ''}
                      {ride.has_luggage ? ' · bagages' : ''}
                    </Row>
                    <Row label="Demandée à">{timeOf(ride.requested_at)}</Row>
                    <Row label="Acceptée à">{timeOf(ride.matched_at)}</Row>
                    {ride.arrived_at && <Row label="Arrivé chez le client à">{timeOf(ride.arrived_at)}</Row>}
                    {ride.started_at && <Row label="Course démarrée à">{timeOf(ride.started_at)}</Row>}
                    {ride.driver_distance_at_match_m != null && (
                      <Row label="Distance à l’acceptation">{(ride.driver_distance_at_match_m / 1000).toFixed(1)} km</Row>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-600">Aucune course en cours : le chauffeur est libre.</p>
              )}
            </Section>

            <Section title="Véhicule">
              {veh ? (
                <>
                  <Row label="Modèle">
                    {[veh.brand, veh.model, veh.year].filter(Boolean).join(' ') || '—'}
                  </Row>
                  <Row label="Plaque">{veh.plate_number ?? '—'}</Row>
                  <Row label="Catégorie">{CATEGORY_LABEL[veh.category ?? ''] ?? '—'}</Row>
                  <Row label="Couleur">{veh.color ?? '—'}</Row>
                </>
              ) : (
                <p className="text-sm text-neutral-600">Aucun véhicule affecté.</p>
              )}
            </Section>

            <Section title="Aujourd’hui">
              <Row label="Courses terminées">{detail.today.rides_completed}</Row>
              <Row label="Volume">{fmtFcfa(detail.today.volume_fcfa)}</Row>
              <Row label="Annulations par le chauffeur">{detail.today.cancelled_by_driver}</Row>
            </Section>

            <Section title="Profil">
              <Row label="Statut">{detail.driver.status}</Row>
              <Row label="Vérification d’identité">{detail.driver.kyc_status}</Row>
              <Row label="Formule">{detail.driver.application_type === 'proprietaire' ? 'Propriétaire' : 'Cession'}</Row>
              <Row label="Inscrit depuis">{dateTimeOf(detail.driver.registered_at)}</Row>
              <Row label="Portefeuille revenus">
                <span className={(wallet?.revenus_fcfa ?? 0) < 0 ? 'text-error' : ''}>{fmtFcfa(wallet?.revenus_fcfa)}</span>
              </Row>
              <Row label="Épargne TamAssur">{fmtFcfa(wallet?.epargne_fcfa)}</Row>
            </Section>

            <Section title="Dernières courses">
              {detail.recent.length === 0 ? (
                <p className="text-sm text-neutral-600">Aucune course terminée ou annulée.</p>
              ) : (
                <ul className="space-y-sm">
                  {detail.recent.map((r) => (
                    <li key={r.id} className="text-xs">
                      <p className="font-semibold text-neutral-900">
                        {r.pickup_address ?? '—'} → {r.dropoff_address ?? '—'}
                      </p>
                      <p className="text-neutral-500">
                        {PAST_STATUS_LABEL[r.status] ?? r.status} · {fmtFcfa(r.price_total_fcfa)} · {dateTimeOf(r.at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
