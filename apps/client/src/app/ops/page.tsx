import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * L'espace responsable opérations est désormais dans TamCar Pro (l'application chauffeur) :
 * le responsable est aussi chauffeur, et son portefeuille y est crédité au fil des courses.
 */
export default function OpsMovedPage() {
  const driverUrl = process.env.NEXT_PUBLIC_DRIVER_URL || 'https://tamcar-driver-portal.vercel.app';
  redirect(`${driverUrl.replace(/\/$/, '')}/ops`);
}
