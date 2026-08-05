'use client';

import { DownloadIcon } from '@/components/Icon';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-sm rounded-lg bg-primary-500 px-lg py-sm text-sm font-bold text-white shadow-md transition hover:brightness-110"
    >
      <DownloadIcon className="h-4 w-4" />
      Imprimer / PDF
    </button>
  );
}
