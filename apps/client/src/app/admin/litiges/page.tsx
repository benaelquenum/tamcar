import { createServerSupabase } from '@/lib/supabase-server';
import { AlertTriangleIcon, CheckIcon, CrosshairIcon } from '@/components/Icon';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { auditCase, resolveDispute, resolveStrikeDispute, setDisputeRule } from './actions';

export const dynamic = 'force-dynamic';

type QueueRow = {
  ride_id: string;
  kind: 'client_claim' | 'driver_contest';
  rule_code: string | null;
  explanation: string | null;
  evidence: Record<string, unknown> | null;
  fee_fcfa: number;
  opened_at: string;
  appeal_note: string | null;
  client_name: string | null;
  driver_name: string | null;
  driver_points: number | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  cancel_reason_user: string | null;
  driver_dispute_reason: string | null;
};

type RecentRow = {
  ride_id: string;
  kind: 'client_claim' | 'driver_contest';
  decision: string | null;
  rule_code: string | null;
  confidence: string | null;
  explanation: string | null;
  fee_fcfa: number;
  refund_fcfa: number;
  cost_fcfa: number;
  decided_at: string | null;
  audit: boolean;
  audit_result: string | null;
  appeal_outcome: string | null;
  client_name: string | null;
  driver_name: string | null;
  reviewed: boolean;
};

type Metrics = {
  days?: number;
  total?: number;
  auto?: number;
  human?: number;
  auto_pct?: number | null;
  appeals?: number;
  overturned?: number;
  audit_pending?: number;
  audit_wrong?: number;
  goodwill_cost?: number;
  goodwill_cost_month?: number;
  goodwill_budget?: number;
};

type RuleRow = { key: string; value: number; label: string };

const REASON_LABELS: Record<string, string> = {
  driver_asked: 'Le chauffeur m’a demandé d’annuler',
  driver_not_moving: 'Le chauffeur ne bouge pas',
  wrong_direction: 'Mauvaise direction',
  wait_too_long: 'Attente trop longue',
  other: 'Autre',
};

const RULE_LABELS: Record<string, string> = {
  no_fee: 'Aucun frais',
  claim_abuse: 'Client : réclamations répétées sans preuve',
  driver_pattern: 'Chauffeur signalé par plusieurs clients',
  telemetry_refutes: 'GPS : motif non confirmé',
  goodwill: 'Geste commercial',
  exception: 'Exception : règles non concluantes',
  appeal: 'Contestation du client',
  contest_proven: 'Contestation refusée : preuve GPS',
  contest_needs_human: 'Contestation chauffeur à examiner',
  auto_error: 'Erreur du traitement automatique',
};

const DECISION_LABELS: Record<string, { label: string; cls: string }> = {
  driver_at_fault: { label: 'Chauffeur fautif', cls: 'bg-error/15 text-error' },
  client_at_fault: { label: 'Client fautif', cls: 'bg-primary-100 text-primary-700' },
  goodwill: { label: 'Geste commercial', cls: 'bg-warning/20 text-warning' },
  no_fault: { label: 'Sans objet', cls: 'bg-neutral-100 text-neutral-600' },
};

const EVIDENCE_LABELS: Record<string, string> = {
  motif_client: 'Motif invoqué',
  motif_chauffeur: 'Motif du chauffeur',
  frais_fcfa: 'Frais (F)',
  secondes_depuis_attribution: 'Secondes depuis l’attribution',
  gps_chauffeur_age_s: 'Âge du dernier signal GPS (s)',
  immobile_depuis_s: 'Immobile depuis (s)',
  distance_au_match_m: 'Distance à l’attribution (m)',
  distance_actuelle_m: 'Distance actuelle (m)',
  reclamations_client_30j: 'Réclamations du client (30 j)',
  autres_clients_contre_chauffeur_30j: 'Autres clients contre ce chauffeur (30 j)',
  gestes_client_30j: 'Gestes commerciaux du client (30 j)',
  budget_gestes_mois_fcfa: 'Gestes du mois (F)',
  attribution: 'Attribution actuelle',
  preuve: 'Preuve enregistrée',
  erreur: 'Erreur technique',
};

