'use client';

import { useState } from 'react';
import { CheckIcon } from '@/components/Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * Changement de mot de passe par l'utilisateur lui-même. Indispensable pour les partenaires
 * véhicule, à qui TamCar remet un mot de passe temporaire : ils le remplacent dès la première
 * connexion.
 */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne sont pas identiques.');
      return;
    }
    setSaving(true);
    const { error: err } = await supabaseBrowser.auth.updateUser({ password });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    setPassword('');
    setConfirm('');
    setTimeout(() => {
      setDone(false);
      setOpen(false);
    }, 3000);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-neutral-200 bg-white py-md text-sm font-semibold text-neutral-800 shadow-sm hover:border-primary-500"
      >
        Changer mon mot de passe
      </button>
    );
  }

  const input =
    'w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <form onSubmit={submit} className="space-y-md rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Nouveau mot de passe</p>
      <input
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Nouveau mot de passe (8 caractères minimum)"
        className={input}
      />
      <input
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirmez le mot de passe"
        className={input}
      />
      {error && <p className="rounded-md bg-error/10 p-md text-sm text-error">{error}</p>}
      {done && (
        <p className="inline-flex items-center gap-xs rounded-md bg-primary-50 p-md text-sm font-semibold text-primary-700">
          Mot de passe modifié
          <CheckIcon className="h-4 w-4" strokeWidth={3} />
        </p>
      )}
      <div className="flex gap-sm">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-sm text-sm font-bold text-white shadow-glow disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-xl px-lg py-sm text-sm font-semibold text-neutral-500 hover:text-neutral-800"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
