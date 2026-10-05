'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShareIcon } from '@/components/Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';
import {
  disableNightShare,
  getNightShareChoice,
  isNightInPortoNovo,
  isNightShareDisabled,
  setNightShareChoice,
} from '@/lib/nightShare';

type Contact = { id: string; name: string; phone: string };

/**
 * Proposition de nuit (de 21 h à 5 h) : prévenir un proche en lui envoyant le lien de suivi de la course.
 * Le client accepte (un geste, depuis son téléphone) ou décline ; la proposition ne revient pas pour la
 * même course, et il peut demander à ne plus la recevoir.
 */
export function NightSharePrompt({
  rideId,
  active,
  onShare,
}: {
  rideId: string;
  active: boolean;
  /** Crée le lien et ouvre le partage (vers `phone` si fourni). Renvoie true si le lien a été partagé. */
  onShare: (phone?: string) => Promise<boolean>;
}) {
  const [night, setNight] = useState(false);
  const [choice, setChoice] = useState<'accepted' | 'declined' | null>(null);
  const [disabled, setDisabled] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // État de départ + l'heure est revérifiée chaque minute (une course commencée à 20 h 55 devient « de nuit »).
  useEffect(() => {
    setChoice(getNightShareChoice(rideId));
    setDisabled(isNightShareDisabled());
    const tick = () => setNight(isNightInPortoNovo());
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [rideId]);

  const visible = active && night && !disabled && choice === null;

  useEffect(() => {
    if (!visible || contacts.length > 0) return;
    let alive = true;
    void supabaseBrowser
      .from('trusted_contacts')
      .select('id, name, phone')
      .order('created_at')
      .then(({ data }) => {
        if (alive && Array.isArray(data)) setContacts(data as Contact[]);
      });
    return () => {
      alive = false;
    };
  }, [visible, contacts.length]);

  if (sentTo) {
    return (
      <p className="mx-lg mb-md rounded-xl bg-primary-50 p-md text-center text-xs font-semibold text-primary-700">
        Suivi partagé{sentTo === '*' ? '.' : ` avec ${sentTo}.`}
      </p>
    );
  }
  if (!visible) return null;

  function decline() {
    setNightShareChoice(rideId, 'declined');
    setChoice('declined');
  }

  async function share(phone: string | undefined, name: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await onShare(phone);
      if (ok) {
        setNightShareChoice(rideId, 'accepted');
        setChoice('accepted');
        setSentTo(name ?? '*');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-lg mb-md rounded-xl border-2 border-primary-100 bg-primary-50 p-md">
      <p className="flex items-center gap-xs text-sm font-bold text-primary-900">
        <ShareIcon className="h-4 w-4" />
        Vous roulez de nuit
      </p>
      <p className="mt-xs text-xs text-neutral-700">
        Prévenez un proche : il suivra votre course en direct, sans compte à créer.
      </p>
      <div className="mt-md space-y-xs">
        {contacts.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={busy}
            onClick={() => void share(c.phone, c.name)}
            className="w-full rounded-lg bg-primary-500 py-sm text-sm font-bold text-white shadow-glow disabled:opacity-50"
          >
            Prévenir {c.name}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => void share(undefined, null)}
          className={`w-full rounded-lg py-sm text-sm font-bold disabled:opacity-50 ${
            contacts.length > 0
              ? 'border border-primary-300 bg-white text-primary-700'
              : 'bg-primary-500 text-white shadow-glow'
          }`}
        >
          {contacts.length > 0 ? 'Choisir quelqu’un d’autre' : 'Choisir un proche'}
        </button>
        <button
          type="button"
          onClick={decline}
          className="w-full rounded-lg py-sm text-sm font-semibold text-neutral-600 hover:text-neutral-900"
        >
          Non merci
        </button>
      </div>
      <p className="mt-xs flex flex-wrap items-center justify-between gap-xs text-[10px] text-neutral-500">
        <span>
          {contacts.length === 0 && (
            <>
              <Link href="/compte" className="font-semibold text-primary-700 underline">
                Enregistrer mes proches
              </Link>{' '}
              pour les prévenir en un geste.
            </>
          )}
        </span>
        <button
          type="button"
          onClick={() => {
            disableNightShare();
            setDisabled(true);
          }}
          className="underline"
        >
          Ne plus me le proposer
        </button>
      </p>
    </section>
  );
}
