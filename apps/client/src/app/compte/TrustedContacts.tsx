'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { displayBeninPhone, formatBeninPhone } from '@/lib/phone';
import { enableNightShare, isNightShareDisabled } from '@/lib/nightShare';

type Contact = { id: string; name: string; phone: string };

/**
 * Mes proches de confiance (deux au plus) : de 21 h à 5 h, TamCar propose de les prévenir en un geste,
 * avec le lien de suivi de la course. Le client accepte ou décline à chaque course.
 */
export function TrustedContacts({ profileId }: { profileId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [off, setOff] = useState(false);

  async function load() {
    const { data } = await supabaseBrowser.from('trusted_contacts').select('id, name, phone').order('created_at');
    setContacts(Array.isArray(data) ? (data as Contact[]) : []);
    setLoaded(true);
  }

  useEffect(() => {
    void load();
    setOff(isNightShareDisabled());
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const e164 = formatBeninPhone(phone);
    if (name.trim().length < 2) {
      setError('Indiquez le prénom de votre proche.');
      return;
    }
    if (!e164) {
      setError('Numéro invalide (exemple : 01 67 59 18 17).');
      return;
    }
    setSaving(true);
    const { error: err } = await supabaseBrowser
      .from('trusted_contacts')
      .insert({ profile_id: profileId, name: name.trim(), phone: e164 });
    setSaving(false);
    if (err) {
      setError(/duplicate|unique/i.test(err.message) ? 'Ce numéro est déjà enregistré.' : err.message);
      return;
    }
    setName('');
    setPhone('');
    await load();
  }

  async function remove(id: string) {
    await supabaseBrowser.from('trusted_contacts').delete().eq('id', id);
    await load();
  }

  const input =
    'w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="mt-md space-y-md rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
      <p className="text-xs text-neutral-600">
        De 21 h à 5 h, TamCar vous propose de prévenir l’un d’eux en un geste : il reçoit le lien pour suivre votre course en
        direct. Vous acceptez ou refusez à chaque course.
      </p>

      {loaded && contacts.length > 0 && (
        <ul className="space-y-xs">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-md rounded-lg bg-neutral-50 px-md py-sm">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-neutral-900">{c.name}</span>
                <span className="block text-xs text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {displayBeninPhone(c.phone)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void remove(c.id)}
                className="flex-none text-xs font-semibold text-neutral-500 hover:text-error"
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      {loaded && contacts.length < 2 && (
        <form onSubmit={add} className="space-y-sm">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom du proche" maxLength={40} />
          <input
            className={input}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Numéro (WhatsApp de préférence)"
            type="tel"
            inputMode="tel"
          />
          {error && <p className="rounded-md bg-error/10 p-sm text-xs text-error">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-primary-500 py-sm text-sm font-bold text-white shadow-glow disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : contacts.length === 0 ? 'Ajouter un proche' : 'Ajouter un deuxième proche'}
          </button>
        </form>
      )}
      {loaded && contacts.length >= 2 && (
        <p className="text-[11px] text-neutral-500">Deux proches enregistrés (maximum). Retirez-en un pour en ajouter un autre.</p>
      )}

      {off && (
        <button
          type="button"
          onClick={() => {
            enableNightShare();
            setOff(false);
          }}
          className="text-xs font-semibold text-primary-700 underline"
        >
          Je ne recevais plus la proposition de nuit : la réactiver
        </button>
      )}
    </div>
  );
}
