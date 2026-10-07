'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import {
  KIND_LABELS,
  contributions,
  dayNum,
  effectiveEnd,
  fmtDay,
  fmtDuration,
  fmtFcfa,
  isEarlyExit,
  periodState,
  refundAmount,
  refundDueOn,
  refundState,
  savingsAtEnd,
  workingDays,
  type LineData,
  type NsiaPeriod,
  type RedemptionView,
} from '@/lib/nsia';
import type { Sel } from './NsiaBoard';

const REFUND_LABELS: Record<string, string> = {
  none: '—',
  running: 'Conducteur en poste',
  planned: 'À venir',
  due: 'À payer sous 30 jours',
  late: 'En retard',
  paid: 'Remboursé',
};

export function NsiaDetail({
  data,
  today,
  sel,
  onSelect,
  canWrite,
  isAdmin,
}: {
  data: LineData[];
  today: string;
  sel: Sel;
  onSelect: (s: Sel) => void;
  canWrite: boolean;
  isAdmin: boolean;
}) {
  if (!sel) {
    return (
      <p className="mt-lg rounded-xl bg-white p-lg text-sm text-neutral-600 shadow-sm ring-1 ring-neutral-200">
        Cliquez sur une ligne, une période ou un rachat pour en voir le détail et le mettre à jour.
      </p>
    );
  }

  let d: LineData | undefined;
  let period: NsiaPeriod | undefined;
  let red: RedemptionView | undefined;
  if (sel.type === 'line') d = data.find((x) => x.line.id === sel.id);
  if (sel.type === 'period') {
    d = data.find((x) => x.periods.some((p) => p.id === sel.id));
    period = d?.periods.find((p) => p.id === sel.id);
  }
  if (sel.type === 'redemption') {
    d = data.find((x) => x.reds.some((r) => r.id === sel.id));
    red = d?.reds.find((r) => r.id === sel.id);
  }
  if (!d) return null;

  return (
    <section className="mt-lg rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
          {sel.type === 'line' ? 'Détail de la ligne' : sel.type === 'period' ? 'Détail de la période' : 'Détail du rachat'} · {d.line.label}
        </h2>
        <button type="button" onClick={() => onSelect(null)} className="text-xs font-bold text-neutral-500 hover:text-neutral-900">
          Fermer
        </button>
      </div>

      {sel.type === 'line' && <LineDetail d={d} today={today} onSelect={onSelect} canWrite={canWrite} isAdmin={isAdmin} />}
      {sel.type === 'period' && period && <PeriodDetail d={d} p={period} today={today} canWrite={canWrite} onSelect={onSelect} />}
      {sel.type === 'redemption' && red && <RedemptionDetail d={d} r={red} canWrite={canWrite} />}
    </section>
  );
}

// ---------------------------------------------------------------- ligne

