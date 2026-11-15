// Donnees FICTIVES de la demonstration (aucune personne reelle ; les prix suivent la grille TamCar publiee).
const ID = '00000000-0000-4000-8000-000000000001';
// meme horloge que la page photographiee : aujourd'hui, 10 h 40 a Porto-Novo (09 h 40 UTC)
const _n = new Date();
const FAUX_NOW = Date.UTC(_n.getUTCFullYear(), _n.getUTCMonth(), _n.getUTCDate(), 9, 40, 0);
const NOW = new Date(FAUX_NOW).toISOString();

const DID = '00000000-0000-4000-8000-000000000002'; // le chauffeur de la demonstration (hors ligne)
const DID2 = '00000000-0000-4000-8000-000000000003'; // le meme chauffeur, en ligne, avec des courses a accepter
const mkUser = (id, nom, tel) => ({
  id, aud: 'authenticated', role: 'authenticated', email: `demo-${tel}@tamcar.app`, phone: tel,
  app_metadata: { provider: 'phone', providers: ['phone'] }, user_metadata: { full_name: nom },
  created_at: NOW, updated_at: NOW, last_sign_in_at: NOW,
});
export const USERS = { [ID]: mkUser(ID, 'Aïcha Dossou', '22990000001'), [DID]: mkUser(DID, 'Koffi Adjovi', '22997000000'), [DID2]: mkUser(DID2, 'Koffi Adjovi', '22997000002') };
export const USER = USERS[ID];

