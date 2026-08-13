'use client';

import { useState } from 'react';
import { LifeBuoyIcon, PhoneIcon, WhatsAppIcon } from './Icon';
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from '@/lib/support';

/**
 * Contact direct du support TamCar pendant une course.
 *
 * Remplace l'ancien bouton SOS : un disque rouge de 56 px fixé en bas à
 * droite, qui recouvrait le contenu de la feuille. Ici, une pastille
 * discrète dans l'en-tête, qui ouvre le choix entre appel vocal et
 * WhatsApp — deux gestes que l'on sait faire sous stress, contrairement à
 * un formulaire.
 */
export function SupportCallButton({ rideId }: { rideId?: string }) {
  const [open, setOpen] = useState(false);

  const num = SUPPORT_PHONE.replace(/^\+/, '');
  const texte = rideId
    ? `Bonjour, j'ai besoin d'aide sur ma course en cours (réf. ${rideId.slice(0, 8)}).`
    : "Bonjour, j'ai besoin d'aide sur TamCar.";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Contacter TamCar"
        className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white text-error shadow-lg ring-1 ring-neutral-200"
      >
        <LifeBuoyIcon className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/70 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-lg text-center">
              <div className="mx-auto mb-md grid h-14 w-14 place-items-center rounded-full bg-error/15 text-error">
                <LifeBuoyIcon className="h-7 w-7" />
              </div>
              <h2 className="text-lg font-extrabold text-neutral-900">Contacter TamCar</h2>
              <p className="mt-xs text-xs text-neutral-600">
                Une équipe répond au {SUPPORT_PHONE_DISPLAY}.
              </p>
            </div>

            <a
              href={`tel:${SUPPORT_PHONE}`}
              className="flex w-full items-center justify-center gap-sm rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow"
            >
              <PhoneIcon className="h-4 w-4" />
              Appel vocal
            </a>

            <a
              href={`https://wa.me/${num}?text=${encodeURIComponent(texte)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-sm flex w-full items-center justify-center gap-sm rounded-xl bg-[#25D366] py-md text-sm font-bold text-white shadow-md"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Appel WhatsApp
            </a>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-md w-full rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-600"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
