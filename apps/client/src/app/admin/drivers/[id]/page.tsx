import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

const PAGE_SIZE = 100;
const TZ = 'Africa/Porto-Novo';

type Summary = {
  driver_id: string;
  profile_id: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  status: 'pending' | 'active' | 'suspended' | 'archived';
  kyc_status: string;
  application_type: 'cession' | 'proprietaire';
  license_number: string | null;
  id_card_number: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  enrolled_at: string;
  archived_at: string | null;
  archive_reason: string | null;
  rating_avg: number;
  rating_count: number;
  strikes: number;
  vehicle: { brand: string; model: string; plate: string; color: string | null; year: number | null; category: string; dealer: string | null } | null;
  rides: {
    total: number;
    completed: number;
    cancelled_by_driver: number;
    cancelled_by_client: number;
    volume_fcfa: number;
    cash_fcfa: number;
    rachat_fcfa: number;
    first_at: string | null;
    last_at: string | null;
  };
  wallets: Record<string, number>;
  wallet_totals: Record<string, { n: number; sum: number }>;
  warnings: number;
  sos: number;
  rentals: number;
};

type EventRow = {
  event_at: string | null;
  kind: string;
  title: string;
  detail: string | null;
  amount_fcfa: number | null;
  status: string | null;
  ref_id: string | null;
  total_count: number;
};

const STATUS_LABEL: Record<Summary['status'], { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-neutral-200 text-neutral-700' },
  active: { label: 'Actif', cls: 'bg-primary-100 text-primary-700' },
  suspended: { label: 'Suspendu', cls: 'bg-warning/20 text-warning' },
  archived: { label: 'Archivé', cls: 'bg-neutral-800 text-white' },
};

const KIND_META: Record<string, { label: string; cls: string }> = {
  enrolment: { label: 'Enrôlement', cls: 'bg-violet-500/15 text-violet-700' },
  ride: { label: 'Course', cls: 'bg-primary-100 text-primary-700' },
  rental: { label: 'Location VIP', cls: 'bg-gold/25 text-neutral-900' },
  wallet: { label: 'Portefeuille', cls: 'bg-neutral-200 text-neutral-700' },
  payout: { label: 'Retrait', cls: 'bg-success/15 text-success' },
  rating: { label: 'Note', cls: 'bg-gold/25 text-neutral-900' },
  warning: { label: 'Avertissement', cls: 'bg-error/15 text-error' },
  insurance: { label: 'Assurance', cls: 'bg-neutral-200 text-neutral-700' },
  tamassur: { label: 'TamAssur', cls: 'bg-success/15 text-success' },
  request: { label: 'Demande directe', cls: 'bg-primary-100 text-primary-700' },
  sos: { label: 'SOS', cls: 'bg-error text-white' },
  status: { label: 'Statut', cls: 'bg-neutral-800 text-white' },
};

const RIDE_STATUS: Record<string, string> = {
  requested: 'demandée',
  scheduled: 'réservée',
  matched: 'acceptée',
  arrived: 'chauffeur arrivé',
  in_progress: 'en cours',
  completed: 'terminée',
  cancelled_by_client: 'annulée par le client',
  cancelled_by_driver: 'annulée par le chauffeur',
  cancelled_by_admin: 'annulée par TamCar',
  expired: 'expirée',
};

const GENERIC_STATUS: Record<string, string> = {
  requested: 'à confirmer',
  confirmed: 'confirmée',
  in_progress: 'en cours',
  completed: 'terminée',
  cancelled: 'annulée',
  pending: 'en attente',
  accepted: 'acceptée',
  declined: 'refusée',
  expired: 'expirée',
  paid: 'payé',
  rejected: 'refusé',
};

