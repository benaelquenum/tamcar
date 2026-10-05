import { redirect } from 'next/navigation';
import { getCurrentProfile, getCurrentUser } from '@/lib/session';
import { signOutAction } from '@/app/connexion/actions';
import { ChangePassword } from './ChangePassword';

export const dynamic = 'force-dynamic';

export default async function EspaceComptePage() {
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);
  if (!user || !profile) redirect('/connexion');

  return (
    <div className="mx-auto max-w-md space-y-lg">
      <h1 className="text-2xl font-extrabold text-neutral-900">Mon compte</h1>

      <section className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Titulaire</p>
        <p className="mt-xs text-lg font-extrabold text-neutral-900">{profile.full_name}</p>
        <dl className="mt-md space-y-xs text-sm">
          <div className="flex justify-between gap-md">
            <dt className="text-neutral-500">Adresse e-mail</dt>
            <dd className="break-all text-right font-semibold text-neutral-900">{user.email}</dd>
          </div>
          {profile.phone && (
            <div className="flex justify-between gap-md">
              <dt className="text-neutral-500">Téléphone</dt>
              <dd className="font-semibold text-neutral-900">{profile.phone}</dd>
            </div>
          )}
        </dl>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Mot de passe</h2>
        <p className="mt-xs text-xs text-neutral-600">
          Le mot de passe que TamCar vous a remis est provisoire : remplacez-le dès votre première connexion.
        </p>
        <div className="mt-md">
          <ChangePassword />
        </div>
      </section>

      <form action={signOutAction}>
        <button
          type="submit"
          className="w-full rounded-xl border border-error/30 bg-white py-md text-sm font-bold text-error hover:bg-error/5"
        >
          Me déconnecter
        </button>
      </form>
    </div>
  );
}
