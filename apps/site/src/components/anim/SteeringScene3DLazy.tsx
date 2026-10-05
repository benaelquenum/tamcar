'use client';

import dynamic from 'next/dynamic';

/** Chargement différé de la scène 3D (three.js n'est téléchargé que si la scène s'affiche). */
export const SteeringScene3DLazy = dynamic(() => import('./SteeringScene3D').then((m) => m.SteeringScene3D), { ssr: false });
