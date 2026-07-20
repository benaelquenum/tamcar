import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfWeek(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function since(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

type RideRow = {
  id: string;
  status: string;
  price_total_fcfa: number;
  platform_share_fcfa: number;
  driver_share_fcfa: number;
  dealer_share_fcfa: number;
  distance_km: number | null;
  vehicle_id: string | null;
  driver_id: string | null;
  client_id: string;
  cancel_reason: string | null;
  completion_recomputed_price_fcfa: number | null;
  stops_waiting_fee_fcfa: number;
  matched_at: string | null;
  ended_at: string | null;
  requested_at: string;
  updated_at: string;
};

type ProfileRow = { id: string; role: string; full_name: string; created_at: string };
type DriverRow = { id: string; profile_id: string; application_type: string; is_online: boolean; status: string; rating_avg: number | null; rating_count: number };
type WalletRow = { id: string; profile_id: string; kind: string; balance_fcfa: number };
type TxRow = { type: string; amount_fcfa: number; ride_id: string | null; created_at: string };
type SosRow = { id: string; status: string; role: string; reason: string | null; created_at: string; lat: number; lng: number };
type CandidatureRow = { id: string; status: string; created_at: string };
type DealerAdvanceRow = { id: string; amount_fcfa: number; refunded_fcfa: number; status: string };
type ReferralRow = { redeemed_by: string; reward_fcfa: number; created_at: string };
type VehicleRow = { id: string; category: string };

export default async function AdminHome() {
  const supabase = createServerSupabase();
  const todayISO = startOfToday();
  const weekISO = startOfWeek();
  const monthISO = startOfMonth();

  // Pull data in parallel
  const [
    { data: rides },
    { data: profiles },
    { data: drivers },
    { data: wallets },
    { data: txs },
    { data: sos },
    { data: candidatures },
    { data: dealerAdv },
    { data: referrals },
    { data: vehicles },
  ] = await Promise.all([
    supabase
      .from('rides_view')
      .select('id, status, price_total_fcfa, platform_share_fcfa, driver_share_fcfa, dealer_share_fcfa, distance_km, vehicle_id, driver_id, client_id, cancel_reason, completion_recomputed_price_fcfa, stops_waiting_fee_fcfa, matched_at, ended_at, requested_at, updated_at')
      .gte('requested_at', monthISO)
      .order('requested_at', { ascending: false })
      .limit(1500),
    supabase
      .from('profiles')
      .select('id, role, full_name, created_at'),
    supabase
      .from('drivers')
      .select('id, profile_id, application_type, is_online, status, rating_avg, rating_count'),
    supabase
      .from('wallets')
      .select('id, profile_id, kind, balance_fcfa'),
    supabase
      .from('wallet_transactions')
      .select('type, amount_fcfa, ride_id, created_at')
      .gte('created_at', monthISO)
      .order('created_at', { ascending: false })
      .limit(3000),
    supabase
      .from('sos_alerts')
      .select('id, status, role, reason, created_at, lat, lng')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('driver_applications')
      .select('id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('dealer_advances')
      .select('id, amount_fcfa, refunded_fcfa, status'),
    supabase
      .from('referral_redemptions')
      .select('redeemed_by, reward_fcfa, created_at')
      .gte('created_at', monthISO),
    supabase
      .from('vehicles')
      .select('id, category'),
  ]);

  const R = (rides ?? []) as RideRow[];
  const P = (profiles ?? []) as ProfileRow[];
  const D = (drivers ?? []) as DriverRow[];
  const W = (wallets ?? []) as WalletRow[];
  const T = (txs ?? []) as TxRow[];
  const S = (sos ?? []) as SosRow[];
  const C = (candidatures ?? []) as CandidatureRow[];
  const A = (dealerAdv ?? []) as DealerAdvanceRow[];
  const Ref = (referrals ?? []) as ReferralRow[];
  const V = (vehicles ?? []) as VehicleRow[];

  const vehicleCategory = new Map(V.map((v) => [v.id, v.category]));

  // Ride filters
  const todayRides = R.filter((r) => r.requested_at >= todayISO);
  const weekRides = R.filter((r) => r.requested_at >= weekISO);
  const monthRides = R;
  const isCompleted = (r: RideRow) => r.status === 'completed';
  const isCancelled = (r: RideRow) => r.status === 'cancelled_by_client' || r.status === 'cancelled_by_driver';
  const isActive = (r: RideRow) => ['requested','matched','arrived','in_progress'].includes(r.status);

  const todayCompleted = todayRides.filter(isCompleted);
  const weekCompleted = weekRides.filter(isCompleted);
  const monthCompleted = monthRides.filter(isCompleted);

  const activeRides = R.filter(isActive);
  const cancelled24h = R.filter((r) => isCancelled(r) && r.updated_at >= since(24));

  // Revenus plateforme
  const platformToday = todayCompleted.reduce((s, r) => s + r.platform_share_fcfa, 0);
  const platformWeek = weekCompleted.reduce((s, r) => s + r.platform_share_fcfa, 0);
  const platformMonth = monthCompleted.reduce((s, r) => s + r.platform_share_fcfa, 0);

  // CA total (prix courses payés)
  const grossToday = todayCompleted.reduce((s, r) => s + r.price_total_fcfa, 0);
  const grossWeek = weekCompleted.reduce((s, r) => s + r.price_total_fcfa, 0);
  const grossMonth = monthCompleted.reduce((s, r) => s + r.price_total_fcfa, 0);

  const avgPrice = monthCompleted.length > 0
    ? Math.round(grossMonth / monthCompleted.length) : 0;
  const avgKm = monthCompleted.length > 0
    ? monthCompleted.reduce((s, r) => s + (r.distance_km || 0), 0) / monthCompleted.length
    : 0;

  // Taux d'annulation (courses créées / courses annulées 7j)
  const weekRequested = weekRides.length;
  const weekCancelled = weekRides.filter(isCancelled).length;
  const cancelRate = weekRequested > 0 ? Math.round((weekCancelled / weekRequested) * 100) : 0;

  // Répartition catégorie
  const categoryCount = new Map<string, { count: number; ca: number }>();
  for (const r of monthCompleted) {
    const cat = (r.vehicle_id && vehicleCategory.get(r.vehicle_id)) || 'inconnu';
    const prev = categoryCount.get(cat) || { count: 0, ca: 0 };
    categoryCount.set(cat, { count: prev.count + 1, ca: prev.ca + r.price_total_fcfa });
  }
  const categoryEntries = Array.from(categoryCount.entries()).sort((a, b) => b[1].ca - a[1].ca);

  // Chauffeurs
  const activeDrivers = D.filter((d) => d.status === 'active');
  const onlineDrivers = D.filter((d) => d.is_online);
  const cessionCount = activeDrivers.filter((d) => d.application_type === 'cession').length;
  const proprietaireCount = activeDrivers.filter((d) => d.application_type === 'proprietaire').length;
  const avgRating = activeDrivers.filter((d) => d.rating_count > 0)
    .reduce((s, d, _, arr) => s + (d.rating_avg || 0) / arr.length, 0);

  // Top 5 chauffeurs par revenue du mois
  const driverGains = new Map<string, number>();
  for (const r of monthCompleted) {
    if (!r.driver_id) continue;
    driverGains.set(r.driver_id, (driverGains.get(r.driver_id) || 0) + r.driver_share_fcfa);
  }
  const driverProfileById = new Map(D.map((d) => [d.id, d.profile_id]));
  const profileName = new Map(P.map((p) => [p.id, p.full_name]));
  const topDrivers = Array.from(driverGains.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([driverId, gain]) => {
      const pid = driverProfileById.get(driverId);
      return { name: (pid && profileName.get(pid)) || '—', gain };
    });

  // Candidatures pending
  const pendingCandidatures = C.filter((c) => c.status === 'pending' || c.status === 'submitted').length;

  // Clients
  const clients = P.filter((p) => p.role === 'client');
  const newClientsWeek = clients.filter((p) => p.created_at >= weekISO).length;
  const clientProfileIds = new Set(clients.map((c) => c.id));
  const activeClients7d = new Set<string>();
  const weekAgo = since(24 * 7);
  for (const r of R) {
    if (r.updated_at >= weekAgo) activeClients7d.add(r.client_id);
  }
  // Total balance wallets client credit
  const totalClientCredit = W.filter((w) => w.kind === 'tamcar_credit' && clientProfileIds.has(w.profile_id))
    .reduce((s, w) => s + w.balance_fcfa, 0);
  const totalDriverRevenus = W.filter((w) => w.kind === 'tamcar_revenus')
    .reduce((s, w) => s + w.balance_fcfa, 0);
  const totalDriverRachat = W.filter((w) => w.kind === 'tamcar_rachat')
    .reduce((s, w) => s + w.balance_fcfa, 0);

  // Transactions particulières
  const cancellationFees = T.filter((t) => t.type === 'cancellation_fee')
    .reduce((s, t) => s + t.amount_fcfa, 0);
  const cancellationReimb = T.filter((t) => t.type === 'cancellation_reimbursement')
    .reduce((s, t) => s + t.amount_fcfa, 0);
  const changeReturnOut = T.filter((t) => t.type === 'change_return_out')
    .reduce((s, t) => s + t.amount_fcfa, 0);
  const referralPaid = T.filter((t) => t.type === 'referral_bonus')
    .reduce((s, t) => s + t.amount_fcfa, 0);

  // ADR
  const adrTotal = A.reduce((s, a) => s + a.amount_fcfa, 0);
  const adrRefunded = A.reduce((s, a) => s + a.refunded_fcfa, 0);
  const adrOpen = adrTotal - adrRefunded;

  // SOS
  const openSos = S.filter((s) => s.status === 'open');

  // Rides bloquées
  const stuckRides = R.filter((r) => r.status === 'in_progress' && r.matched_at && r.matched_at < since(4));

  return (
    <div className="space-y-lg">
      <div className="flex flex-col gap-md lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900">Back-office TamCar</h1>
          <p className="mt-xs text-sm text-neutral-600">
            Vue temps réel de la plateforme. Les chiffres sont sur la période en cours (jour / semaine / mois calendaire).
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <Link
            href="/admin/banners#nouvelle"
            className="inline-flex items-center gap-xs rounded-lg bg-primary-500 px-md py-sm text-xs font-bold text-white shadow-sm hover:brightness-110"
          >
            + Nouvelle bannière
          </Link>
          <Link
            href="/admin/candidatures"
            className="inline-flex items-center gap-xs rounded-lg border-2 border-primary-500 bg-white px-md py-sm text-xs font-bold text-primary-700 hover:bg-primary-50"
          >
            Voir candidatures
          </Link>
        </div>
      </div>

      {/* ===== KPI Header ===== */}
      <section className="grid grid-cols-2 gap-md lg:grid-cols-4">
        <KpiCard label="CA plateforme mois" value={`${fmt(platformMonth)} F`}
          sub={`Jour ${fmt(platformToday)} F · Sem. ${fmt(platformWeek)} F`}
          tone="primary" />
        <KpiCard label="Courses terminées mois" value={fmt(monthCompleted.length)}
          sub={`Jour ${todayCompleted.length} · Sem. ${weekCompleted.length}`} />
        <KpiCard label="Chauffeurs en ligne" value={`${onlineDrivers.length} / ${activeDrivers.length}`}
          sub={`${cessionCount} cession · ${proprietaireCount} propriétaire`} />
        <KpiCard label="Taux d'annulation 7j" value={`${cancelRate} %`}
          sub={`${weekCancelled} sur ${weekRequested} courses`}
          tone={cancelRate > 20 ? 'warning' : 'default'} />
      </section>

      {/* ===== Financier ===== */}
      <Section title="Financier — mois en cours">
        <div className="grid grid-cols-2 gap-md lg:grid-cols-4">
          <Stat label="CA total courses" value={`${fmt(grossMonth)} F`} sub="Prix payés cumulés" />
          <Stat label="Prix moyen course" value={`${fmt(avgPrice)} F`} sub={`${avgKm.toFixed(1)} km moyens`} />
          <Stat label="Frais d'annulation" value={`${fmt(cancellationFees)} F`}
            sub={`Réimbursés chauffeurs : ${fmt(cancellationReimb)} F`} />
          <Stat label="Bonus parrainage payés" value={`${fmt(referralPaid)} F`}
            sub={`${Ref.length} redemptions ce mois`} />
        </div>
      </Section>

      {/* ===== Répartition catégorie ===== */}
      {categoryEntries.length > 0 && (
        <Section title="Répartition par catégorie de véhicule">
          <div className="grid grid-cols-1 gap-sm lg:grid-cols-3">
            {categoryEntries.map(([cat, data]) => (
              <div key={cat} className="rounded-xl border border-neutral-200 bg-white p-md">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  TamCar {cat}
                </p>
                <p className="mt-xs text-xl font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(data.ca)} F
                </p>
                <p className="text-[11px] text-neutral-600">
                  {data.count} course{data.count > 1 ? 's' : ''}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ===== Chauffeurs ===== */}
      <Section title="Chauffeurs">
        <div className="grid grid-cols-2 gap-md lg:grid-cols-4">
          <Stat label="Actifs (total)" value={fmt(activeDrivers.length)} />
          <Stat label="Note moyenne" value={avgRating > 0 ? `${avgRating.toFixed(2)} / 5` : '—'} />
          <Stat label="Candidatures en attente" value={fmt(pendingCandidatures)}
            sub={pendingCandidatures > 0 ? 'À valider' : 'Aucune'} tone={pendingCandidatures > 0 ? 'warning' : 'default'} />
          <Stat label="Cash chauffeurs cumulé" value={`${fmt(totalDriverRevenus)} F`}
            sub="Wallets tamcar_revenus" />
        </div>
        {topDrivers.length > 0 && (
          <div className="mt-md rounded-xl border border-neutral-200 bg-white p-md">
            <p className="mb-sm text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Top 5 chauffeurs · gains cash du mois
            </p>
            <table className="w-full text-sm">
              <tbody>
                {topDrivers.map((d, i) => (
                  <tr key={i} className="border-b border-neutral-100 last:border-0">
                    <td className="py-xs">
                      <span className="mr-sm inline-block h-5 w-5 rounded-full bg-primary-500 text-center text-[10px] font-bold leading-5 text-white">
                        {i + 1}
                      </span>
                      {d.name}
                    </td>
                    <td className="py-xs text-right font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(d.gain)} F
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ===== Clients & wallets ===== */}
      <Section title="Clients & wallets">
        <div className="grid grid-cols-2 gap-md lg:grid-cols-4">
          <Stat label="Clients (total)" value={fmt(clients.length)}
            sub={`${activeClients7d.size} actifs 7j`} />
          <Stat label="Nouveaux cette semaine" value={fmt(newClientsWeek)} />
          <Stat label="Crédit clients cumulé" value={`${fmt(totalClientCredit)} F`}
            sub="Wallets tamcar_credit" />
          <Stat label="Rendus monnaie chauffeurs" value={`${fmt(changeReturnOut)} F`}
            sub={`${T.filter((t) => t.type === 'change_return_out').length} opérations`} />
        </div>
      </Section>

      {/* ===== Opérations en cours ===== */}
      <Section title="Opérations">
        <div className="grid grid-cols-2 gap-md lg:grid-cols-4">
          <Stat label="Courses actives" value={fmt(activeRides.length)}
            sub={`requested ${activeRides.filter((r) => r.status === 'requested').length} · matched ${activeRides.filter((r) => r.status === 'matched').length} · in_progress ${activeRides.filter((r) => r.status === 'in_progress').length}`} />
          <Stat label="Annulées 24h" value={fmt(cancelled24h.length)} tone={cancelled24h.length > 5 ? 'warning' : 'default'} />
          <Stat label="Rides bloquées" value={fmt(stuckRides.length)}
            sub="in_progress depuis > 4 h"
            tone={stuckRides.length > 0 ? 'error' : 'default'} />
          <Stat label="SOS ouverts" value={fmt(openSos.length)} tone={openSos.length > 0 ? 'error' : 'default'} />
        </div>
      </Section>

      {/* ===== ADR ===== */}
      <Section title="ADR — Avances concessionnaires">
        <div className="grid grid-cols-2 gap-md lg:grid-cols-4">
          <Stat label="Total avancé" value={`${fmt(adrTotal)} F`} sub={`${A.length} lignes`} />
          <Stat label="Total remboursé" value={`${fmt(adrRefunded)} F`}
            sub={adrTotal > 0 ? `${Math.round((adrRefunded / adrTotal) * 100)} % remboursés` : ''} />
          <Stat label="Encours" value={`${fmt(adrOpen)} F`}
            tone={adrOpen > adrTotal * 0.5 ? 'warning' : 'default'} />
          <Stat label="Fonds rachat total" value={`${fmt(totalDriverRachat)} F`}
            sub="Wallets tamcar_rachat (interne)" />
        </div>
      </Section>

      {/* ===== SOS ouverts (détail) ===== */}
      {openSos.length > 0 && (
        <Section title="Alertes SOS ouvertes">
          <div className="space-y-xs">
            {openSos.slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-center gap-md rounded-lg border border-error/30 bg-error/5 p-md">
                <span className="text-xl">🚨</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-neutral-900">
                    {s.role === 'client' ? 'Client' : 'Chauffeur'} · {s.reason || 'Sans raison'}
                  </p>
                  <p className="text-[11px] text-neutral-600">
                    {new Date(s.created_at).toLocaleString('fr-FR')} · {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                  </p>
                </div>
                <a
                  href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}
                  target="_blank"
                  rel="noopener"
                  className="rounded-md bg-error px-md py-xs text-xs font-bold text-white"
                >
                  Localiser
                </a>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ===== Raccourcis sections détaillées ===== */}
      <Section title="Détails par section">
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">
          <ShortcutCard href="/admin/rides" title="Courses" description="Historique complet, statuts, prix, wallet transactions." />
          <ShortcutCard href="/admin/drivers" title="Chauffeurs" description="Enregistrement, formule, gains cumulés, suspend/archive." />
          <ShortcutCard href="/admin/dealers" title="Concessionnaires" description="Enregistrement, part, actionnariat, CA cumulé." />
          <ShortcutCard href="/admin/vehicles" title="Véhicules" description="Enregistrement, activation, affectation chauffeur." />
          <ShortcutCard href="/admin/candidatures" title="Candidatures & RDV" description="Validation dossiers chauffeurs, KYC, planning." />
          <ShortcutCard href="/admin/dealer-advances" title="Avances Concessionnaires" description="Ligne de crédit ADR par partenaire." />
          <ShortcutCard href="/admin/banners" title="Bannières" description="Communications marketing home client." />
          <ShortcutCard href="/admin/places" title="Lieux (POI)" description="Modération des lieux proposés." />
        </div>
      </Section>
    </div>
  );
}

function KpiCard({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: 'primary' | 'warning' | 'error' | 'default' }) {
  const gradient =
    tone === 'primary' ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white'
    : tone === 'warning' ? 'bg-gradient-to-br from-warning to-error text-white'
    : tone === 'error' ? 'bg-error text-white'
    : 'bg-white text-neutral-900 ring-1 ring-neutral-200';
  const textSub = tone && tone !== 'default' ? 'text-white/80' : 'text-neutral-500';
  return (
    <div className={`rounded-xl p-md shadow-sm ${gradient}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider ${textSub}`}>{label}</p>
      <p className="mt-xs text-2xl font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p className={`mt-xs text-[11px] ${textSub}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-sm text-xs font-bold uppercase tracking-wider text-neutral-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: 'warning' | 'error' | 'default' }) {
  const border = tone === 'warning' ? 'border-warning/40 bg-warning/5'
    : tone === 'error' ? 'border-error/40 bg-error/5'
    : 'border-neutral-200 bg-white';
  return (
    <div className={`rounded-xl border p-md ${border}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-xs text-xl font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      {sub && <p className="mt-xs text-[10px] text-neutral-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{sub}</p>}
    </div>
  );
}

function ShortcutCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl bg-white p-md shadow-sm ring-1 ring-neutral-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary-300"
    >
      <h3 className="text-base font-bold text-neutral-900 group-hover:text-primary-700">{title}</h3>
      <p className="mt-xs flex-1 text-xs text-neutral-600">{description}</p>
      <span className="mt-sm inline-flex items-center gap-xs text-xs font-semibold text-primary-700">
        Ouvrir →
      </span>
    </Link>
  );
}