function fmt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('fr-FR').replace(/,/g, ' ');
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function Evidence({ data }: { data: Record<string, unknown> | null }) {
  const entries = Object.entries(data ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return null;
  return (
    <dl className="mt-xs grid grid-cols-1 gap-x-md gap-y-0.5 text-[11px] sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-sm border-b border-neutral-100 py-0.5">
          <dt className="text-neutral-500">{EVIDENCE_LABELS[k] ?? k}</dt>
          <dd className="text-right font-semibold text-neutral-800">
            {k === 'motif_client' ? (REASON_LABELS[String(v)] ?? String(v)) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="rounded-xl bg-white p-md shadow-sm ring-1 ring-neutral-200">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p
        className={`mt-xs text-2xl font-extrabold ${tone === 'good' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-neutral-900'}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}

export default async function AdminLitigesPage() {
  const supabase = createServerSupabase();
  const [{ data: q }, { data: audit }, { data: recent }, { data: met }, { data: rules }] = await Promise.all([
    supabase.rpc('admin_dispute_queue'),
    supabase.rpc('admin_dispute_recent', { p_scope: 'audit', p_limit: 30 }),
    supabase.rpc('admin_dispute_recent', { p_scope: 'recent', p_limit: 30 }),
    supabase.rpc('admin_dispute_metrics', { p_days: 30 }),
    supabase.from('dispute_rules').select('key, value, label').order('key'),
  ]);
  const queue = (q ?? []) as QueueRow[];
  const toAudit = (audit ?? []) as RecentRow[];
  const history = (recent ?? []) as RecentRow[];
  const m = (met ?? {}) as Metrics;
  const ruleRows = (rules ?? []) as RuleRow[];

  return (
    <div>
      <div className="mb-lg flex flex-wrap items-baseline justify-between gap-md">
        <h1 className="text-2xl font-extrabold text-neutral-900">Litiges</h1>
        <p className="text-sm text-neutral-600">
          <strong className={queue.length > 0 ? 'text-error' : 'text-neutral-900'}>{queue.length}</strong> exception
          {queue.length > 1 ? 's' : ''} à examiner
        </p>
      </div>

      <p className="mb-lg rounded-md bg-neutral-100 p-md text-xs text-neutral-700">
        Les litiges sont <strong>tranchés automatiquement</strong> à partir des données de la course (GPS du
        chauffeur, délais, historique). Cette page ne montre que ce que les règles n&apos;ont pas pu trancher, plus un
        échantillon de décisions à relire. Chaque exception vous est signalée par une notification.
      </p>

      {/* Indicateurs */}
      <div className="mb-xl grid grid-cols-2 gap-md md:grid-cols-4">
        <Stat
          label="Réglés sans humain"
          value={m.auto_pct == null ? '—' : `${m.auto_pct} %`}
          sub={`${fmt(m.auto)} sur ${fmt(m.total)} dossiers (30 j)`}
          tone={m.auto_pct != null && m.auto_pct >= 90 ? 'good' : 'warn'}
        />
        <Stat label="Contestations" value={fmt(m.appeals)} sub={`${fmt(m.overturned)} décision(s) renversée(s)`} />
        <Stat
          label="Gestes commerciaux (mois)"
          value={`${fmt(m.goodwill_cost_month)} F`}
          sub={`budget ${fmt(m.goodwill_budget)} F`}
        />
        <Stat
          label="Décisions à relire"
          value={fmt(m.audit_pending)}
          sub={`${fmt(m.audit_wrong)} erreur(s) relevée(s) (30 j)`}
          tone={(m.audit_wrong ?? 0) > 0 ? 'warn' : undefined}
        />
      </div>

      {/* Exceptions */}
      <h2 className="mb-sm text-sm font-bold uppercase tracking-wider text-neutral-500">À examiner</h2>
      {queue.length === 0 ? (
        <div className="mb-xl rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          <CheckIcon className="mx-auto h-6 w-6 text-primary-500" strokeWidth={3} />
          <p className="mt-sm">Aucune exception : tout a été tranché par les règles.</p>
        </div>
      ) : (
        <ul className="mb-xl space-y-md">
          {queue.map((d) => (
            <li key={`${d.ride_id}-${d.kind}`} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-warning/40">
              <div className="flex flex-wrap items-center gap-sm border-b border-neutral-100 bg-neutral-50 px-md py-xs">
                <span className="inline-flex items-center gap-xs rounded-full bg-warning px-sm py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  {d.kind === 'driver_contest' ? (
                    <>
                      <AlertTriangleIcon className="h-3 w-3" />
                      Contestation chauffeur
                    </>
                  ) : (
                    <>
                      <CrosshairIcon className="h-3 w-3" strokeWidth={2.5} />
                      Réclamation client
                    </>
                  )}
                </span>
                <span className="text-[11px] text-neutral-600">{RULE_LABELS[d.rule_code ?? ''] ?? d.rule_code}</span>
                <span className="ml-auto text-[11px] text-neutral-500">ouvert le {fmtDate(d.opened_at)}</span>
              </div>

              <div className="grid grid-cols-1 gap-md p-md md:grid-cols-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Client</p>
                  <p className="mt-xs text-sm font-semibold text-neutral-900">{d.client_name ?? '—'}</p>
                  <p className="mt-md text-[10px] font-bold uppercase tracking-wider text-neutral-500">Chauffeur</p>
                  <p className="mt-xs text-sm font-semibold text-neutral-900">{d.driver_name ?? '—'}</p>
                  {(d.driver_points ?? 0) > 0 && (
                    <p className="mt-xs text-[11px] text-error">{d.driver_points} point(s) de fiabilité actifs</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Motif invoqué</p>
                  <p className="mt-xs text-sm font-bold text-neutral-900">
                    {REASON_LABELS[d.cancel_reason_user ?? ''] ?? d.cancel_reason_user ?? '—'}
                  </p>
                  <p className="mt-md text-[10px] font-bold uppercase tracking-wider text-neutral-500">Trajet</p>
                  <p className="mt-xs truncate text-xs text-neutral-700">{d.pickup_address}</p>
                  <p className="truncate text-xs text-neutral-500">→ {d.dropoff_address}</p>
                  <p className="mt-xs text-xs font-bold text-neutral-900">Frais : {fmt(d.fee_fcfa)} F</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Données de la course</p>
                  <Evidence data={d.evidence} />
                </div>
              </div>

              {(d.appeal_note || d.driver_dispute_reason) && (
                <div className="border-t border-neutral-100 bg-warning/5 p-md">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-warning">
                    {d.kind === 'driver_contest' ? 'Version du chauffeur' : 'Contestation du client'}
                  </p>
                  <p className="mt-xs text-sm italic text-neutral-800">« {d.appeal_note ?? d.driver_dispute_reason} »</p>
                </div>
              )}

              {d.kind === 'client_claim' ? (
                <div className="grid grid-cols-1 gap-sm border-t border-neutral-100 bg-neutral-50 p-md md:grid-cols-3">
                  {(
                    [
                      ['driver', 'Chauffeur fautif', 'Client remboursé, part du chauffeur reprise, point de fiabilité', 'bg-error'],
                      ['client', 'Client fautif', 'Frais maintenus, réclamation rejetée', 'bg-primary-500'],
                      ['goodwill', 'Geste commercial', 'TamCar rembourse le client, le chauffeur garde sa part', 'bg-warning'],
                    ] as const
                  ).map(([verdict, label, hint, cls]) => (
                    <form key={verdict} action={resolveDispute} className="flex flex-col gap-xs">
                      <input type="hidden" name="ride_id" value={d.ride_id} />
                      <input type="hidden" name="verdict" value={verdict} />
                      <input
                        type="text"
                        name="note"
                        placeholder="Note (optionnelle)"
                        className="rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                      />
                      <ConfirmSubmit
                        message={`${label} : ${hint}. Confirmer ?`}
                        className={`rounded-md px-md py-sm text-xs font-bold text-white hover:brightness-110 ${cls}`}
                      >
                        {label}
                      </ConfirmSubmit>
                      <span className="text-[10px] text-neutral-500">{hint}</span>
                    </form>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-sm border-t border-neutral-100 bg-neutral-50 p-md md:grid-cols-2">
                  <form action={resolveStrikeDispute} className="flex flex-col gap-xs">
                    <input type="hidden" name="ride_id" value={d.ride_id} />
                    <input type="hidden" name="uphold" value="false" />
                    <input
                      type="text"
                      name="note"
                      placeholder="Note (optionnelle)"
                      className="rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                    />
                    <ConfirmSubmit
                      message="Le chauffeur a raison : retirer le signalement et ses points ? Action définitive."
                      className="rounded-md bg-primary-500 px-md py-sm text-xs font-bold text-white hover:bg-primary-600"
                    >
                      Chauffeur a raison
                    </ConfirmSubmit>
                  </form>
                  <form action={resolveStrikeDispute} className="flex flex-col gap-xs">
                    <input type="hidden" name="ride_id" value={d.ride_id} />
                    <input type="hidden" name="uphold" value="true" />
                    <input
                      type="text"
                      name="note"
                      placeholder="Note (optionnelle)"
                      className="rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                    />
                    <ConfirmSubmit
                      message="Maintenir le signalement contre le chauffeur ?"
                      className="rounded-md bg-neutral-700 px-md py-sm text-xs font-bold text-white hover:bg-neutral-900"
                    >
                      Maintenir le signalement
                    </ConfirmSubmit>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Contrôle qualité */}
      {toAudit.length > 0 && (
        <section className="mb-xl">
          <h2 className="mb-sm text-sm font-bold uppercase tracking-wider text-neutral-500">
            Contrôle qualité : décisions automatiques à relire
          </h2>
          <ul className="space-y-sm">
            {toAudit.map((c) => (
              <li key={`${c.ride_id}-${c.kind}`} className="rounded-xl bg-white p-md shadow-sm ring-1 ring-neutral-200">
                <div className="flex flex-wrap items-center gap-sm text-xs">
                  {c.decision && (
                    <span className={`rounded-full px-sm py-0.5 text-[10px] font-bold ${DECISION_LABELS[c.decision]?.cls ?? ''}`}>
                      {DECISION_LABELS[c.decision]?.label ?? c.decision}
                    </span>
                  )}
                  <span className="text-neutral-600">{RULE_LABELS[c.rule_code ?? ''] ?? c.rule_code}</span>
                  <span className="text-neutral-500">
                    {c.client_name ?? '—'} / {c.driver_name ?? '—'} · {fmt(c.fee_fcfa)} F · {fmtDate(c.decided_at)}
                  </span>
                </div>
                <p className="mt-xs text-xs text-neutral-700">{c.explanation}</p>
                <div className="mt-sm flex flex-wrap gap-sm">
                  {([true, false] as const).map((ok) => (
                    <form key={String(ok)} action={auditCase} className="flex items-center gap-xs">
                      <input type="hidden" name="ride_id" value={c.ride_id} />
                      <input type="hidden" name="kind" value={c.kind} />
                      <input type="hidden" name="ok" value={String(ok)} />
                      {!ok && (
                        <input
                          type="text"
                          name="note"
                          placeholder="Pourquoi ?"
                          className="rounded-md border border-neutral-200 bg-white px-md py-xs text-xs"
                        />
                      )}
                      <ConfirmSubmit
                        message={ok ? 'Confirmer cette décision ?' : 'Signaler cette décision comme erronée ? Corrigez ensuite l’argent à la main si besoin.'}
                        className={`rounded-md px-md py-xs text-xs font-bold ${
                          ok ? 'bg-success/15 text-success hover:bg-success/25' : 'bg-error/15 text-error hover:bg-error/25'
                        }`}
                      >
                        {ok ? 'Décision correcte' : 'Décision erronée'}
                      </ConfirmSubmit>
                    </form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Historique des décisions */}
      <section className="mb-xl">
        <h2 className="mb-sm text-sm font-bold uppercase tracking-wider text-neutral-500">Dernières décisions</h2>
        {history.length === 0 ? (
          <p className="rounded-xl bg-white p-lg text-sm text-neutral-600 shadow-sm">Aucune décision pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-xl bg-white shadow-sm">
            {history.map((c) => (
              <li key={`${c.ride_id}-${c.kind}`} className="px-lg py-md text-xs">
                <div className="flex flex-wrap items-center gap-sm">
                  {c.decision && (
                    <span className={`rounded-full px-sm py-0.5 text-[10px] font-bold ${DECISION_LABELS[c.decision]?.cls ?? ''}`}>
                      {DECISION_LABELS[c.decision]?.label ?? c.decision}
                    </span>
                  )}
                  <span className="font-semibold text-neutral-800">{RULE_LABELS[c.rule_code ?? ''] ?? c.rule_code}</span>
                  <span className="text-neutral-500">
                    {c.client_name ?? '—'} / {c.driver_name ?? '—'} · {fmt(c.fee_fcfa)} F
                    {c.refund_fcfa > 0 ? ` · remboursé ${fmt(c.refund_fcfa)} F` : ''}
                    {c.cost_fcfa > 0 ? ` · coût TamCar ${fmt(c.cost_fcfa)} F` : ''}
                  </span>
                  <span className="ml-auto text-neutral-400">
                    {c.reviewed ? 'examiné par un humain · ' : 'automatique · '}
                    {fmtDate(c.decided_at)}
                    {c.appeal_outcome ? ` · contestation : ${c.appeal_outcome}` : ''}
                    {c.audit_result ? ` · relecture : ${c.audit_result === 'confirmed' ? 'correcte' : 'erronée'}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Réglages */}
      <section className="mb-xl">
        <h2 className="mb-sm text-sm font-bold uppercase tracking-wider text-neutral-500">Réglages des règles automatiques</h2>
        <p className="mb-sm text-xs text-neutral-600">
          Chaque changement s&apos;applique immédiatement aux prochains litiges. Pour que presque tout se règle sans
          vous, gardez le plafond de geste commercial assez haut ; pour limiter le coût, baissez-le ou réduisez le
          budget mensuel.
        </p>
        <ul className="divide-y divide-neutral-200 rounded-xl bg-white shadow-sm">
          {ruleRows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center justify-between gap-md px-lg py-sm">
              <span className="min-w-0 flex-1 text-xs text-neutral-800">{r.label}</span>
              <form action={setDisputeRule} className="flex items-center gap-xs">
                <input type="hidden" name="key" value={r.key} />
                <input
                  type="number"
                  name="value"
                  min={0}
                  defaultValue={r.value}
                  className="w-28 rounded-md border border-neutral-200 bg-white px-md py-xs text-right text-sm"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
                <ConfirmSubmit
                  message="Enregistrer ce réglage ?"
                  className="rounded-md bg-neutral-800 px-md py-xs text-xs font-bold text-white hover:bg-neutral-900"
                >
                  OK
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
