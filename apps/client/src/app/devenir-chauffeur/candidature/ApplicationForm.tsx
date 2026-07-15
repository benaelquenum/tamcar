'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

type Props = {
  userId: string;
  initialFirstName: string;
  initialLastName: string;
  initialPhone: string;
};

const CATEGORIES = [
  { value: 'essentiel', label: 'TamCar Essentiel', desc: 'Voiture propre 5-15 ans' },
  { value: 'confort', label: 'TamCar Confort', desc: 'Voiture récente < 5 ans, clim incluse' },
  { value: 'premium', label: 'TamCar Premium', desc: 'Camry / Hilux / Land Cruiser' },
] as const;

export function ApplicationForm({ userId, initialFirstName, initialLastName, initialPhone }: Props) {
  const router = useRouter();

  // Identité
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [phone, setPhone] = useState(initialPhone);

  // Docs personnels
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);

  // Concessionnaire
  const [dealerName, setDealerName] = useState('');
  const [rccm, setRccm] = useState('');

  // Véhicule
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [color, setColor] = useState('');
  const [seats, setSeats] = useState(4);
  const [category, setCategory] = useState<'essentiel' | 'confort' | 'premium'>('essentiel');
  const [registrationFile, setRegistrationFile] = useState<File | null>(null);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'idle' | 'uploading' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function uploadFile(file: File, docType: string): Promise<string> {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${userId}/${docType}_${Date.now()}.${ext}`;
    const { error: err } = await supabaseBrowser.storage
      .from('driver-docs')
      .upload(path, file, { upsert: false, contentType: file.type });
    if (err) throw new Error(`Upload ${docType}: ${err.message}`);
    return path;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!idCardFile || !licenseFile || !registrationFile) {
      setError('Merci de joindre les 3 documents requis.');
      return;
    }

    setSubmitting(true);
    try {
      setStep('uploading');
      const [idCardPath, licensePath, registrationPath] = await Promise.all([
        uploadFile(idCardFile, 'id_card'),
        uploadFile(licenseFile, 'license'),
        uploadFile(registrationFile, 'vehicle_registration'),
      ]);

      setStep('saving');
      const { error: rpcErr } = await supabaseBrowser.rpc('submit_driver_application', {
        p_first_name: firstName,
        p_last_name: lastName,
        p_phone: phone,
        p_id_card_url: idCardPath,
        p_driver_license_url: licensePath,
        p_dealer_company_name: dealerName || `${firstName} ${lastName} (auto)`,
        p_dealer_rccm: rccm || null,
        p_vehicle_plate: plate,
        p_vehicle_brand: brand,
        p_vehicle_model: model,
        p_vehicle_year: year || null,
        p_vehicle_color: color || null,
        p_vehicle_seats: seats,
        p_vehicle_category: category,
        p_vehicle_registration_url: registrationPath,
      });

      if (rpcErr) throw new Error(rpcErr.message);

      router.push('/devenir-chauffeur/statut');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setSubmitting(false);
      setStep('idle');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-lg space-y-xl">
      <Section title="1. Toi">
        <div className="grid grid-cols-2 gap-md">
          <Input label="Prénom" value={firstName} onChange={setFirstName} required />
          <Input label="Nom" value={lastName} onChange={setLastName} required />
        </div>
        <Input label="Téléphone" value={phone} onChange={setPhone} required placeholder="+2290167591817" />
      </Section>

      <Section title="2. Tes documents">
        <FileField
          label="Carte nationale d'identité"
          hint="Photo lisible recto+verso (jpg, png, ou pdf)"
          file={idCardFile}
          onChange={setIdCardFile}
        />
        <FileField
          label="Permis de conduire"
          hint="Photo ou scan"
          file={licenseFile}
          onChange={setLicenseFile}
        />
      </Section>

      <Section title="3. Concessionnaire">
        <p className="mb-md text-xs text-neutral-600">
          Si tu es propriétaire de ta voiture, mets ton propre nom ou "Autoentrepreneur".
        </p>
        <Input label="Raison sociale" value={dealerName} onChange={setDealerName} required placeholder="Ex: Ouando Motors SARL" />
        <Input label="RCCM (optionnel)" value={rccm} onChange={setRccm} placeholder="RCCM/COT/2025/A/00001" />
      </Section>

      <Section title="4. Ton véhicule">
        <div className="grid grid-cols-2 gap-md">
          <Input label="Plaque" value={plate} onChange={(v) => setPlate(v.toUpperCase())} required placeholder="RB 1234 AB" />
          <SelectField
            label="Catégorie"
            value={category}
            onChange={(v) => setCategory(v as typeof category)}
            options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          />
        </div>
        <p className="mt-xs text-[10px] text-neutral-500">
          {CATEGORIES.find((c) => c.value === category)?.desc}
        </p>
        <div className="mt-md grid grid-cols-2 gap-md">
          <Input label="Marque" value={brand} onChange={setBrand} required placeholder="Toyota" />
          <Input label="Modèle" value={model} onChange={setModel} required placeholder="Corolla" />
        </div>
        <div className="mt-md grid grid-cols-3 gap-md">
          <NumberInput label="Année" value={year} onChange={setYear} min={1990} max={2030} />
          <Input label="Couleur" value={color} onChange={setColor} placeholder="Blanc" />
          <NumberInput label="Places" value={seats} onChange={(v) => typeof v === 'number' && setSeats(v)} min={2} max={9} />
        </div>
        <FileField
          label="Carte grise"
          hint="Photo ou scan de la carte grise"
          file={registrationFile}
          onChange={setRegistrationFile}
        />
      </Section>

      {error && (
        <div className="rounded-md bg-error/10 p-md text-sm text-error">{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting
          ? step === 'uploading' ? 'Envoi des documents…' : 'Enregistrement de la candidature…'
          : 'Envoyer ma candidature'}
      </button>

      <p className="text-center text-[11px] text-neutral-500">
        En envoyant, tu autorises TamCar à traiter tes documents pour vérification KYC.
      </p>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
      <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">{title}</h2>
      <div className="space-y-md">{children}</div>
    </section>
  );
}

function Input({
  label, value, onChange, required, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-xs block text-xs font-semibold text-neutral-900">{label}{required && ' *'}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </label>
  );
}

function NumberInput({
  label, value, onChange, min, max,
}: {
  label: string; value: number | ''; onChange: (v: number | '') => void; min?: number; max?: number;
}) {
  return (
    <label className="block">
      <span className="mb-xs block text-xs font-semibold text-neutral-900">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        min={min}
        max={max}
        className="w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      />
    </label>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-xs block text-xs font-semibold text-neutral-900">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function FileField({
  label, hint, file, onChange,
}: {
  label: string; hint?: string; file: File | null; onChange: (f: File | null) => void;
}) {
  return (
    <label className="block">
      <span className="mb-xs block text-xs font-semibold text-neutral-900">{label} *</span>
      <div className="rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-100 p-md">
        {file ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-neutral-900">{file.name}</p>
              <p className="text-[10px] text-neutral-600">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-error underline"
            >
              Changer
            </button>
          </div>
        ) : (
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
            required
            className="w-full text-xs text-neutral-900"
          />
        )}
      </div>
      {hint && <p className="mt-xs text-[10px] text-neutral-500">{hint}</p>}
    </label>
  );
}
