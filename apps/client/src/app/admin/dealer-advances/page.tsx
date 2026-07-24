import { createServerSupabase } from '@/lib/supabase-server';
import { forfeitAdvance, refundAdvance } from './actions';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';

type AdvanceRow = {
  id: string;
  dealer_partner_id: string;
  amount_fcfa: number;
  deposited_at: string;
  first_driver_activated_at: string | null;
  refund_target_at: string | null;
  refunded_fcfa: number;
  refunded_in_full_at: string | null;
  status: 'pending_activation' | 'active' | 'refunded' | 'forfeited';
  notes: string | null;
  dealer_partners: {
    company_name: string;
    profiles: { full_name: string; phone: string | null } | null;
  } | null;
};

const STATUS_META: Record<AdvanceRow['status'], { label: string; color: string }> = {
  pending_activation: { label: 'En attente activation', color: 'bg-neutral-200 text-neutral-700' },
  active: { label: 'Active', color: 'bg-primary-500 text-white' },
  refunded: { label: 'Remboursée', color: 'bg-success/20 text-success' },
  forfeited: { label: 'Résiliée', color: 'bg-error/20 text-error' },
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function daysBetween(from: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000);
}

export default async function AdminDealerAdvancesPage() {
  const supabase = createServerSupabase();

  const { data } = await supabase
    .from('dealer_advances')
    .select(
      'id, dealer_partner_id, amount_fcfa, deposited_at, first_driver_activated_at, refund_target_at, refunded_fcfa, refunded_in_full_at, status, notes, dealer_partners(company_name, profiles(full_name, phone))',
    )
    .order('deposited_at', { ascending: false });

  const advances = (data ?? []) as unknown as AdvanceRow[];
  const now = new Date();

  const grouped = {
    active: advances.filter((a) => a.status === 'active'),
    pending: advances.filter((a) => a.status === 'pending_activation'),
    closed: advances.filter((a) => a.status === 'refunded' || a.status === 'forfeited'),
  };

  const totalOutstanding = grouped.active.reduce(
    (s, a) => s + Math.max(0, a.amount_fcfa - a.refunded_fcfa),
    0,
  );

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">
          Avances de démarrage (ADR)
        </h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-primary-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {grouped.active.length}
          </strong>{' '}
          actives ·{' '}
          <strong className="text-warning" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(totalOutstanding)} F
          </strong>{' '}
          à rembourser
        </p>
      </div>

      {grouped.pending.length > 0 && (
        <Section title="En attente d'activation (1er chauffeur pas encore activé)">
          {grouped.pending.map((a) => (
            <AdvanceRow key={a.id} advance={a} now={now} />
          ))}
        </Section>
      )}

      {grouped.active.length > 0 && (
        <Section title="ADR actives — compteur remboursement en cours">
          {grouped.active.map((a) => (
            <AdvanceRow key={a.id} advance={a} now={now} />
          ))}
        </Section>
      )}

      {grouped.closed.length > 0 && (
        <Section title="Historique (remboursées ou résiliées)">
          {grouped.closed.map((a) => (
            <AdvanceRow key={a.id} advance={a} now={now} closed />
          ))}
        </Section>
      )}

      {advances.length === 0 && (
        <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          Aucune ADR enregistrée. Une ADR est créée à l&apos;approbation d&apos;un candidat concessionnaire.
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-2xl">
      <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
        {title}
      </h2>
      <div className="space-y-sm">{children}</div>
    </section>
  );
}

