import { FleetSimulator } from '@/components/espace/FleetSimulator';

export const metadata = { title: 'Simulateur', robots: { index: false } };

export default function SimulateurPage() {
  return (
    <>
      <h1 className="text-2xl font-extrabold text-neutral-900">Simulateur de gains</h1>
      <p className="mt-xs max-w-2xl text-sm text-neutral-600">
        Estimez ce que rapportent un ou plusieurs véhicules : choisissez les catégories, le rythme du chauffeur, et ajoutez votre coût de revient pour
        connaître votre rendement.
      </p>
      <div className="mt-lg">
        <FleetSimulator />
      </div>
    </>
  );
}
