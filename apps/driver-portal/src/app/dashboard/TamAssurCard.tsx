'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CoinsIcon, CheckIcon } from '@/components/Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { formatFcfa } from '@/lib/wallet';

const CHIPS = [1000, 1500, 2000, 3000, 5000];
const GOAL = 600_000; // objectif commercial « ~600 000 F sur 2 ans »

type TodayCharge = { amount_fcfa: number; collected_fcfa: number; status: string } | null;

export function TamAssurCard({
  amount,
  capital,
  today,
  outstanding,
}: {
  amount: number;
  capital: number;
  today: TodayCharge;
  outstanding: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number>(amount);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    if (value < 1000) {
      setError('Minimum 1 000 F par jour.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const { error: rpcErr } = await supabaseBrowser.rpc('set_my_tamassur', { p_amount: value });
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  const badge: { txt: string; cls: string } = today
    ? today.status === 'paid'
      ? { txt: "Aujourd'hui : épargné", cls: 'bg-success/15 text-success' }
      : today.status === 'partial'
        ? { txt: "Aujourd'hui : partiel", cls: 'bg-warning/15 text-warning' }
        : { txt: "Aujourd'hui : en attente", cls: 'bg-neutral-100 text-neutral-500' }
    : { txt: 'À venir', cls: 'bg-neutral-100 text-neutral-500' };

  const pct = Math.min(100, Math.round((capital / GOAL) * 100));

  return (
    <section className="mt-lg rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
      <div className="flex items-start justify-between gap-md">
        <div>
          <h2 className="flex items-center gap-xs text-xs font-bold uppercase tracking-wider text-neutral-500">
            <CoinsIcon className="h-4 w-4" />
            TamAssur
          </h2>
          <p className="mt-xs text-sm text-neutral-700">
            Assurance épargne —{' '}
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatFcfa(amount)} F</strong>{' '}
            / jour, mis de côté automatiquement. Capital récupérable.
          </p>
        </div>
        <span className={`flex-none rounded-full px-md py-xs text-[10px] font-bold ${badge.cls}`}>
          {badge.txt}
        </span>
      </div>

      {/* Capital épargné + progression vers l'objectif */}
      <div className="mt-md rounded-lg bg-success/5 p-md">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Mon capital
          </span>
          <span className="text-[11px] text-neutral-500">Objectif {formatFcfa(GOAL)} F</span>
        </div>
        <p className="mt-xs text-2xl font-extrabold text-success" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatFcfa(capital)}
          <span className="ml-xs text-sm font-medium text-neutral-500">F</span>
        </p>
        <div className="mt-sm h-2 overflow-hidden rounded-full bg-neutral-200">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {outstanding > 0 && (
        <p className="mt-md rounded-md bg-warning/10 p-sm text-[11px] text-warning">
          Reste à épargner :{' '}
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatFcfa(outstanding)} F</strong>{' '}
          — mis de côté dès que vos revenus le permettent.
        </p>
      )}

      {!editing ? (
        <button
          type="button"
          onClick={() => {
            setValue(amount);
            setError(null);
            setEditing(true);
          }}
          className="mt-md text-xs font-bold text-primary-700 hover:text-primary-900"
        >
          Modifier mon montant
        </button>
      ) : (
        <div className="mt-md rounded-lg bg-neutral-50 p-md">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Montant par jour (min 1 000 F)
          </p>
          <div className="mt-sm flex flex-wrap gap-xs">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setValue(c)}
                className={`rounded-full px-md py-xs text-xs font-bold transition ${
                  value === c
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-neutral-700 ring-1 ring-neutral-200'
                }`}
              >
                {formatFcfa(c)}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={1000}
            step={500}
            value={value}
            onChange={(e) => setValue(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="mt-sm w-full rounded-lg border border-neutral-200 px-md py-sm text-sm"
            placeholder="Autre montant (F/jour)"
          />
          {error && <p className="mt-xs text-[11px] font-semibold text-error">{error}</p>}
          <div className="mt-sm flex gap-xs">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="flex flex-1 items-center justify-center gap-xs rounded-lg bg-primary-600 px-md py-sm text-sm font-bold text-white disabled:opacity-60"
            >
              <CheckIcon className="h-4 w-4" />
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className="rounded-lg px-md py-sm text-sm font-bold text-neutral-500"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