function jwt(id) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: id, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.demo`;
}
export function session(id = ID) {
  return { access_token: jwt(id), token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: 4102444800, refresh_token: 'demo-refresh', user: USERS[id] };
}

// ---------- grille de prix : points (km -> FCFA) de la grille TamCar (course minimale, 3 km, 6,1 km, 12 km)
const GRILLE = {
  moto: [[0, 200], [3, 200], [6.1, 450], [12, 800]],
  tricycle: [[0, 350], [3, 550], [6.1, 850], [12, 1400]],
  essentiel: [[0, 500], [3, 700], [6.1, 1000], [12, 1950]],
  confort: [[0, 700], [3, 950], [6.1, 1350], [12, 2600]],
  premium: [[0, 950], [3, 1300], [6.1, 1800], [12, 3300]],
};
function prix(cat, km) {
  const pts = GRILLE[cat] || GRILLE.essentiel;
  let p = pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) {
    if (km <= pts[i][0]) {
      const [k0, p0] = pts[i - 1];
      const [k1, p1] = pts[i];
      p = p0 + ((km - k0) / (k1 - k0)) * (p1 - p0);
      break;
    }
  }
  return Math.max(pts[0][1], Math.round(p / 50) * 50);
}
const iso = (minutes) => new Date(FAUX_NOW + minutes * 60000).toISOString();

const DRIVER = {
  driver_full_name: 'Koffi Adjovi', driver_phone: '22997000000', driver_avatar_url: null, driver_rating_avg: 4.9, driver_rating_count: 312,
  vehicle_plate: 'AB 1234 RB', vehicle_brand: 'Toyota', vehicle_model: 'Corolla', vehicle_color: 'Blanc',
};
const RIDE = {
  id: 'demo-matched', client_id: ID, driver_id: 'drv-1',
  pickup_address: 'Haie Vive, Cotonou', pickup_lat: 6.3555, pickup_lng: 2.3925,
  dropoff_address: 'Marché Dantokpa, Cotonou', dropoff_lat: 6.3667, dropoff_lng: 2.4333,
  distance_km: 5.8, duration_min: 13, price_total_fcfa: 950, status: 'matched', payment_method: 'tamcar_credit',
  requested_at: iso(-4), requested_category: 'essentiel', vehicle_category: 'essentiel', matched_at: iso(-2), started_at: null, ended_at: null,
  ...DRIVER, driver_lat: 6.3585, driver_lng: 2.3968, stops_count: 0,
};

// courses terminees du chauffeur de la demonstration (aujourd'hui et ces derniers jours)
const COURSES_CHAUFFEUR = [
  [-40, 'Haie Vive', 'Marché Dantokpa', 950, 5.8], [-95, 'Fidjrossè', 'Aéroport de Cotonou', 1100, 6.4], [-150, 'Akpakpa', 'Stade de l’Amitié', 1300, 7.9],
  [-60 * 26, 'Cadjèhoun', 'Ganhi', 850, 4.9], [-60 * 27, 'Gbégamey', 'Haie Vive', 700, 3.6], [-60 * 50, 'Ganhi', 'Fidjrossè', 1450, 8.2],
  [-60 * 52, 'Dantokpa', 'Akpakpa', 800, 4.4], [-60 * 74, 'Aéroport de Cotonou', 'Cadjèhoun', 600, 3.1], [-60 * 98, 'Haie Vive', 'Ganhi', 900, 5.2],
  [-60 * 120, 'Akpakpa', 'Fidjrossè', 1500, 9.1],
].map(([m, a, b, prixFcfa, km], i) => ({
  id: `dr${i}`, driver_id: 'drv-me', client_id: 'autre-client', status: 'completed', pickup_address: `${a}, Cotonou`, dropoff_address: `${b}, Cotonou`,
  price_total_fcfa: prixFcfa, distance_km: km, driver_share_fcfa: Math.round(prixFcfa * 0.4 / 10) * 10, driver_rachat_fcfa: 0,
  requested_at: iso(m - 12), ended_at: iso(m), matched_at: iso(m - 10), requested_category: 'essentiel',
}));

export const TABLES = {
  profiles: [
    { id: ID, full_name: 'Aïcha Dossou', role: 'client', phone: '22990000001', email: 'demo@tamcar.app', language: 'fr' },
    { id: DID, full_name: 'Koffi Adjovi', role: 'driver', phone: '22997000000', email: 'koffi@tamcar.app', language: 'fr' },
    { id: DID2, full_name: 'Koffi Adjovi', role: 'driver', phone: '22997000002', email: 'koffi2@tamcar.app', language: 'fr' },
  ],
  terms_acceptances: [
    { id: 'ta-1', profile_id: ID, doc: 'cgu', version: '2026-10-21', accepted_at: NOW },
    { id: 'ta-2', profile_id: DID, doc: 'cgu', version: '2026-10-21', accepted_at: NOW },
    { id: 'ta-3', profile_id: DID2, doc: 'cgu', version: '2026-10-21', accepted_at: NOW },
  ],
  drivers: [
    { id: 'drv-me', profile_id: DID, application_type: 'cession', current_vehicle_id: 'veh-me', status: 'approved', is_online: false },
    { id: 'drv-on', profile_id: DID2, application_type: 'cession', current_vehicle_id: 'veh-me', status: 'approved', is_online: true },
  ],
  vehicles: [{ id: 'veh-me', brand: 'Toyota', model: 'Corolla', plate_number: 'AB 1234 RB', category: 'essentiel', color: 'Blanc' }],
  rides_view: [
    { id: 'h1', client_id: ID, driver_id: 'drv-1', pickup_address: 'Haie Vive, Cotonou', dropoff_address: 'Marché Dantokpa, Cotonou', price_total_fcfa: 950, distance_km: 5.8, status: 'completed', requested_at: iso(-60 * 5), requested_category: 'essentiel' },
    { id: 'h2', client_id: ID, driver_id: 'drv-3', pickup_address: 'Akpakpa, Cotonou', dropoff_address: 'Aéroport de Cotonou', price_total_fcfa: 450, distance_km: 5.4, status: 'completed', requested_at: iso(-60 * 28), requested_category: 'moto' },
    { id: 'h3', client_id: ID, driver_id: 'drv-2', pickup_address: 'Fidjrossè Plage, Cotonou', dropoff_address: 'Haie Vive, Cotonou', price_total_fcfa: 1350, distance_km: 6.1, status: 'completed', requested_at: iso(-60 * 52), requested_category: 'confort' },
    { id: 'h4', client_id: ID, driver_id: 'drv-1', pickup_address: 'Cotonou, Dantokpa', dropoff_address: 'Porto-Novo, Marché Ouando', price_total_fcfa: 3500, distance_km: 31, status: 'completed', requested_at: iso(-60 * 80), requested_category: 'essentiel' },
    ...COURSES_CHAUFFEUR,
  ],
};

export const RPC = {
  my_wallets: (a, ctx) => (ctx.sub === DID || ctx.sub === DID2
    ? [{ kind: 'tamcar_revenus', balance_fcfa: 42500 }, { kind: 'tamcar_epargne', balance_fcfa: 96000 }, { kind: 'tamcar_credit', balance_fcfa: 0 }]
    : [{ kind: 'tamcar_credit', balance_fcfa: 12500 }, { kind: 'tamcar_epargne', balance_fcfa: 0 }]),
  pending_rides_for_driver: (a, ctx) => (ctx.sub !== DID2 ? [] : [
    { id: 'o1', pickup_address: 'Haie Vive, Cotonou', dropoff_address: 'Marché Dantokpa, Cotonou', pickup_lat: 6.3555, pickup_lng: 2.3925, dropoff_lat: 6.3667, dropoff_lng: 2.4333, distance_from_driver_m: 640, distance_km: 5.8, duration_min: 13, price_total_fcfa: 950, driver_share_fcfa: 380, requested_at: iso(-0.5), requested_category: 'essentiel', downgrade_accepted_at: null, is_below_driver_category: false },
    { id: 'o2', pickup_address: 'Fidjrossè Plage, Cotonou', dropoff_address: 'Aéroport de Cotonou', pickup_lat: 6.3436, pickup_lng: 2.3601, dropoff_lat: 6.3572, dropoff_lng: 2.3843, distance_from_driver_m: 1900, distance_km: 6.4, duration_min: 15, price_total_fcfa: 1100, driver_share_fcfa: 440, requested_at: iso(-1), requested_category: 'essentiel', downgrade_accepted_at: null, is_below_driver_category: false },
  ]),
  pending_scheduled_rides_for_driver: [],
  driver_today_volume: [{ volume_today: 9800, floor_fcfa: 13700, pct: 72, bonus_now_fcfa: 0, rate_per_1000: 0, fcfa_to_floor: 3900, bonus_started: false, bonus_start: '2027-01-01', bonus_day: true }],
  driver_floor_today: [],
  my_insurance_status: [],
  my_tamassur_plan: [{ min_amount: 1000, amount: 1000, fund_pct: 0, goal_fcfa: 500000, optional: false, enrolled: true }],
  my_tamassur_withdrawal_status: [{ eligible_on: '2028-11-20', months: 24, goal_fcfa: 500000, late_days: 0, reason: '' }],
  my_active_ride: [],
  my_unread_messages_count: 0,
  my_favorite_places: [
    { id: 'fav-1', kind: 'home', label: 'Maison', address: 'Akpakpa, Cotonou', lat: 6.3566, lng: 2.4486 },
    { id: 'fav-2', kind: 'work', label: 'Travail', address: 'Haie Vive, Cotonou', lat: 6.3555, lng: 2.3925 },
  ],
  my_recent_destinations: [
    { address: 'Marché Dantokpa, Cotonou', lat: 6.3667, lng: 2.4333 },
    { address: 'Aéroport de Cotonou', lat: 6.3572, lng: 2.3843 },
    { address: 'Fidjrossè Plage, Cotonou', lat: 6.3436, lng: 2.3601 },
  ],
  recent_addresses_for_user: [],
  compute_price: (a) => ({ price_total_fcfa: prix(a.p_category, a.distance_km), driver_cash_fcfa: 0, driver_rachat_fcfa: 0, dealer_share_fcfa: 0, platform_share_fcfa: 0, is_corridor: false, corridor_detail: null }),
  drivers_availability_by_category: [
    { category: 'moto', online_count: 14, nearest_driver_distance_m: 420, eta_min: 3 },
    { category: 'tricycle', online_count: 6, nearest_driver_distance_m: 800, eta_min: 5 },
    { category: 'essentiel', online_count: 11, nearest_driver_distance_m: 650, eta_min: 4 },
    { category: 'confort', online_count: 5, nearest_driver_distance_m: 1100, eta_min: 6 },
    { category: 'premium', online_count: 2, nearest_driver_distance_m: 1800, eta_min: 8 },
  ],
  nearby_drivers_for_map: [
    { driver_id: 'n1', lat: 6.3572, lng: 2.3990, category: 'moto' }, { driver_id: 'n2', lat: 6.3530, lng: 2.3890, category: 'essentiel' },
    { driver_id: 'n3', lat: 6.3601, lng: 2.4010, category: 'confort' }, { driver_id: 'n4', lat: 6.3510, lng: 2.3960, category: 'tricycle' },
  ],
  ride_with_driver_details: (a) => {
    const id = a.ride_id || 'demo-matched';
    if (id === 'demo-progress') return [{ ...RIDE, id, status: 'in_progress', started_at: iso(-5), driver_lat: 6.3610, driver_lng: 2.4090 }];
    if (id === 'demo-done') return [{ ...RIDE, id, status: 'completed', started_at: iso(-20), ended_at: iso(-2), driver_lat: 6.3667, driver_lng: 2.4333 }];
    if (id === 'demo-arrived') return [{ ...RIDE, id, status: 'arrived', driver_lat: 6.3556, driver_lng: 2.3926 }];
    return [{ ...RIDE, id }];
  },
  wallet_transactions_for_user: [
    { id: 't1', wallet_kind: 'tamcar_credit', type: 'topup', amount_fcfa: 10000, provider: 'mtn', status: 'success', ride_id: null, created_at: iso(-60 * 24 * 2) },
    { id: 't2', wallet_kind: 'tamcar_credit', type: 'payment', amount_fcfa: -950, provider: 'internal', status: 'success', ride_id: 'h1', created_at: iso(-60 * 5) },
    { id: 't3', wallet_kind: 'tamcar_credit', type: 'referral_bonus', amount_fcfa: 1000, provider: 'internal', status: 'success', ride_id: null, created_at: iso(-60 * 24 * 4) },
    { id: 't4', wallet_kind: 'tamcar_credit', type: 'topup', amount_fcfa: 5000, provider: 'moov', status: 'success', ride_id: null, created_at: iso(-60 * 24 * 9) },
  ],
  my_recent_drivers: [
    { driver_id: 'drv-1', driver_name: 'Koffi Adjovi', driver_rating: 4.9, vehicle_category: 'essentiel', vehicle_label: 'Toyota Corolla blanche', is_online: true, rides_count: 6, last_ride_at: iso(-60 * 5) },
    { driver_id: 'drv-2', driver_name: 'Mariam Sanni', driver_rating: 4.8, vehicle_category: 'confort', vehicle_label: 'Hyundai Elantra grise', is_online: false, rides_count: 3, last_ride_at: iso(-60 * 52) },
    { driver_id: 'drv-3', driver_name: 'Barnabé Houngbo', driver_rating: 4.9, vehicle_category: 'moto', vehicle_label: 'Moto électrique', is_online: true, rides_count: 9, last_ride_at: iso(-60 * 28) },
  ],
  my_bookings: [
    { id: 'b1', status: 'scheduled', scheduled_at: iso(60 * 20), pickup_address: 'Akpakpa, Cotonou', dropoff_address: 'Haie Vive, Cotonou', price_total_fcfa: 950, requested_category: 'essentiel', payment_method: 'tamcar_credit', driver_full_name: 'Koffi Adjovi', driver_phone: '22997000000', driver_confirmed: true, is_upcoming: true },
    { id: 'b2', status: 'scheduled', scheduled_at: iso(60 * 44), pickup_address: 'Akpakpa, Cotonou', dropoff_address: 'Haie Vive, Cotonou', price_total_fcfa: 950, requested_category: 'essentiel', payment_method: 'tamcar_credit', driver_full_name: 'Koffi Adjovi', driver_phone: '22997000000', driver_confirmed: true, is_upcoming: true },
  ],
  my_scheduled_rides: [],
  my_vehicle_rentals: [],
  booking_config: { min_lead_minutes: 30, penalty_fcfa: 200 },
  ride_messages_history: [],
  ride_stops_of: [],
  get_or_create_my_referral_code: 'AICHA-7K2',
  tampass_sync: null,
};