function AdvanceRow({
  advance,
  now,
  closed,
}: {
  advance: AdvanceRow;
  now: Date;
  closed?: boolean;
}) {
  const meta = STATUS_META[advance.status];
  const dealerName = advance.dealer_partners?.company_name ?? 'Concess. supprimé';
  const contact = advance.dealer_partners?.profiles?.full_name ?? '—';
  const phone = advance.dealer_partners?.profiles?.phone;

  const progress = Math.min(100, Math.round((advance.refunded_fcfa / advance.amount_fcfa) * 100));
  const targetReached =
    advance.refund_target_at != null && now >= new Date(advance.refund_target_at);
  const cumulReached = advance.refunded_fcfa >= advance.amount_fcfa;
  const canRefund = advance.status === 'active' && targetReached && cumulReached;

  const monthsSinceActivation =
    advance.first_driver_activated_at != null
      ? Math.floor(daysBetween(advance.first_driver_activated_at, now) / 30)
      : null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
      <div className="mb-md flex items-start justify-between gap-md">
        <div>
          <p className="text-sm font-bold text-neutral-900">{dealerName}</p>
          <p className="text-xs text-neutral-600">
            {contact}
            {phone && (
              <>
                {' · '}
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{phone}</span>
              </>
            )}
          </p>
        </div>
        <span className={`inline-flex rounded-full px-md py-xs text-[10px] font-bold ${meta.color}`}>
          {meta.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-md text-sm md:grid-cols-4">
        <Cell
          label="Versée le"
          value={new Date(advance.deposited_at).toLocaleDateString('fr-FR')}
        />
        <Cell label="Montant" value={`${fmt(advance.amount_fcfa)} F`} />
        {advance.first_driver_activated_at ? (
          <Cell
            label="Activée le"
            value={new Date(advance.first_driver_activated_at).toLocaleDateString('fr-FR')}
            sub={monthsSinceActivation != null ? `${monthsSinceActivation} mois écoulés` : undefined}
          />
        ) : (
          <Cell label="Activation" value="—" sub="1er chauffeur en attente" />
        )}
        {advance.refund_target_at ? (
          <Cell
            label="Échéance"
            value={new Date(advance.refund_target_at).toLocaleDateString('fr-FR')}
            sub={targetReached ? 'Atteinte' : `${daysBetween(advance.first_driver_activated_at ?? advance.deposited_at, new Date(advance.refund_target_at))} j restants`}
          />
        ) : (
          <Cell label="Échéance" value="—" />
        )}
      </div>

      {advance.status === 'active' && (
        <div className="mt-md">
          <div className="mb-xs flex items-baseline justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Cumul remboursement automatique (via split fonds rachat)
            </p>
            <p
              className="text-xs font-bold text-neutral-900"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {fmt(advance.refunded_fcfa)} / {fmt(advance.amount_fcfa)} F ({progress}%)
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-full transition-all ${cumulReached ? 'bg-success' : 'bg-gradient-to-r from-primary-500 to-primary-700'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {advance.notes && (
        <p className="mt-md rounded-md bg-neutral-100 p-sm text-[11px] text-neutral-700 whitespace-pre-line">
          {advance.notes}
        </p>
      )}

      {!closed && advance.status === 'active' && (
        <div className="mt-lg grid grid-cols-1 gap-md md:grid-cols-2">
          <form action={refundAdvance}>
            <input type="hidden" name="id" value={advance.id} />
            <button
              type="submit"
              disabled={!canRefund}
              title={
                !targetReached
                  ? 'Échéance non atteinte'
                  : !cumulReached
                    ? 'Cumul insuffisant'
                    : ''
              }
              className="w-full rounded-md bg-success py-sm text-sm font-bold text-white shadow-md hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Rembourser {fmt(advance.amount_fcfa)} F
            </button>
          </form>
          <form action={forfeitAdvance} className="rounded-md border border-neutral-200 bg-white p-md">
            <input type="hidden" name="id" value={advance.id} />
            <input
              type="text"
              name="reason"
              placeholder="Raison de la résiliation"
              className="w-full rounded-md bg-neutral-100 px-md py-xs text-xs text-neutral-900 ring-1 ring-neutral-200"
            />
            <ConfirmSubmit
              message="Résilier cette avance (prorata temporis) ? Le solde restant est acquis à TamCar."
              className="mt-xs w-full rounded-md bg-error py-xs text-xs font-bold text-white hover:brightness-110"
            >
              Résilier (prorata temporis)
            </ConfirmSubmit>
          </form>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p
        className="text-sm font-semibold text-neutral-900"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-neutral-500">{sub}</p>}
    </div>
  );
}
