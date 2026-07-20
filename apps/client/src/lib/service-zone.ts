// Zone de service TamCar — miroir client de la fonction Postgres
// _is_within_service_zone (backend/supabase/migrations/20260720050000_service_zone.sql).
// Doit rester en phase avec le SQL — si tu changes les rayons ou les centres,
// change les DEUX endroits.

const COTONOU: [number, number] = [6.365, 2.435];      // [lat, lng]
const PORTO_NOVO: [number, number] = [6.497, 2.605];
const ZONE_RADIUS_M = 15000;

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isWithinServiceZone(lat: number, lng: number): boolean {
  return (
    distanceMeters(lat, lng, COTONOU[0], COTONOU[1]) <= ZONE_RADIUS_M ||
    distanceMeters(lat, lng, PORTO_NOVO[0], PORTO_NOVO[1]) <= ZONE_RADIUS_M
  );
}

export const SERVICE_ZONE_LABEL = 'Cotonou et Porto-Novo';
