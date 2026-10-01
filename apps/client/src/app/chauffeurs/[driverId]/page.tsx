import { redirect } from 'next/navigation';

/**
 * La demande à un chauffeur n'a plus son propre écran : c'est une commande
 * (trajet → confirmation) en mode direct, qui débouche sur la page de
 * recherche d'une vraie course. Cette route ne garde que les anciens liens
 * (notifications, favoris du navigateur).
 */
export default function RequestDriverRedirect({ params }: { params: { driverId: string } }) {
  redirect(`/commande?driver=${encodeURIComponent(params.driverId)}`);
}
