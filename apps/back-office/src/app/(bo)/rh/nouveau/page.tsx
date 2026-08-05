import Link from 'next/link';
import { ChevronLeftIcon } from '@/components/Icon';
import { NewEmployeeForm } from './NewEmployeeForm';

export const dynamic = 'force-dynamic';

export default function NouvelEmployePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/rh"
        className="flex w-fit items-center gap-xs text-sm font-semibold text-neutral-500 hover:text-neutral-800"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Personnel
      </Link>

      <h1 className="mt-lg text-2xl font-extrabold text-neutral-900">
        Nouvelle embauche
      </h1>
      <p className="mt-xs text-sm text-neutral-600">
        Le matricule (EMP-…) est attribué automatiquement en base. Pensez à
        déclarer le salarié à la CNSS dans les huit jours suivant l&apos;embauche.
      </p>

      <NewEmployeeForm />
    </div>
  );
}
