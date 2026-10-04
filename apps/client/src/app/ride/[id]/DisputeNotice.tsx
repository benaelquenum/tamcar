'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { AlertTriangleIcon, CheckIcon } from '@/components/Icon';

type Row = {
  status: 'auto_decided' | 'human_review' | 'closed';
  decision: 'driver_at_fault' | 'client_at_fault' | 'goodwill' | 'no_fault' | null;
  explanation: string | null;
  refund_fcfa: number;
  decided_at: string | null;
  can_appeal: boolean;
  appeal_deadline: string | null;
  appealed: boolean;
  appeal_outcome: string | null;
};

function title(r: Row): string {
  if (r.status === 'human_review') return 'Litige en cours d’examen';
  switch (r.decision) {
    case 'driver_at_fault':
      return 'Réclamation acceptée : frais remboursés';
    case 'goodwill':
      return 'Frais remboursés (geste commercial)';
    case 'client_at_fault':
      return 'Réclamation non retenue';
    default:
      return 'Aucun frais à contester';
  }
}

/** Décision automatique d'un litige d'annulation, avec possibilité de contester une fois. */
export function DisputeNotice({ rideId }: { rideId: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser.rpc('client_dispute_for_ride', { p_ride_id: rideId });
    const first = Array.isArray(data) ? (data[0] as Row | undefined) : undefined;
    setRow(first ?? null);
  }, [rideId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!row) return null;

  async function appeal() {
    if (note.trim().length < 10) {
      setError('Expliquez en au moins 10 caractères ce qui s’est passé.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabaseBrowser.rpc('client_appeal_dispute', {
      p_ride_id: rideId,
      p_note: note.trim(),
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMsg((data as { message?: string } | null)?.message ?? 'Contestation enregistrée.');
    setOpen(false);
    void load();
  }

  const good = row.decision === 'driver_at_fault' || row.decision === 'goodwill';

  return (
    <div className={`mt-lg rounded-xl p-md ring-1 ${good ? 'bg-success/10 ring-success/30' : 'bg-neutral-50 ring-neutral-200'}`}>
      <p className="flex items-center gap-xs text-sm font-extrabold text-neutral-900">
        {good ? <CheckIcon className="h-4 w-4 text-success" strokeWidth={3} /> : <AlertTriangleIcon className="h-4 w-4 text-neutral-600" />}
        {title(row)}
      </p>
      {row.explanation && <p className="mt-xs text-xs text-neutral-700">{row.explanation}</p>}
      {row.refund_fcfa > 0 && (
        <p className="mt-xs text-xs font-bold text-success" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {row.refund_fcfa.toLocaleString('fr-FR').replace(/,/g, ' ')} F remboursés sur votre TamCar Crédit
        </p>
      )}
      {msg && <p className="mt-sm rounded-md bg-primary-50 p-sm text-xs font-semibold text-primary-700">{msg}</p>}

      {row.can_appeal && !msg && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-sm text-xs font-bold text-primary-700 underline"
        >
          Contester cette décision
          {row.appeal_deadline ? ` (jusqu’au ${new Date(row.appeal_deadline).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})` : ''}
        </button>
      )}
      {open && (
        <div className="mt-sm">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Expliquez ce qui s’est passé"
            className="w-full rounded-lg border border-neutral-200 bg-white p-sm text-sm"
          />
          {error && <p className="mt-xs text-xs font-semibold text-error">{error}</p>}
          <div className="mt-xs flex gap-xs">
            <button
              type="button"
              onClick={appeal}
              disabled={busy}
              className="flex-1 rounded-lg bg-primary-600 py-sm text-sm font-bold text-white disabled:opacity-60"
            >
              {busy ? 'Envoi…' : 'Envoyer ma contestation'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-md py-sm text-sm font-bold text-neutral-500">
              Annuler
            </button>
          </div>
        </div>
      )}
      {row.appealed && !msg && (
        <p className="mt-sm text-xs text-neutral-600">
          Contestation envoyée
          {row.appeal_outcome === 'rejected_auto' ? ' : confirmée par les données de la course.' : row.appeal_outcome === 'overturned' ? ' : acceptée.' : row.appeal_outcome === 'upheld' ? ' : décision confirmée après examen.' : ' : en cours d’examen.'}
        </p>
      )}
    </div>
  );
}
