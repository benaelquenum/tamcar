// Génère, à partir de icons.json (source unique), les icônes de véhicules pour :
//   - apps/client et apps/driver-portal : components/VehicleIcon.tsx
//   - l'application Android (Capacitor) : mobile-client/native/res/drawable/ic_vehicle_*.xml, ic_pin.xml
// Usage : node design/vehicle-icons/build-vehicle-icons.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const icons = JSON.parse(readFileSync(join(HERE, 'icons.json'), 'utf8'));
const KINDS = ['car', 'moto', 'tricycle'];
const STROKE = 1.8;

// ------------------------------------------------------------------ React
const tsx = `// GÉNÉRÉ par design/vehicle-icons/build-vehicle-icons.mjs (source : design/vehicle-icons/icons.json).
// Ne pas modifier à la main : modifier icons.json puis relancer le script.
//
// Icône du véhicule d'une course : voiture (Essentiel, Confort, VIP), tricycle ou moto.

export type VehicleKind = 'car' | 'moto' | 'tricycle';

const PATHS: Record<VehicleKind, string[]> = ${JSON.stringify(Object.fromEntries(KINDS.map((k) => [k, icons[k]])), null, 2)};

/** Type d'icône d'une catégorie de véhicule (moto, tricycle ; toute autre catégorie = voiture). */
export function vehicleKind(category?: string | null): VehicleKind {
  const c = (category ?? '').toLowerCase();
  if (c === 'moto') return 'moto';
  if (c === 'tricycle') return 'tricycle';
  return 'car';
}

export function VehicleIcon({
  category,
  className = 'h-5 w-5',
  strokeWidth = ${STROKE},
}: {
  /** Catégorie commandée (moto, tricycle, essentiel, confort, premium) ou type d'icône (car). */
  category?: string | null;
  className?: string;
  strokeWidth?: number;
}) {
  const kind = vehicleKind(category);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={\`shrink-0 \${className}\`}
      aria-hidden="true"
    >
      {PATHS[kind].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
`;
for (const app of ['client', 'driver-portal']) {
  writeFileSync(join(ROOT, 'apps', app, 'src', 'components', 'VehicleIcon.tsx'), tsx);
}

// ------------------------------------------------------------------ Android (vector drawables)
const out = join(ROOT, 'mobile-client', 'native', 'res', 'drawable');
mkdirSync(out, { recursive: true });
const vector = (paths, color = '#FFFFFFFF', width = STROKE) =>
  `<?xml version="1.0" encoding="utf-8"?>
<!-- GÉNÉRÉ par design/vehicle-icons/build-vehicle-icons.mjs : ne pas modifier à la main. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
${paths
  .map(
    (d) =>
      `    <path android:pathData="${d}" android:fillColor="#00000000" android:strokeColor="${color}" android:strokeWidth="${width}" android:strokeLineCap="round" android:strokeLineJoin="round"/>`,
  )
  .join('\n')}
</vector>
`;
for (const k of KINDS) writeFileSync(join(out, `ic_vehicle_${k}.xml`), vector(icons[k]));
// Repère d'arrivée (épingle)
writeFileSync(
  join(out, 'ic_pin.xml'),
  vector(['M12 21C12 21 5 14.6 5 9.6A7 7 0 0 1 19 9.6C19 14.6 12 21 12 21Z', 'M12 7.4A2.3 2.3 0 1 1 12 12A2.3 2.3 0 1 1 12 7.4Z'], '#FFFFFFFF', 1.8),
);
console.log('Icônes générées : VehicleIcon.tsx (client, driver-portal) et drawables Android.');
