import { CheckIcon } from '@/components/Icon';
import { requiredDocs, TAMCAR_RDV_ADDRESS, type DriverApplicationType } from '@/lib/appointment';

/**
 * Pièces à apporter au rendez-vous, selon la formule choisie : la formule Cession n'a pas besoin des
 * papiers du véhicule (TamCar le fournit), la formule Propriétaire oui. Sans formule choisie, on affiche
 * les pièces communes et on annonce celles qui s'y ajoutent.
 */
export function DocsChecklist({
  type,
  title = 'À apporter au rendez-vous',
  withAddress = false,
}: {
  type: DriverApplicationType | null | undefined;
  title?: string;
  withAddress?: boolean;
}) {
  const docs = requiredDocs(type);
  const extra = type ? [] : requiredDocs('proprietaire').filter((d) => !docs.includes(d));

  return (
    <section className="rounded-xl border border-primary-100 bg-primary-50 p-lg">
      <h2 className="text-xs font-bold uppercase tracking-wider text-primary-700">{title}</h2>
      <p className="mt-xs text-[11px] text-neutral-600">
        Apportez les originaux : chaque pièce est vérifiée sur place.
      </p>
      <ul className="mt-md space-y-xs text-sm text-neutral-900">
        {docs.map((d) => (
          <li key={d} className="flex items-start gap-xs">
            <CheckIcon className="mt-0.5 h-4 w-4 flex-none text-primary-500" strokeWidth={3} />
            <span>{d}</span>
          </li>
        ))}
      </ul>
      {extra.length > 0 && (
        <p className="mt-sm text-xs text-neutral-700">
          <strong>Formule Propriétaire, en plus :</strong> {extra.join(', ').replace(/^./, (c) => c.toLowerCase())}.
        </p>
      )}
      <p className="mt-sm text-xs text-neutral-700">
        <strong>Votre photo d’identité</strong> est prise sur place par TamCar : rien à préparer.
      </p>
      {withAddress && (
        <div className="mt-md rounded-lg bg-white p-md">
          <p className="text-[10px] font-bold uppercase text-primary-700">Adresse TamCar</p>
          <p className="mt-xs text-sm font-semibold text-neutral-900">{TAMCAR_RDV_ADDRESS}</p>
        </div>
      )}
    </section>
  );
}
