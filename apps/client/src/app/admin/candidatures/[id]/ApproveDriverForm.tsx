'use client';

import { useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { UserIcon } from '@/components/Icon';
import { APPLICATION_TYPE_META, type DriverAppointment } from '@/lib/appointment';
import { approveAppointment } from './actions';

type Props = {
  app: DriverAppointment;
};

export function ApproveDriverForm({ app }: Props) {
  const isProprietaire = app.application_type === 'proprietaire';
  const typeMeta = APPLICATION_TYPE_META[app.application_type];
  const defaultDealerName = isProprietaire
    ? `${app.first_name} ${app.last_name} (propriétaire)`
    : '';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Photo trop lourde (max 5 Mo).');
      return;
    }
    setError(null);
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!app.profile_id) {
      setError('Candidat sans profil authentifié — impossible d\'approuver.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${app.profile_id}.${ext}`;
        const { error: uploadErr } = await supabaseBrowser.storage
          .from('driver-photos')
          .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
        if (uploadErr) throw new Error(`Upload photo : ${uploadErr.message}`);

        const { data: pub } = supabaseBrowser.storage
          .from('driver-photos')
          .getPublicUrl(path);
        photoUrl = pub.publicUrl;
      }

      const fd = new FormData(e.currentTarget);
      if (photoUrl) fd.set('photo_url', photoUrl);
      await approveAppointment(fd);
      // approveAppointment redirige — pas besoin de setSubmitting(false).
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-xl rounded-xl border-2 border-success/40 bg-white p-lg shadow-md">
      <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-success">
        Approuver — création du driver
      </h2>
      <p className="mb-md text-xs text-neutral-600">
        Formule : <strong>{typeMeta.label}</strong>. Renseigne la photo, le véhicule et le
        concessionnaire ; le driver + wallets sont créés automatiquement.
      </p>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-md md:grid-cols-2">
        <input type="hidden" name="id" value={app.id} />

        {/* Photo chauffeur */}
        <FieldSet legend="Photo du chauffeur" wide>
          <div className="flex items-center gap-md">
            <div className="grid h-24 w-24 flex-none place-items-center overflow-hidden rounded-full bg-neutral-100 ring-2 ring-neutral-200">
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreview}
                  alt="Aperçu"
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserIcon className="h-10 w-10 text-neutral-400" />
              )}
            </div>
            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md bg-primary-500 px-md py-sm text-sm font-bold text-white shadow-md hover:brightness-110"
              >
                {photoFile ? 'Changer la photo' : 'Choisir une photo'}
              </button>
              <p className="mt-xs text-[10px] text-neutral-500">
                JPG, PNG ou WebP · max 5 Mo · visible par les clients pendant la course.
              </p>
              {photoFile && (
                <p className="mt-xs text-[10px] font-semibold text-success">
                  {photoFile.name}
                </p>
              )}
            </div>
          </div>
        </FieldSet>

        <FieldSet legend="Concessionnaire / Propriétaire" wide>
          <Input
            name="dealer_company_name"
            label="Raison sociale"
            defaultValue={defaultDealerName}
            required
          />
          <Input name="dealer_rccm" label="RCCM (optionnel)" />
        </FieldSet>

        <FieldSet legend="Véhicule" wide>
          <div className="grid grid-cols-2 gap-md">
            <Input name="vehicle_plate" label="Plaque" required />
            <Input name="vehicle_brand" label="Marque" required placeholder="Toyota" />
            <Input name="vehicle_model" label="Modèle" required placeholder="Corolla" />
            <Input
              name="vehicle_year"
              label="Année"
              type="number"
              defaultValue={String(new Date().getFullYear())}
            />
            <Input name="vehicle_color" label="Couleur" placeholder="Blanc" />
            <Input name="vehicle_seats" label="Places" type="number" defaultValue="5" required />
          </div>
          <label className="mt-md block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Catégorie
            </span>
            <select
              name="vehicle_category"
              defaultValue="confort"
              className="mt-xs w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200"
            >
              <option value="essentiel">TamCar essentiel</option>
              <option value="confort">TamCar confort</option>
              <option value="premium">TamCar premium</option>
            </select>
          </label>
        </FieldSet>

        <FieldSet legend="Notes d'entretien (optionnel)" wide>
          <textarea
            name="notes"
            rows={3}
            placeholder="Observations, points d'attention…"
            className="w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200"
          />
        </FieldSet>

        {/* ADR — cession uniquement */}
        {!isProprietaire && (
          <FieldSet legend="Avance de Démarrage Remboursable (ADR) — cession uniquement" wide>
            <label className="flex items-start gap-md rounded-lg bg-warning/10 p-md">
              <input
                type="checkbox"
                name="adr_paid"
                defaultChecked
                className="mt-xs h-4 w-4 flex-none accent-primary-500"
              />
              <div>
                <p className="text-sm font-bold text-neutral-900">
                  ADR de 100 000 F versée par le concessionnaire
                </p>
                <p className="mt-xs text-[11px] text-neutral-600">
                  Le concessionnaire remet 100 000 F cash / Mobile Money à la signature.
                  Cette ADR sera automatiquement remboursée sur son wallet à M+12 via le split
                  du fonds rachat (30% année 1, 20% année 2).
                </p>
                <p className="mt-xs text-[11px] font-semibold text-warning">
                  Coche uniquement si le versement est effectif.
                </p>
              </div>
            </label>
          </FieldSet>
        )}

        {error && (
          <div className="rounded-md bg-error/10 p-md text-sm text-error md:col-span-2">
            {error}
          </div>
        )}

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-success py-md text-sm font-bold text-white shadow-md hover:brightness-110 disabled:opacity-50"
          >
            {submitting ? 'Création…' : 'Approuver et créer le driver'}
          </button>
        </div>
      </form>
    </section>
  );
}

function FieldSet({
  legend,
  children,
  wide,
}: {
  legend: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <fieldset className={`rounded-lg border border-neutral-200 p-md ${wide ? 'md:col-span-2' : ''}`}>
      <legend className="px-xs text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        {legend}
      </legend>
      <div className="space-y-md">{children}</div>
    </fieldset>
  );
}

function Input({
  name,
  label,
  required,
  type,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <input
        type={type ?? 'text'}
        name={name}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-xs w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </label>
  );
}
