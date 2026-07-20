'use client';

import { PrinterIcon } from '@/components/Icon';

export function PrintTrigger() {
  return null;
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-sm rounded-lg bg-primary-500 px-lg py-md text-sm font-bold text-white shadow-md hover:brightness-110"
    >
      <PrinterIcon className="h-4 w-4" />
      Imprimer / Enregistrer en PDF
    </button>
  );
}
