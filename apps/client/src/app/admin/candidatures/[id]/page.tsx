import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { Avatar } from '@/components/Avatar';
import {
  APPLICATION_TYPE_META,
  REQUIRED_DOCS,
  STATUS_META,
  formatSlotFull,
  type DriverAppointment,
} from '@/lib/appointment';
import { markNoShow, rejectAppointment } from './actions';
import { ApproveDriverForm } from './ApproveDriverForm';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';

export default async function AppointmentDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('driver_appointments')
    .select('*')
    .eq('id', params.id)
    .single();
  if (error || !data) notFound();
  const app = data as DriverAppointment;

  // Récupérer avatar candidat si déjà uploadé
  let avatarUrl: string | null = null;
  if (app.profile_id) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', app.profile_id)
      .single();
    avatarUrl = prof?.avatar_url ?? null;
  }

  const meta = STATUS_META[app.status];
  const typeMeta = APPLICATION_TYPE_META[app.application_type];
  const canModerate = app.status === 'scheduled' || app.status === 'confirmed';
  const fullName = `${app.first_name} ${app.last_name}`;

  return (
    <div>
      <div className="mb-lg flex items-center justify-between gap-md">
        <div className="flex items-center gap-md">
          <Avatar src={avatarUrl} name={fullName} size={56} />
          <div>
            <Link href="/admin/candidatures" className="text-sm text-primary-500 hover:underline">
              ← Tous les rendez-vous
            </Link>
            <h1 className="mt-xs text-2xl font-extrabold text-neutral-900">{fullName}</h1>
            <p
              className="text-sm text-neutral-600"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {app.visitor_number} · {typeMeta.label}
            </p>
          </div>
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
            {app.email && <Row label="Email" value={app.email} />}
            <Row label="Formule demandée" value={typeMeta.label} />
            <Row label="Prise le" value={new Date(app.created_at).toLocaleString('fr-FR')} />
          </dl>
        </section>

        <section className="rounded-xl bg-white p-lg shadow-sm">
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
            Créneau
          </h2>
          <dl className="space-y-sm text-sm">
            <Row label="Date et heure" value={formatSlotFull(app.slot_at)} />
            <Row label="Adresse" value={app.location} />
          </dl>
        </section>

        <section className="rounded-xl bg-white p-lg shadow-sm md:col-span-2">
          <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
            Documents attendus au RDV
          </h2>
          <ul className="grid grid-cols-1 gap-xs text-sm text-neutral-900 md:grid-cols-2">
            {REQUIRED_DOCS.map((doc) => (
              <li key={doc}>• {doc}</li>
            ))}
          </ul>
          <p className="mt-md text-[11px] text-neutral-500">
            Vérifie physiquement chaque pièce à l&apos;accueil. Les documents ne sont pas versés en
            ligne — allègement volontaire.
          </p>
        </section>

        {app.notes && (
          <section className="rounded-xl bg-white p-lg shadow-sm md:col-span-2">
            <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">
              Notes d&apos;entretien
            </h2>
            <p className="whitespace-pre-line text-sm text-neutral-900">{app.notes}</p>
          </section>
        )}
      </div>

      {app.status === 'completed_rejected' && app.rejection_reason && (
        <section className="mt-lg rounded-xl border border-error/30 bg-error/5 p-lg">
          <h2 className="text-sm font-bold text-error">Refusé</h2>
          <p className="mt-xs text-sm text-neutral-900">{app.rejection_reason}</p>
        </section>
      )}

      {canModerate && (
        <>
          <ApproveDriverForm app={app} />

          <section className="mt-lg grid grid-cols-1 gap-md md:grid-cols-2">
            <form action={rejectAppointment} className="rounded-xl border border-neutral-200 bg-white p-md">
              <input type="hidden" name="id" value={app.id} />
              <p className="mb-xs text-xs font-bold uppercase tracking-wider text-neutral-500">
                Refuser
              </p>
              <input
                type="text"
                name="reason"
                placeholder="Raison du refus (min 3 caractères)…"
                required
                minLength={3}
                className="w-full rounded-md bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200"
              />
              <ConfirmSubmit
                message="Refuser définitivement cette candidature après entretien ?"
                className="mt-md w-full rounded-md bg-error py-sm text-sm font-bold text-white hover:brightness-110"
              >
                Refuser après entretien
              </ConfirmSubmit>
            </form>

            <form action={markNoShow} className="rounded-xl border border-neutral-200 bg-white p-md">
              <input type="hidden" name="id" value={app.id} />
              <p className="mb-xs text-xs font-bold uppercase tracking-wider text-neutral-500">
                Absent au RDV
              </p>
              <p className="text-xs text-neutral-600">
                Le candidat n&apos;est pas venu. Le créneau reste bloqué pour l&apos;historique mais
                pas ré-utilisable.
              </p>
              <ConfirmSubmit
                message="Marquer ce candidat comme absent au RDV (no-show) ?"
                className="mt-md w-full rounded-md bg-neutral-800 py-sm text-sm font-bold text-white hover:brightness-110"
              >
                Marquer no-show
              </ConfirmSubmit>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-md text-sm">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="text-right font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}
