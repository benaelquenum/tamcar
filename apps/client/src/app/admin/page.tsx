import Link from 'next/link';

const SECTIONS: Array<{
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  tint: string;
}> = [
  {
    href: '/admin/rides',
    title: 'Courses',
    description: 'Historique complet des rides, statuts, prix, chauffeur, wallet transactions.',
    tint: 'from-primary-500 to-primary-700',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2" />
        <circle cx="6.5" cy="16.5" r="2.5" />
        <circle cx="16.5" cy="16.5" r="2.5" />
      </svg>
    ),
  },
  {
    href: '/admin/candidatures',
    title: 'Candidatures & RDV',
    description: 'Validation des dossiers chauffeurs, KYC, planning des rendez-vous.',
    tint: 'from-primary-500 to-primary-700',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <path d="M20 8v6M23 11h-6" />
      </svg>
    ),
  },
  {
    href: '/admin/dealer-advances',
    title: 'Avances Concessionnaires',
    description: 'Ligne de crédit ADR : décaissements, remboursements, encours par partenaire.',
    tint: 'from-primary-500 to-primary-700',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    href: '/admin/banners',
    title: 'Bannières',
    description: 'Communications marketing affichées en home client (promotions, actualités).',
    tint: 'from-primary-500 to-primary-700',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    href: '/admin/places',
    title: 'Lieux (POI)',
    description: 'Modération des lieux proposés par les utilisateurs (base Overpass + suggestions).',
    tint: 'from-primary-500 to-primary-700',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
];

export default function AdminHome() {
  return (
    <div>
      <div className="mb-lg">
        <h1 className="text-2xl font-extrabold text-neutral-900">Back-office TamCar</h1>
        <p className="mt-xs text-sm text-neutral-600">
          Sélectionne une section pour la gérer. Chaque module est aussi accessible via
          les onglets en haut.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex flex-col rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary-300"
          >
            <div
              className={`mb-md grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br ${s.tint} text-white shadow-md`}
            >
              {s.icon}
            </div>
            <h2 className="text-lg font-bold text-neutral-900 group-hover:text-primary-700">
              {s.title}
            </h2>
            <p className="mt-xs flex-1 text-sm text-neutral-600">{s.description}</p>
            <span className="mt-md inline-flex items-center gap-xs text-sm font-semibold text-primary-700">
              Ouvrir
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition group-hover:translate-x-1">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
