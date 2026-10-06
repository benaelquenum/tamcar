'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const ITEMS = [
  { href: '/espace', label: 'Tableau de bord' },
  { href: '/espace/vehicules', label: 'Mes véhicules' },
  { href: '/espace/historique', label: 'Historique' },
  { href: '/espace/simulateur', label: 'Simulateur' },
  { href: '/espace/compte', label: 'Mon compte' },
];

/** Navigation de l'espace partenaire ; garde le paramètre d'aperçu admin (?as=…) d'une page à l'autre. */
export function EspaceNav() {
  const pathname = usePathname();
  const as = useSearchParams().get('as');
  const suffix = as ? `?as=${encodeURIComponent(as)}` : '';

  return (
    <>
      {ITEMS.map((i) => {
        const active = i.href === '/espace' ? pathname === '/espace' : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={`${i.href}${suffix}`}
            className={`whitespace-nowrap text-sm font-semibold transition hover:text-primary-500 ${active ? 'text-primary-700' : 'text-neutral-900'}`}
          >
            {i.label}
          </Link>
        );
      })}
    </>
  );
}
