import { LiveDriversMap } from './LiveDriversMap';

// Carte en direct : tous les chauffeurs connectés, leur position et leur course en cours.
// Page réservée à l'équipe TamCar (layout admin) ; les données passent par des fonctions
// qui revérifient is_admin() côté base.

export const dynamic = 'force-dynamic';

export default function AdminLiveMapPage() {
  return (
    <div>
      <div className="mb-md flex flex-wrap items-baseline justify-between gap-sm">
        <h1 className="text-2xl font-extrabold text-neutral-900">Carte en direct</h1>
        <p className="text-sm text-neutral-600">
          Chauffeurs connectés, position mise à jour toutes les 5 secondes. Cliquez sur un chauffeur pour voir son profil et sa course.
        </p>
      </div>
      <LiveDriversMap />
    </div>
  );
}
