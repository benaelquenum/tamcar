'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

type Props = {
  initialFullName: string;
  userEmail: string;
  userPhone: string;
};

export function AccountForm({ initialFullName, userEmail, userPhone }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canSave = fullName.trim().length >= 2 && fullName.trim() !== initialFullName && !saving;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error: err } = await supabaseBrowser.auth.updateUser({
      data: { full_name: fullName.trim() },
    });
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

    // profiles.full_name est mis à jour automatiquement via trigger — sinon fallback :
    const { data: userData } = await supabaseBrowser.auth.getUser();
    if (userData.user) {
      await supabaseBrowser
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', userData.user.id);
    }

    setSaved(true);
    setSaving(false);
    router.refresh();
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form onSubmit={handleSave} className="mt-md space-y-md rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
      <Field label="Nom complet">
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          minLength={2}
          required
          className="w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </Field>

      <Field label="Téléphone">
        <div className="flex items-center rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-500 ring-1 ring-neutral-200">
          {userPhone || '—'}
        </div>
        <p className="mt-xs text-[10px] text-neutral-500">
          Verrouillé : c&apos;est ta clé de connexion.
        </p>
      </Field>

      <Field label="Email">
        <div className="flex items-center rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-500 ring-1 ring-neutral-200">
          {userEmail || '—'}
        </div>
        <p className="mt-xs text-[10px] text-neutral-500">
          Verrouillé pour la version actuelle.
        </p>
      </Field>

      {error && (
        <div className="rounded-md bg-error/10 p-md text-sm text-error">{error}</div>
      )}
      {saved && (
        <div className="rounded-md bg-success/10 p-md text-sm text-success">
          Modifications enregistrées
        </div>
      )}

      <button
        type="submit"
        disabled={!canSave}
        className="w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow disabled:opacity-40 disabled:shadow-none"
      >
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <div className="mt-xs">{children}</div>
    </label>
  );
}