const WALLET_LABEL: Record<string, string> = {
  revenue_share_credit: 'Part de course créditée',
  rachat_credit: 'Fonds de rachat',
  dealer_share_credit: 'Part concessionnaire',
  cash_commission: 'Commission sur course en espèces',
  topup: 'Rechargement',
  payment: 'Paiement',
  withdrawal: 'Retrait',
  cancellation_fee: 'Frais d’annulation',
  cancellation_reimbursement: 'Remboursement d’annulation',
  refund: 'Remboursement',
  referral_bonus: 'Parrainage',
  insurance_premium: 'Prime d’assurance',
  tamassur_saving: 'Épargne TamAssur',
  tamassur_from_rachat: 'TamAssur (moitié sur le fonds de rachat)',
  performance_bonus: 'Bonus de performance',
  tamassur_withdrawal: 'Retrait TamAssur',
  debt_settlement: 'Règlement de dette',
  goodwill_credit: 'Geste commercial',
  change_return_in: 'Monnaie reçue',
  change_return_out: 'Monnaie rendue',
};

const CREDIT_TYPES = new Set([
  'revenue_share_credit', 'rachat_credit', 'dealer_share_credit', 'topup', 'refund',
  'referral_bonus', 'goodwill_credit', 'cancellation_reimbursement', 'debt_settlement', 'change_return_in', 'performance_bonus',
]);
const DEBIT_TYPES = new Set(['cash_commission', 'insurance_premium', 'tamassur_from_rachat', 'withdrawal', 'payment', 'cancellation_fee', 'change_return_out']);

function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR').replace(/,/g, ' ');
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
}
function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
function lastSeen(iso: string | null): string {
  if (!iso) return 'jamais vu';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 2) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  if (min < 1440) return `il y a ${Math.floor(min / 60)} h`;
  return `il y a ${Math.floor(min / 1440)} j`;
}

/** Libellé lisible d'un événement (la base renvoie des codes). */
function titleOf(e: EventRow): string {
  if (e.kind === 'wallet') return WALLET_LABEL[e.title] ?? e.title;
  if (e.kind === 'ride') {
    const s = e.title.replace(/^Course /, '');
    return `Course ${RIDE_STATUS[s] ?? s}`;
  }
  if (e.kind === 'rental') {
    const s = e.title.replace(/^Location VIP /, '');
    return `Location VIP ${GENERIC_STATUS[s] ?? s}`;
  }
  const m = e.title.match(/^(.*) \(([a-z_]+)\)$/);
  if (m && (e.kind === 'request' || e.kind === 'tamassur')) return `${m[1]} (${GENERIC_STATUS[m[2]] ?? m[2]})`;
  return e.title;
}

