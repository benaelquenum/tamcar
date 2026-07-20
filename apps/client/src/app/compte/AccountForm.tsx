'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { CheckIcon } from '@/components/Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';

type Props = {
  profileId: string;
  initialFullName: string;
  initialAvatarUrl: string | null;
  userEmail: string;
  userPhone: string;
};

const MAX_MB = 5;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

export function AccountForm({
  profileId,
  initialFullName,
  initialAvatarUrl,
  userEmail,
  userPhone,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(initialFullName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const nameChanged = fullName.trim().length >= 2 && fullName.trim() !== initialFullName;
  const canSave = nameChanged && !saving;

  async function handleUpload(file: File) {
    setError(null);
    if (!ALLOWED_MIME.includes(file.type)) {
      setError('Format non supporté (JPEG, PNG ou WebP uniquement).');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Photo trop lourde (max ${MAX_MB} Mo).`);
      return;
    }
    setUploading(true);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${profileId}.${ext}`;

    const { error: uploadErr } = await supabaseBrowser.storage
      .from('client-avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadErr) {
      setError(uploadErr.message);
      setUploading(false);
      return;
    }

    const { data } = supabaseBrowser.storage.from('client-avatars').getPublicUrl(path);
    // cache-buster pour forcer le rafraîchissement immédiat
    const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

    const { error: updateErr } = await supabaseBrowser
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', profileId);
    if (updateErr) {
      setError(updateErr.message);
      setUploading(false);
      return;
    }

    setAvatarUrl(publicUrl);
    setSaved(true);
    setUploading(false);
    router.refresh();
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleRemove() {
    if (!avatarUrl) return;
    setError(null);
    setUploading(true);
    // On tente les 3 extensions possibles — la RLS bloque celles qui ne sont
    // pas à nous, mais elles n'existent probablement pas de toute façon.
    await Promise.all(
      ['jpg', 'png', 'webp'].map((ext) =>
        supabaseBrowser.storage.from('client-avatars').remove([`${profileId}.${ext}`]),
      ),
    );
    const { error: updateErr } = await supabaseBrowser
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', profileId);
    if (updateErr) {
      setError(updateErr.message);
      setUploading(false);
      return;
    }
    setAvatarUrl(null);
    setUploading(false);
    router.refresh();
  }

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

    await supabaseBrowser
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', profileId);

    setSaved(true);
    setSaving(false);
    router.refresh();
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form
      onSubmit={handleSave}
      className="mt-md space-y-md rounded-xl border border-neutral-200 bg-white p-lg shadow-sm"
    >
      {/* Photo de profil */}
      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
          Photo de profil
        </span>
        <p className="mt-xs text-[11px] text-neutral-500">
          Visible par ton chauffeur pendant la course.
        </p>
        <div className="mt-md flex items-center gap-md">
          <Avatar src={avatarUrl} name={fullName} size={72} />
          <div className="flex-1 space-y-xs">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-lg bg-primary-500 px-md py-sm text-xs font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
            >
              {uploading ? 'Envoi…' : avatarUrl ? 'Changer la photo' : 'Ajouter une photo'}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={uploading}
                className="w-full rounded-lg border border-neutral-200 bg-white px-md py-sm text-xs font-semibold text-neutral-600 hover:border-error/40 hover:text-error"
              >
                Retirer la photo
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="h-px bg-neutral-100" />

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
        <div className="inline-flex items-center gap-xs rounded-md bg-primary-50 p-md text-sm font-semibold text-primary-700">
          Enregistré
          <CheckIcon className="h-4 w-4" strokeWidth={3} />
        </div>
      )}

      <button
        type="submit"
        disabled={!canSave}
        className="w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow disabled:opacity-40 disabled:shadow-none"
      >
        {saving ? 'Enregistrement…' : 'Enregistrer le nom'}
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
