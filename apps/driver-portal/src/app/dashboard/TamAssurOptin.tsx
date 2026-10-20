'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CoinsIcon } from '@/components/Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { formatFcfa } from '@/lib/wallet';

/**
 * TamAssur est facultatif pour un chauffeur propriétaire de son véhicule (obligatoire en formule Cession) :
 * invitation à adhérer ; une fois adhérent, la carte TamAssur s'affiche avec un bouton pour se retirer.
 */
export function TamAssurOptin({
  amount,
  goal,
  mode,
}: {
  amount: number;
  goal: number;
  mode: 'invite' | 'leave';
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(enroll: boolean) {
    if (!enroll && !window.confirm('Arrêter TamAssur ? Les prélèvements s’arrêtent et TamCar vous restitue l’épargne constituée sous 90 jours au plus. Vous pourrez adhérer de nouveau plus tard.')) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const { error: rpcErr } = await supabaseBrowser.rpc('set_my_tamassur_enrollment', { p_enroll: enroll });
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      router.refresh();
    });
  }

  if (mode === 'leave') {
    return (
      <div className="mt-sm px-xs">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={pending}
          className="text-[11px] font-bold text-neutral-500 underline hover:text-error disabled:opacity-60"
        >
          {pending ? 'Un instant…' : 'Arrêter TamAssur'}
        </button>
        {error && <p className="mt-xs text-[11px] font-semibold text-error">{error}</p>}
      </div>
    );
  }

  return (
    <section className="mt-lg rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
      <h2 className="flex items-center gap-xs text-xs font-bold uppercase tracking-wider text-neutral-500">
        <CoinsIcon className="h-4 w-4" />
        TamAssur · facultatif
      </h2>
      <p className="mt-xs text-sm text-neutral-700">
        <strong>Une épargne garantie par TamCar.</strong> Vous mettez{' '}
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatFcfa(amount)} F par jour</strong> (du lundi au samedi) de côté : TamCar vous garantit{' '}
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatFcfa(goal)} F</strong> à l’échéance de votre véhicule, à condition que votre compte soit à jour.
      </p>
      <p className="mt-sm text-[11px] text-neutral-500">
        Vous êtes libre d’adhérer ou non. Le prélèvement commence le soir même sur votre portefeuille « Revenus » ; vous pouvez arrêter à tout moment et récupérer votre épargne.
      </p>
      <button
        type="button"
        onClick={() => run(true)}
        disabled={pending}
        className="mt-md rounded-lg bg-primary-600 px-md py-sm text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? 'Un instant…' : 'Adhérer à TamAssur'}
      </button>
      {error && <p className="mt-xs text-[11px] font-semibold text-error">{error}</p>}
    </section>
  );
}
