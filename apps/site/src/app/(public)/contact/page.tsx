import type { Metadata } from 'next';
import Link from 'next/link';
import { ADDRESS, CONTACT_EMAIL } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contacter TamCar : partenaires véhicule, chauffeurs, presse.',
};

export default function ContactPage() {
  return (
    <section className="bg-white py-4xl">
      <div className="mx-auto max-w-3xl px-lg">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600">Contact</p>
        <h1 className="mt-sm text-4xl font-extrabold leading-tight text-neutral-900 sm:text-5xl">Parlons-en.</h1>
        <p className="mt-lg text-lg text-neutral-600">
          Un véhicule à confier, une question sur le partenariat, un rendez-vous : écrivez-nous, nous répondons avec les chiffres de votre cas.
        </p>

        <div className="mt-2xl grid gap-lg sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-xl shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Par e-mail</p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="mt-sm block break-all text-lg font-extrabold text-primary-700 hover:underline">
              {CONTACT_EMAIL}
            </a>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-xl shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Nos locaux</p>
            <address className="mt-sm text-lg font-bold not-italic text-neutral-900">{ADDRESS}</address>
          </div>
        </div>

        <p className="mt-2xl text-base text-neutral-600">
          Vous êtes déjà partenaire ?{' '}
          <Link href="/connexion" className="font-bold text-primary-700 underline underline-offset-4">
            Accédez à votre espace
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