function amountOf(e: EventRow): { text: string; cls: string } | null {
  if (e.amount_fcfa == null) return null;
  if (e.kind === 'wallet') {
    const credit = CREDIT_TYPES.has(e.title);
    const debit = DEBIT_TYPES.has(e.title);
    const sign = credit ? '+' : debit ? '−' : '';
    return {
      text: `${sign}${fmt(Math.abs(e.amount_fcfa))} F`,
      cls: credit ? 'text-success' : debit ? 'text-error' : 'text-neutral-900',
    };
  }
  if (e.kind === 'ride') return { text: `+${fmt(e.amount_fcfa)} F`, cls: 'text-success' };
  if (e.kind === 'payout') return { text: `−${fmt(e.amount_fcfa)} F`, cls: 'text-neutral-900' };
  return { text: `${fmt(e.amount_fcfa)} F`, cls: 'text-neutral-900' };
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-md shadow-sm ring-1 ring-neutral-200">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-xs text-xl font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}

export default async function AdminDriverDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { type?: string; page?: string };
}) {
  const supabase = createServerSupabase();
  const type = (searchParams?.type ?? '').trim();
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);

  const [{ data: summaryData, error: sumErr }, { data: countData }, { data: eventData }] = await Promise.all([
    supabase.rpc('admin_driver_summary', { p_driver_id: params.id }),
    supabase.rpc('admin_driver_history_counts', { p_driver_id: params.id }),
    supabase.rpc('admin_driver_history', {
      p_driver_id: params.id,
      p_kinds: type ? [type] : null,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  if (sumErr || !summaryData) {
    // Base pas encore à jour (migration non passée) ou chauffeur inconnu.
    if (sumErr && /schema cache|could not find the function/i.test(sumErr.message)) {
      return (
        <div className="rounded-xl bg-white p-xl text-sm text-neutral-700 shadow-sm">
          L&apos;historique chauffeur n&apos;est pas encore activé en base (migration à passer).
          <div className="mt-md"><Link href="/admin/drivers" className="font-bold text-primary-700 underline">← Chauffeurs</Link></div>
        </div>
      );
    }
    notFound();
  }

  const s = summaryData as Summary;
  const counts = new Map<string, number>(
    ((countData ?? []) as Array<{ kind: string; n: number }>).map((c) => [c.kind, Number(c.n)]),
  );
  const totalAll = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  const events = (eventData ?? []) as EventRow[];
  const total = events[0] ? Number(events[0].total_count) : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const st = STATUS_LABEL[s.status];

  const href = (t: string, p = 1) => {
    const q = new URLSearchParams();
    if (t) q.set('type', t);
    if (p > 1) q.set('page', String(p));
    const qs = q.toString();
    return `/admin/drivers/${s.driver_id}${qs ? `?${qs}` : ''}`;
  };

  const rachatBalance = s.wallets?.tamcar_rachat ?? 0;
  const revenusBalance = s.wallets?.tamcar_revenus ?? 0;
  const tamassurNet = (s.wallet_totals?.tamassur_saving?.sum ?? 0) - (s.wallet_totals?.tamassur_withdrawal?.sum ?? 0);
  const initials = s.full_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div>
      <Link href="/admin/drivers" className="text-xs font-bold text-primary-700 hover:underline">← Chauffeurs</Link>

      {/* En-tête */}
      <section className="mt-md rounded-2xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <div className="flex flex-wrap items-start gap-lg">
          {s.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.avatar_url} alt="" className="h-16 w-16 flex-none rounded-full object-cover ring-1 ring-neutral-200" />
          ) : (
            <span className="grid h-16 w-16 flex-none place-items-center rounded-full bg-primary-100 text-lg font-extrabold text-primary-700">
              {initials}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-sm">
              <h1 className="text-2xl font-extrabold text-neutral-900">{s.full_name}</h1>
              <span className={`rounded-full px-sm py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
              {s.is_online && (
                <span className="inline-flex items-center gap-xs rounded-full bg-primary-500/10 px-sm py-0.5 text-[11px] font-bold text-primary-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500" /> En ligne
                </span>
              )}
            </div>
            <p className="mt-xs text-sm text-neutral-700">
              {s.phone} · formule {s.application_type === 'cession' ? 'Cession' : 'Propriétaire'} · vu {lastSeen(s.last_seen_at)}
            </p>
            <p className="mt-xs text-sm font-semibold text-neutral-900">
              Enrôlé le {fmtDate(s.enrolled_at)}{' '}
              <span className="font-normal text-neutral-500">({daysSince(s.enrolled_at)} jours)</span>
            </p>
            <p className="mt-xs text-xs text-neutral-500">
              {s.license_number ? `Permis ${s.license_number}` : 'Permis non renseigné'}
              {s.id_card_number ? ` · CNI ${s.id_card_number}` : ''} · KYC {s.kyc_status}
            </p>
            {s.archived_at && (
              <p className="mt-xs text-xs font-semibold text-error">
                Archivé le {fmtDate(s.archived_at)}{s.archive_reason ? ` · ${s.archive_reason}` : ''}
              </p>
            )}
          </div>
          <div className="min-w-[220px] rounded-xl bg-neutral-100 p-md text-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Véhicule</p>
            {s.vehicle ? (
              <>
                <p className="mt-xs font-bold text-neutral-900">
                  {[s.vehicle.brand, s.vehicle.model].filter(Boolean).join(' ')}
                  {s.vehicle.year ? ` (${s.vehicle.year})` : ''}
                </p>
                <p className="text-xs text-neutral-600">
                  {s.vehicle.plate}{s.vehicle.color ? ` · ${s.vehicle.color}` : ''} · {s.vehicle.category}
                </p>
                {s.vehicle.dealer && <p className="text-xs text-neutral-500">Partenaire : {s.vehicle.dealer}</p>}
              </>
            ) : (
              <p className="mt-xs text-xs text-neutral-500">Aucun véhicule assigné.</p>
            )}
          </div>
        </div>
      </section>

      {/* Chiffres depuis l'enrôlement */}
      <h2 className="mb-sm mt-xl text-sm font-bold uppercase tracking-wider text-neutral-500">Depuis l&apos;enrôlement</h2>
      <div className="grid grid-cols-2 gap-md md:grid-cols-4">
        <Kpi
          label="Courses terminées"
          value={String(s.rides.completed)}
          sub={`${s.rides.total} au total · ${s.rides.cancelled_by_driver} annulées par lui · ${s.rides.cancelled_by_client} par le client`}
        />
        <Kpi label="Volume de courses" value={`${fmt(s.rides.volume_fcfa)} F`} sub={`${s.rentals} location${s.rentals > 1 ? 's' : ''} VIP`} />
        <Kpi label="Part cash gagnée" value={`${fmt(s.rides.cash_fcfa)} F`} sub={`solde Revenus : ${fmt(revenusBalance)} F`} />
        <Kpi label="Fonds de rachat" value={`${fmt(s.rides.rachat_fcfa)} F`} sub={`solde Rachat : ${fmt(rachatBalance)} F`} />
        <Kpi
          label="Note"
          value={s.rating_count > 0 ? `${Number(s.rating_avg).toFixed(2)} / 5` : '—'}
          sub={`${s.rating_count} avis`}
        />
        <Kpi label="Avertissements" value={String(s.warnings)} sub={`${s.strikes} strike${s.strikes > 1 ? 's' : ''} · ${s.sos} SOS`} />
        <Kpi label="TamAssur net" value={`${fmt(tamassurNet)} F`} sub="épargne − retraits" />
        <Kpi
          label="Première / dernière course"
          value={s.rides.first_at ? fmtDate(s.rides.first_at) : '—'}
          sub={s.rides.last_at ? `dernière : ${fmtDate(s.rides.last_at)}` : 'aucune course'}
        />
      </div>

      {/* Chronologie */}
      <h2 className="mb-sm mt-xl text-sm font-bold uppercase tracking-wider text-neutral-500">
        Chronologie complète ({totalAll} événement{totalAll > 1 ? 's' : ''})
      </h2>
      <div className="mb-md flex flex-wrap gap-xs">
        <Link
          href={href('')}
          className={`rounded-full px-md py-xs text-xs font-bold ${!type ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100'}`}
        >
          Tout ({totalAll})
        </Link>
        {Object.entries(KIND_META)
          .filter(([k]) => (counts.get(k) ?? 0) > 0)
          .map(([k, meta]) => (
            <Link
              key={k}
              href={href(k)}
              className={`rounded-full px-md py-xs text-xs font-bold ${type === k ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100'}`}
            >
              {meta.label} ({counts.get(k)})
            </Link>
          ))}
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl bg-white p-xl text-center text-sm text-neutral-600 shadow-sm">Aucun événement.</div>
      ) : (
        <ol className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
          {events.map((e, i) => {
            const meta = KIND_META[e.kind] ?? { label: e.kind, cls: 'bg-neutral-200 text-neutral-700' };
            const amt = amountOf(e);
            return (
              <li key={`${e.kind}-${e.ref_id ?? i}-${i}`} className="grid grid-cols-[130px_110px_1fr_auto] items-start gap-md border-b border-neutral-100 px-md py-sm last:border-0">
                <span className="text-xs text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDateTime(e.event_at)}</span>
                <span className={`inline-flex w-fit rounded-full px-sm py-0.5 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-900">{titleOf(e)}</p>
                  {e.detail && <p className="break-words text-xs text-neutral-500">{e.detail}</p>}
                </div>
                <span className={`text-sm font-bold ${amt?.cls ?? ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{amt?.text ?? ''}</span>
              </li>
            );
          })}
        </ol>
      )}

      {pages > 1 && (
        <nav className="mt-md flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link href={href(type, page - 1)} className="rounded-md bg-white px-md py-xs font-bold text-primary-700 ring-1 ring-neutral-200 hover:bg-neutral-100">← Plus récents</Link>
          ) : <span />}
          <span className="text-xs text-neutral-500">Page {page} sur {pages}</span>
          {page < pages ? (
            <Link href={href(type, page + 1)} className="rounded-md bg-white px-md py-xs font-bold text-primary-700 ring-1 ring-neutral-200 hover:bg-neutral-100">Plus anciens →</Link>
          ) : <span />}
        </nav>
      )}
    </div>
  );
}
