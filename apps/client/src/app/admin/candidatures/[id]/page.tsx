import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { STATUS_META, type DriverApplication } from '@/lib/driver-application';
import { approveApplication, rejectApplication } from './actions';

export default async function CandidatureDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from('driver_applications')
    .select('*')
    .eq('id', params.id)
    .single();
  if (error || !data) notFound();
  const app = data as DriverApplication;

  // Signed URLs pour les 3 documents (valide 1h)
  const [idCardSigned, licenseSigned, registrationSigned] = await Promise.all([
    supabase.storage.from('driver-docs').createSignedUrl(app.id_card_url, 3600),
    supabase.storage.from('driver-docs').createSignedUrl(app.driver_license_url, 3600),
    supabase.storage.from('driver-docs').createSignedUrl(app.vehicle_registration_url, 3600),
  ]);

  const meta = STATUS_META[app.status];
  const canModerate = app.status === 'submitted' || app.status === 'in_review';

  return (
    <div>
      <div className="mb-lg flex items-center justify-between">
        <div>
          <Link href="/admin/candidatures" className="text-sm text-primary-500 hover:underline">
            ← Toutes les candidatures
          </Link>
          <h1 className="mt-xs text-2xl font-extrabold text-neutral-900">
            {app.first_name} {app.last_name}
          </h1>
        </div>
        <span className={`inline-flex rounded-full px-md py-xs text-xs font-bold ${meta.color}`}>
          {meta.label}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
        <section className="rounded-xl bg-white p-lg shadow-sm">
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
            Identité
          </h2>
          <dl className="space-y-sm text-sm">
            <Row label="Nom complet" value={`${app.first_name} ${app.last_name}`} />
            <Row label="Téléphone" value={app.phone} />
            <Row label="Envoyée le" value={new Date(app.submitted_at).toLocaleString('fr-FR')} />
          </dl>
        </section>

        <section className="rounded-xl bg-white p-lg shadow-sm">
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
            Concessionnaire
          </h2>
          <dl className="space-y-sm text-sm">
            <Row label="Raison sociale" value={app.dealer_company_name} />
            <Row label="RCCM" value={app.dealer_rccm ?? '—'} />
          </dl>
        </section>

        <section className="rounded-xl bg-white p-lg shadow-sm md:col-span-2">
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
            Véhicule
          </h2>
          <dl className="grid grid-cols-2 gap-md text-sm md:grid-cols-4">
            <Row label="Plaque" value={app.vehicle_plate} />
            <Row label="Marque" value={app.vehicle_brand} />
            <Row label="Modèle" value={app.vehicle_model} />
            <Row label="Année" value={app.vehicle_year?.toString() ?? '—'} />
            <Row label="Couleur" value={app.vehicle_color ?? '—'} />
            <Row label="Places" value={app.vehicle_seats.toString()} />
            <Row label="Catégorie" value={`TamCar ${app.vehicle_category}`} />
          </dl>
        </section>

        <section className="rounded-xl bg-white p-lg shadow-sm md:col-span-2">
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
            Documents KYC
          </h2>
          <div className="grid grid-cols-1 gap-md md:grid-cols-3">
            <DocLink label="CNI" url={idCardSigned.data?.signedUrl} />
            <DocLink label="Permis" url={licenseSigned.data?.signedUrl} />
            <DocLink label="Carte grise" url={registrationSigned.data?.signedUrl} />
          </div>
        </section>
      </div>

      {app.status === 'rejected' && app.rejection_reason && (
        <section className="mt-lg rounded-xl border border-error/30 bg-error/5 p-lg">
          <h2 className="text-sm font-bold text-error">Refusée</h2>
          <p className="mt-xs text-sm text-neutral-900">{app.rejection_reason}</p>
        </section>
      )}

      {canModerate && (
        <section className="mt-xl grid grid-cols-1 gap-md md:grid-cols-2">
          <form action={approveApplication}>
            <input type="hidden" name="id" value={app.id} />
            <button
              type="submit"
              className="w-full rounded-xl bg-success py-md text-sm font-bold text-white shadow-md hover:brightness-110"
            >
              Approuver — créer driver + véhicule + concess.
            </button>
          </form>
          <form action={rejectApplication} className="rounded-xl border border-neutral-200 bg-white p-md">
            <input type="hidden" name="id" value={app.id} />
            <input
              type="text"
              name="reason"
              placeholder="Raison du refus (min 3 caractères)…"
              required
              minLength={3}
              className="w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200"
            />
            <button
              type="submit"
              className="mt-md w-full rounded-md bg-error py-sm text-sm font-bold text-white hover:brightness-110"
            >
              Refuser
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-md text-sm">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="text-right font-semibold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</dd>
    </div>
  );
}

function DocLink({ label, url }: { label: string; url: string | undefined }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-100 p-md text-center">
      <p className="text-xs font-bold text-neutral-900">{label}</p>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-xs inline-block text-xs font-semibold text-primary-500 underline">
          Ouvrir le document →
        </a>
      ) : (
        <p className="mt-xs text-[10px] text-error">Fichier introuvable</p>
      )}
    </div>
  );
}
