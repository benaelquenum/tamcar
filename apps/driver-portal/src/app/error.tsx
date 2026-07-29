'use client';

// Écran d'erreur : affiche le message réel au lieu de l'écran blanc
// générique Next.js — indispensable pour diagnostiquer sur téléphone.
export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-neutral-50 p-lg">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-lg shadow-md">
        <h1 className="text-lg font-extrabold text-neutral-900">
          Un problème est survenu
        </h1>
        <p className="mt-sm break-words rounded-md bg-error/10 p-md text-xs text-error">
          {error.message || 'Erreur inconnue'}
          {error.digest ? ` · réf ${error.digest}` : ''}
        </p>
        <div className="mt-lg flex gap-sm">
          <button
            type="button"
            onClick={reset}
            className="flex-1 rounded-lg bg-primary-600 py-md text-sm font-bold text-white"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="flex-1 rounded-lg border border-neutral-200 py-md text-center text-sm font-bold text-neutral-700"
          >
            Accueil
          </a>
        </div>
      </div>
    </main>
  );
}
