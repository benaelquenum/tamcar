'use client';

export function PrintTrigger() {
  // Placeholder : composant client marqueur — permet à la page facture
  // (Server Component) d'être hydratée avec des îlots interactifs (PrintButton).
  return null;
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-primary-500 px-lg py-md text-sm font-bold text-white shadow-md hover:brightness-110"
    >
      🖨️ Imprimer / Enregistrer en PDF
    </button>
  );
}