function LineDetail({
  d,
  today,
  onSelect,
  canWrite,
  isAdmin,
}: {
  d: LineData;
  today: string;
  onSelect: (s: Sel) => void;
  canWrite: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owed = d.refunds.filter((f) => f.state !== 'running' && f.state !== 'paid').reduce((s, f) => s + f.amount, 0);

  async function remove() {
    if (!window.confirm(`Supprimer définitivement « ${d.line.label} » avec ses périodes et ses rachats ?`)) return;
    setBusy(true);
    const { error: err } = await supabaseBrowser.from('bo_nsia_lines').delete().eq('id', d.line.id);
    if (err) setError(err.message);
    else {
      onSelect(null);
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="mt-md">
      <dl className="grid grid-cols-2 gap-md text-sm md:grid-cols-4">
        <Fact label="Cotisations versées à ce jour" value={`${fmtFcfa(d.contributedToDate)} F`} />
        <Fact label="Épargne due aux conducteurs sortis" value={`${fmtFcfa(owed)} F`} />
        <Fact label="Avance de TamCar aujourd'hui" value={`${fmtFcfa(d.advanceNow)} F`} />
        <Fact label="Avance maximale prévue" value={`${fmtFcfa(d.peak.value)} F`} sub={d.peak.date ? `le ${fmtDay(d.peak.date)}` : undefined} />
      </dl>

      <h3 className="mt-lg text-xs font-bold uppercase tracking-wider text-neutral-500">Chaîne de conducteurs</h3>
      <div className="mt-xs overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              <th className="py-sm pr-md">Période</th>
              <th className="py-sm pr-md">Dates</th>
              <th className="py-sm pr-md text-right">Épargne à la fin</th>
              <th className="py-sm pr-md">Remboursement</th>
            </tr>
          </thead>
          <tbody>
            {d.periods.map((p) => {
              const rs = refundState(p, today);
              return (
                <tr key={p.id} onClick={() => onSelect({ type: 'period', id: p.id })} className="cursor-pointer border-t border-neutral-100 hover:bg-primary-50">
                  <td className="py-sm pr-md font-semibold text-neutral-900">
                    {p.label} {p.kind === 'vacancy' && <span className="ml-xs rounded-full bg-warning/10 px-sm py-0.5 text-[10px] font-bold text-warning">vacant</span>}
                  </td>
                  <td className="py-sm pr-md text-neutral-700">
                    {fmtDay(p.starts_on)} → {fmtDay(effectiveEnd(p))}
                  </td>
                  <td className="py-sm pr-md text-right">{p.kind === 'driver' ? `${fmtFcfa(savingsAtEnd(d.line, p))} F` : '—'}</td>
                  <td className="py-sm pr-md">
                    {p.kind === 'driver' ? (
                      <span className={rs === 'late' ? 'font-bold text-error' : rs === 'paid' ? 'text-success' : 'text-neutral-700'}>
                        {REFUND_LABELS[rs]}
                        {rs !== 'running' && rs !== 'paid' ? ` · ${fmtDay(refundDueOn(p))}` : ''}
                        {rs === 'paid' ? ` · le ${fmtDay(p.refunded_on)}` : ''}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="mt-lg text-xs font-bold uppercase tracking-wider text-neutral-500">Rachats</h3>
      <div className="mt-xs flex flex-wrap gap-sm">
        {d.reds.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect({ type: 'redemption', id: r.id })}
            className="rounded-lg bg-neutral-100 px-md py-sm text-left text-sm hover:bg-primary-50"
          >
            <p className="font-bold text-neutral-900">{fmtDay(r.due_on)}</p>
            <p className="text-[11px] text-neutral-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {r.done_on ? `fait · ${fmtFcfa(r.to_redeem)} F reçus` : `${fmtFcfa(r.to_redeem)} F à racheter`}
            </p>
          </button>
        ))}
      </div>

      <h3 className="mt-lg text-xs font-bold uppercase tracking-wider text-neutral-500">Chevauchements</h3>
      {d.overlaps.length === 0 ? (
        <p className="mt-xs text-sm text-neutral-600">Aucun : à chaque date, un seul conducteur (ou un poste vacant) occupe la ligne.</p>
      ) : (
        <ul className="mt-xs space-y-xs text-sm text-error">
          {d.overlaps.map((o, i) => (
            <li key={i}>
              <strong>{o.a.label}</strong> et <strong>{o.b.label}</strong> se recouvrent du {fmtDay(o.from)} au {fmtDay(o.to)} ({o.days} jours) : la ligne serait alimentée
              deux fois, ou une période est mal datée.
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-md rounded-md bg-error/10 p-md text-sm text-error">{error}</p>}
      {canWrite && isAdmin && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="mt-lg rounded-lg px-md py-sm text-xs font-bold text-error ring-1 ring-error/40 hover:bg-error/10 disabled:opacity-50"
        >
          Supprimer la ligne
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- période

function PeriodDetail({
  d,
  p,
  today,
  canWrite,
  onSelect,
}: {
  d: LineData;
  p: NsiaPeriod;
  today: string;
  canWrite: boolean;
  onSelect: (s: Sel) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const end = effectiveEnd(p);
  const days = workingDays(p.starts_on, end);
  const contributed = contributions(d.line, p, today);
  const savings = savingsAtEnd(d.line, p);
  const due = refundDueOn(p);
  const rs = refundState(p, today);
  const state = periodState(p, today);
  const mine = d.overlaps.filter((o) => o.a.id === p.id || o.b.id === p.id);

  // le rachat qui récupère l'épargne de cette période : le premier rachat à la date de fin ou après
  const covering = d.reds.find((r) => r.due_on >= end);
  const wait = due && covering ? dayNum(covering.due_on) - dayNum(due) : null;

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabaseBrowser.from('bo_nsia_periods').update(patch).eq('id', p.id);
    if (err) setError(err.message);
    else router.refresh();
    setBusy(false);
  }

  return (
    <div className="mt-md">
      <p className="text-lg font-extrabold text-neutral-900">
        {p.label}{' '}
        <span className={`ml-sm rounded-full px-md py-xs align-middle text-[11px] font-bold ${p.kind === 'vacancy' ? 'bg-warning/10 text-warning' : 'bg-primary-100 text-primary-700'}`}>
          {p.kind === 'vacancy' ? 'Poste vacant' : 'Conducteur'}
        </span>
      </p>
      <dl className="mt-md grid grid-cols-2 gap-md text-sm md:grid-cols-4">
        <Fact label="Début" value={fmtDay(p.starts_on)} />
        <Fact
          label={p.ended_on ? 'Sortie effective' : 'Fin prévue'}
          value={fmtDay(end)}
          sub={isEarlyExit(p) ? `départ anticipé (prévu le ${fmtDay(p.planned_end_on)})` : `${fmtDuration(dayNum(end) - dayNum(p.starts_on) + 1)} · ${days} jours prélevés`}
        />
        <Fact label="État" value={state === 'planned' ? 'À venir' : state === 'active' ? 'En cours' : 'Terminée'} />
        <Fact label="Versé à la ligne à ce jour" value={`${fmtFcfa(contributed)} F`} sub={p.kind === 'vacancy' ? 'avancé par TamCar' : 'prélevé sur le conducteur'} />
      </dl>

      {p.kind === 'driver' && (
        <div className="mt-lg rounded-lg bg-neutral-100 p-md text-sm">
          <p className="font-bold text-neutral-900">Remboursement du conducteur</p>
          <p className="mt-xs text-neutral-700">
            Épargne à la fin : <strong>{fmtFcfa(savings)} F</strong>
            {p.refund_fcfa != null ? ` · remboursé : ${fmtFcfa(p.refund_fcfa)} F` : ''}.{' '}
            {rs === 'paid'
              ? `Remboursé le ${fmtDay(p.refunded_on)}.`
              : rs === 'running'
                ? `À payer au plus tard le ${fmtDay(due)} si le contrat va à son terme (60 jours après la fin), ou 90 jours après un départ anticipé.`
                : `À payer au plus tard le ${fmtDay(due)} (${isEarlyExit(p) ? '90' : '60'} jours après la sortie)${rs === 'late' ? ', en retard' : ''}.`}
          </p>
          {covering && wait != null && rs !== 'paid' && (
            <p className="mt-xs text-neutral-700">
              Le rachat qui récupère cette épargne est celui du <strong>{fmtDay(covering.due_on)}</strong>
              {wait > 0 ? (
                <>
                  , soit <strong>{wait} jours après</strong> l&apos;échéance du remboursement : TamCar avance <strong>{fmtFcfa(refundAmount(d.line, p))} F</strong> pendant ce temps.
                </>
              ) : (
                <>, avant l&apos;échéance du remboursement : l&apos;argent est déjà revenu, aucune avance.</>
              )}
            </p>
          )}
        </div>
      )}

      {mine.length > 0 && (
        <ul className="mt-md space-y-xs text-sm text-error">
          {mine.map((o, i) => {
            const other = o.a.id === p.id ? o.b : o.a;
            return (
              <li key={i}>
                Chevauche <strong>{other.label}</strong> du {fmtDay(o.from)} au {fmtDay(o.to)} ({o.days} jours).{' '}
                <button type="button" className="font-bold underline" onClick={() => onSelect({ type: 'period', id: other.id })}>
                  Voir
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-md rounded-md bg-error/10 p-md text-sm text-error">{error}</p>}

      {canWrite && (
        <div className="mt-lg grid grid-cols-1 gap-md lg:grid-cols-3">
          <MiniForm
            title="Renommer"
            busy={busy}
            onSubmit={(fd) => {
              const label = String(fd.get('label') || '').trim();
              if (label) void save({ label });
            }}
          >
            <input name="label" defaultValue={p.label} className={inputCls} aria-label="Nom" />
          </MiniForm>

          <MiniForm
            title={p.ended_on ? 'Modifier la sortie effective' : 'Enregistrer une sortie anticipée'}
            hint="Raccourcit la période : l'épargne et l'échéance de remboursement (90 jours) sont recalculées."
            busy={busy}
            onSubmit={(fd) => {
              const v = String(fd.get('ended_on') || '');
              void save({ ended_on: v || null });
            }}
          >
            <input type="date" name="ended_on" defaultValue={p.ended_on ?? ''} min={p.starts_on} className={inputCls} aria-label="Date de sortie" />
          </MiniForm>

          {p.kind === 'driver' && (
            <MiniForm
              title={p.refunded_on ? 'Remboursement enregistré' : 'Marquer comme remboursé'}
              hint="Le montant réel peut différer de l'épargne calculée (sommes dues déduites)."
              busy={busy}
              onSubmit={(fd) => {
                const v = String(fd.get('refunded_on') || '');
                const amount = String(fd.get('refund') || '').replace(/\s/g, '');
                void save({ refunded_on: v || null, refund_fcfa: v && amount ? parseInt(amount, 10) : v ? savings : null });
              }}
            >
              <input type="date" name="refunded_on" defaultValue={p.refunded_on ?? today} className={inputCls} aria-label="Date de remboursement" />
              <input name="refund" inputMode="numeric" defaultValue={String(p.refund_fcfa ?? savings)} className={inputCls} aria-label="Montant remboursé" />
            </MiniForm>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- rachat

function RedemptionDetail({ d, r, canWrite }: { d: LineData; r: RedemptionView; canWrite: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // remboursements qui tombent avant ce rachat (donc avancés par TamCar)
  const before = d.refunds.filter((f) => f.due <= r.due_on && f.state !== 'running');
  const prev = [...d.reds].filter((x) => x.due_on < r.due_on).pop();

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabaseBrowser.from('bo_nsia_redemptions').update(patch).eq('id', r.id);
    if (err) setError(err.message);
    else router.refresh();
    setBusy(false);
  }

  return (
    <div className="mt-md">
      <p className="text-lg font-extrabold text-neutral-900">
        Rachat du {fmtDay(r.due_on)}{' '}
        <span
          className={`ml-sm rounded-full px-md py-xs align-middle text-[11px] font-bold ${
            r.state === 'done' ? 'bg-success/10 text-success' : r.state === 'late' ? 'bg-error/10 text-error' : r.state === 'soon' ? 'bg-warning/10 text-warning' : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          {r.state === 'done' ? `Fait le ${fmtDay(r.done_on)}` : r.state === 'late' ? `En retard de ${-r.days_left} j` : `Dans ${r.days_left} j`}
        </span>
      </p>
      <dl className="mt-md grid grid-cols-2 gap-md text-sm md:grid-cols-4">
        <Fact label={r.done_on ? 'Somme reçue de NSIA' : 'Capital à racheter (estimation)'} value={`${fmtFcfa(r.to_redeem)} F`} />
        <Fact label="Dont intérêts" value={r.interest_fcfa != null ? `${fmtFcfa(r.interest_fcfa)} F` : 'laissés sur la ligne'} />
        <Fact label="Rachat précédent" value={prev ? fmtDay(prev.done_on ?? prev.due_on) : 'aucun (premier rachat)'} />
        <Fact label="Remboursements dus avant ce rachat" value={`${fmtFcfa(before.reduce((s, f) => s + f.amount, 0))} F`} sub={`${before.length} conducteur${before.length > 1 ? 's' : ''}`} />
      </dl>

      <h3 className="mt-lg text-xs font-bold uppercase tracking-wider text-neutral-500">D&apos;où vient le capital</h3>
      <ul className="mt-xs space-y-xs text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {r.contributors.map((c) => (
          <li key={c.period.id} className="flex justify-between gap-md border-b border-neutral-100 py-xs">
            <span>
              {c.period.label}
              <span className="text-neutral-500">
                {' '}
                · {c.period.kind === 'vacancy' ? 'avancé par TamCar' : KIND_LABELS[d.line.vehicle_kind].toLowerCase()}
              </span>
            </span>
            <strong>{fmtFcfa(c.amount)} F</strong>
          </li>
        ))}
      </ul>

      {error && <p className="mt-md rounded-md bg-error/10 p-md text-sm text-error">{error}</p>}
      {canWrite && (
        <div className="mt-lg grid grid-cols-1 gap-md lg:grid-cols-2">
          <MiniForm
            title={r.done_on ? 'Rachat enregistré' : 'Enregistrer le rachat effectué'}
            hint="Somme reçue de NSIA ; les intérêts, s'ils sont versés, sont indiqués à part."
            busy={busy}
            onSubmit={(fd) => {
              const done = String(fd.get('done_on') || '');
              const amount = String(fd.get('amount') || '').replace(/\s/g, '');
              const interest = String(fd.get('interest') || '').replace(/\s/g, '');
              void save({
                done_on: done || null,
                amount_fcfa: done && amount ? parseInt(amount, 10) : null,
                interest_fcfa: done && interest ? parseInt(interest, 10) : null,
              });
            }}
          >
            <input type="date" name="done_on" defaultValue={r.done_on ?? ''} className={inputCls} aria-label="Date du rachat" />
            <input name="amount" inputMode="numeric" defaultValue={r.amount_fcfa != null ? String(r.amount_fcfa) : String(r.to_redeem)} className={inputCls} aria-label="Somme reçue" />
            <input name="interest" inputMode="numeric" placeholder="Intérêts (facultatif)" defaultValue={r.interest_fcfa != null ? String(r.interest_fcfa) : ''} className={inputCls} aria-label="Intérêts" />
          </MiniForm>
          <MiniForm
            title="Reporter la date prévue"
            hint="À utiliser si NSIA ou TamCar décale le rachat."
            busy={busy}
            onSubmit={(fd) => {
              const v = String(fd.get('due_on') || '');
              if (v) void save({ due_on: v });
            }}
          >
            <input type="date" name="due_on" defaultValue={r.due_on} className={inputCls} aria-label="Nouvelle date prévue" />
          </MiniForm>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- éléments communs

const inputCls =
  'w-full rounded-lg bg-neutral-100 px-md py-sm text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500';

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="mt-xs font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </dd>
      {sub && <p className="text-[11px] text-neutral-600">{sub}</p>}
    </div>
  );
}

function MiniForm({
  title,
  hint,
  busy,
  onSubmit,
  children,
}: {
  title: string;
  hint?: string;
  busy: boolean;
  onSubmit: (fd: FormData) => void;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      className="rounded-lg bg-white p-md ring-1 ring-neutral-200"
    >
      <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-700">{title}</p>
      {hint && <p className="mt-xs text-[11px] text-neutral-600">{hint}</p>}
      <div className="mt-sm flex flex-col gap-sm">{children}</div>
      <button type="submit" disabled={busy} className="mt-sm rounded-lg bg-primary-700 px-md py-sm text-xs font-bold text-white hover:bg-primary-800 disabled:opacity-50">
        {busy ? '…' : 'Enregistrer'}
      </button>
    </form>
  );
}
