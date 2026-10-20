'use client';

/** Imprime (ou enregistre en PDF) le relevé : la navigation de l'espace est masquée à l'impression. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-bold text-neutral-800 hover:border-primary-500 hover:text-primary-700 print:hidden"
    >
      Imprimer / enregistrer en PDF
    </button>
  );
}
