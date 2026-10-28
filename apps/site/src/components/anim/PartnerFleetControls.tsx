'use client';

import { useEffect, useRef, useState } from 'react';
import { useJourneyFrame, useJourneyRedraw } from './JourneyShell';
import { FLEET_MAX, fleetStore } from './partner-fleet';
import { PARTNER_STEPS, stepWin } from './journey-shared';

/**
 * « Ma flotte : N véhicules » avec « − » et « + » : visible seulement pendant le dernier chapitre de la route des
 * partenaires. Le nombre de véhicules affichés sur la scène 3D suit. Aucun chiffre de rémunération : on ne compte que
 * des véhicules.
 */
export function PartnerFleetControls() {
  const ref = useRef<HTMLDivElement>(null);
  const redraw = useJourneyRedraw();
  const [n, setN] = useState(fleetStore.shown);

  useEffect(() => {
    setN(fleetStore.shown);
    return fleetStore.subscribe(() => setN(fleetStore.shown));
  }, []);

  useJourneyFrame((p) => {
    const el = ref.current;
    if (!el) return;
    const v = stepWin(p, PARTNER_STEPS.length - 1, PARTNER_STEPS).v;
    el.style.opacity = String(v);
    el.style.visibility = v > 0.5 ? 'visible' : 'hidden';
  });

  const press = (d: number) => {
    fleetStore.bump(d);
    redraw();
  };

  return (
    <div
      ref={ref}
      className="pointer-events-auto flex items-center gap-sm rounded-full bg-white/95 px-sm py-xs text-neutral-900 shadow-lg ring-1 ring-neutral-200"
      style={{ opacity: 0, visibility: 'hidden' }}
    >
      <button
        type="button"
        onClick={() => press(-1)}
        disabled={n <= 1}
        aria-label="Retirer un véhicule de la flotte"
        className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-lg font-extrabold leading-none transition hover:bg-neutral-200 disabled:opacity-40"
      >
        −
      </button>
      <span className="min-w-[7.5rem] text-center text-sm font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
        Ma flotte : {n} {n > 1 ? 'véhicules' : 'véhicule'}
      </span>
      <button
        type="button"
        onClick={() => press(1)}
        disabled={n >= FLEET_MAX}
        aria-label="Ajouter un véhicule à la flotte"
        className="grid h-8 w-8 place-items-center rounded-full bg-primary-500 text-lg font-extrabold leading-none text-white transition hover:brightness-110 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
