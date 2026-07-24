import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { PrintButton } from './PrintTrigger';

type RideDetail = {
  id: string;
  client_id: string;
  driver_id: string | null;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  distance_km: number | null;
  duration_min: number | null;
  price_total_fcfa: number;
  requested_at: string;
  started_at: string | null;
  ended_at: string | null;
  driver_full_name: string | null;
  vehicle_plate: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  requested_category: string | null;
  payment_method: string | null;
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CAT_LABEL: Record<string, string> = {
  moto: 'Moto',
  tricycle: 'Tricycle',
  essentiel: 'Essentiel',
  confort: 'Confort',
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Espèces',
  mobile_money_mtn: 'MTN Mobile Money',
  mobile_money_moov: 'Moov Money',
  tamcar_credit: 'TamCar Crédit',
};

export default async function FacturePage({ params }: { params: { rideId: string } }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login?next=/facture/' + params.rideId);

  const supabase = createServerSupabase();
  const { data: rows, error } = await supabase.rpc('ride_with_driver_details', {
    ride_id: params.rideId,
  });
  if (error || !Array.isArray(rows) || rows.length === 0) notFound();

  const ride = rows[0] as RideDetail;
  if (ride.client_id !== profile.id) notFound();
  if (ride.status !== 'completed') {
    // Facture uniquement pour les courses terminées
    notFound();
  }

  const invoiceNumber = ride.id.slice(0, 8).toUpperCase();
  const totalHT = ride.price_total_fcfa;

  return (
    <main className="min-h-dvh bg-neutral-100 p-lg print:bg-white print:p-0">

      <div className="mx-auto max-w-3xl bg-white p-2xl shadow-lg print:shadow-none print:p-0">
        {/* En-tête */}
        <header className="flex items-start justify-between border-b-2 border-primary-500 pb-lg">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="TamCar" style={{ height: 60, width: 'auto' }} />
            <p className="mt-md text-xs text-neutral-600">
              Tam Logistics SARL (en cours de constitution)<br />
              Cotonou, Bénin<br />
              contact@tamcar.app
            </p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-extrabold text-neutral-900">FACTURE</h1>
            <p className="mt-xs text-sm text-neutral-600">
              N° <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{invoiceNumber}</strong>
            </p>
            <p className="text-xs text-neutral-500">
              Émise le {fmtDate(ride.ended_at)}
            </p>
          </div>
        </header>

        {/* Client */}
        <section className="mt-xl grid grid-cols-2 gap-xl">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Facturé à
            </p>
            <p className="mt-xs text-base font-bold text-neutral-900">{profile.full_name}</p>
            <p className="text-xs text-neutral-600">{profile.phone}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Chauffeur
            </p>
            <p className="mt-xs text-base font-bold text-neutral-900">
              {ride.driver_full_name ?? '—'}
            </p>
            <p className="text-xs text-neutral-600">
              {[ride.vehicle_brand, ride.vehicle_model].filter(Boolean).join(' ')}
              {ride.vehicle_plate && ` · ${ride.vehicle_plate}`}
            </p>
          </div>
        </section>

        {/* Trajet */}
        <section className="mt-xl">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Trajet
          </p>
          <div className="mt-sm rounded-lg border border-neutral-200 p-md">
            <div className="flex items-start gap-sm">
              <span className="mt-1 grid h-4 w-4 flex-none place-items-center rounded-full bg-primary-500 text-[8px] font-bold text-white">A</span>
              <p className="flex-1 text-sm text-neutral-900">{ride.pickup_address}</p>
              <p className="text-[11px] text-neutral-500">{fmtDate(ride.started_at ?? ride.requested_at)}</p>
            </div>
            <div className="ml-2 my-xs h-4 border-l-2 border-dashed border-neutral-300" />
            <div className="flex items-start gap-sm">
              <span className="mt-1 grid h-4 w-4 flex-none place-items-center rounded-full bg-violet-500 text-[8px] font-bold text-white">B</span>
              <p className="flex-1 text-sm text-neutral-900">{ride.dropoff_address}</p>
              <p className="text-[11px] text-neutral-500">{fmtDate(ride.ended_at)}</p>
            </div>
          </div>
        </section>

        {/* Détails */}
        <section className="mt-xl">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="py-sm">Prestation</th>
                <th className="py-sm text-right">Distance</th>
                <th className="py-sm text-right">Durée</th>
                <th className="py-sm text-right">Prix</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-100">
                <td className="py-md text-neutral-900">
                  Course VTC {CAT_LABEL[ride.requested_category ?? ''] ?? ''}
                  <p className="text-[11px] text-neutral-500">Prix fixe garanti — aucun surge</p>
                </td>
                <td className="py-md text-right text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {ride.distance_km?.toFixed(1) ?? '—'} km
                </td>
                <td className="py-md text-right text-neutral-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {ride.duration_min ?? '—'} min
                </td>
                <td className="py-md text-right font-bold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(totalHT)} F
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Total */}
        <section className="mt-lg flex justify-end">
          <div className="w-64 rounded-lg bg-neutral-100 p-md">
            <div className="flex items-baseline justify-between border-b border-neutral-200 pb-sm">
              <span className="text-sm text-neutral-700">Sous-total</span>
              <span className="text-sm font-semibold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(totalHT)} FCFA
              </span>
            </div>
            <div className="mt-sm flex items-baseline justify-between">
              <span className="text-base font-bold text-neutral-900">Total à payer</span>
              <span className="text-xl font-extrabold text-primary-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(totalHT)} FCFA
              </span>
            </div>
            <p className="mt-xs text-[10px] text-neutral-500">
              Payé par {PAYMENT_LABEL[ride.payment_method ?? 'cash'] ?? ride.payment_method}
            </p>
          </div>
        </section>

        {/* Mention légale */}
        <footer className="mt-2xl border-t border-neutral-200 pt-md">
          <p className="text-[10px] text-neutral-500">
            TamCar (Tam Logistics SARL, en cours de constitution) — VTC au Bénin.
            Prix fixes garantis, sans surge. Cette facture atteste d&apos;une prestation
            de transport effectivement réalisée. Transport de personnes non soumis à la
            TVA (art. 225 CGI Bénin, sauf option).
          </p>
          <p className="mt-xs text-[10px] text-neutral-400">
            Pour toute réclamation : contact@tamcar.app — Ref : {invoiceNumber}
          </p>
        </footer>

        {/* Bouton imprimer (masqué à l'impression) */}
        <div className="mt-xl flex justify-center gap-md print:hidden">
          <PrintButton />
          <a
            href="/history"
            className="rounded-lg bg-neutral-200 px-lg py-md text-sm font-bold text-neutral-800 hover:bg-neutral-300"
          >
            Retour
          </a>
        </div>
      </div>
    </main>
  );
}
