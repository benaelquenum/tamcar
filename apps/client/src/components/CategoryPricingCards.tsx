import {
  computePrice,
  DEMO_TRAJETS,
  type PriceQuote,
  type VehicleCategory,
} from '@/lib/pricing';
import { CheckIcon, SnowflakeIcon, SparkleIcon, StarIcon } from './Icon';

type CategoryDef = {
  id: VehicleCategory;
  name: string;
  tagline: string;
  features: string[];
  badge?: string;
  gradient: string;
  climate: {
    label: string;
    detail: string;
    badgeClass: string;
  };
};

const CATEGORIES: CategoryDef[] = [
  {
    id: 'essentiel',
    name: 'Essentiel',
    tagline: 'Ta course sans surprise',
    features: [
      'Voiture propre et vérifiée',
      'Chauffeur noté 4,2 étoiles minimum',
      'Prix fixe garanti, jamais de surge',
    ],
    gradient: 'from-primary-500 to-primary-700',
    climate: {
      label: 'Sans clim',
      detail: 'Voiture sans climatisation',
      badgeClass: 'bg-neutral-300 text-neutral-700',
    },
  },
  {
    id: 'confort',
    name: 'Confort',
    tagline: 'Le voyage sans compromis',
    features: [
      'Voiture récente de moins de 5 ans',
      'Chauffeur noté 4,6 étoiles minimum + formé qualité',
      'Prix fixe garanti, jamais de surge',
    ],
    badge: 'Best-seller',
    gradient: 'from-violet-500 via-primary-500 to-primary-700',
    climate: {
      label: 'Clim incluse',
      detail: 'Fraîcheur assurée dès le départ',
      badgeClass: 'bg-cyan-500 text-white',
    },
  },
];

export async function CategoryPricingCards() {
  // Fetch prix pour les 2 catégories × 2 trajets démo en parallèle
  const results = await Promise.all(
    CATEGORIES.flatMap((cat) => [
      computePrice({ ...DEMO_TRAJETS.corridorTokpaAssPn.params, p_category: cat.id }),
      computePrice({ ...DEMO_TRAJETS.urbainCourt.params, p_category: cat.id }),
    ]),
  );

  const prices = CATEGORIES.reduce<Record<VehicleCategory, { corridor: PriceQuote | null; urban: PriceQuote | null }>>(
    (acc, cat, i) => {
      acc[cat.id] = { corridor: results[i * 2], urban: results[i * 2 + 1] };
      return acc;
    },
    {} as Record<VehicleCategory, { corridor: PriceQuote | null; urban: PriceQuote | null }>,
  );

  return (
    <section className="mt-xl">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-extrabold text-neutral-900">Choisis ton style</h2>
        <span className="text-xs font-semibold uppercase tracking-wider text-primary-500">
          Prix en direct
        </span>
      </div>
      <p className="mt-xs text-sm text-neutral-600">
        Deux niveaux de service, un même engagement prix fixe.
      </p>

      {/* Ligne comparaison rapide — la clim est le différenciateur clé */}
      <div className="mt-md flex items-stretch gap-sm rounded-xl bg-neutral-100 p-sm">
        <div className="flex-1 rounded-lg bg-white p-sm text-center ring-1 ring-neutral-200">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Essentiel
          </p>
          <p className="mt-xs inline-flex items-center gap-xs text-xs font-bold text-neutral-500">
            <SnowflakeIcon className="h-3 w-3" strokeWidth={2.5} />
            Sans clim
          </p>
        </div>
        <div className="flex-1 rounded-lg bg-white p-sm text-center ring-1 ring-neutral-200">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Confort
          </p>
          <p className="mt-xs inline-flex items-center gap-xs text-xs font-bold text-cyan-500">
            <SnowflakeIcon className="h-3 w-3" strokeWidth={2.5} />
            Clim incluse
          </p>
        </div>
      </div>

      <div className="mt-lg space-y-md">
        {CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat.id}
            category={cat}
            corridor={prices[cat.id].corridor}
            urban={prices[cat.id].urban}
          />
        ))}
      </div>

      <p className="mt-md text-center text-[11px] text-neutral-400">
        Prix indicatifs — la course finale est calculée après confirmation du trajet exact.
      </p>
    </section>
  );
}

function CategoryCard({
  category,
  corridor,
  urban,
}: {
  category: CategoryDef;
  corridor: PriceQuote | null;
  urban: PriceQuote | null;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${category.gradient} p-lg text-white shadow-glow`}
    >
      {category.badge && (
        <span className="absolute right-lg top-lg inline-flex items-center gap-xs rounded-full bg-white/95 px-md py-xs text-xs font-bold text-primary-700 shadow-md">
          <StarIcon className="h-3.5 w-3.5" />
          {category.badge}
        </span>
      )}

      <div>
        <h3 className="text-2xl font-extrabold leading-tight">
          TamCar <span className="font-black">{category.name}</span>
        </h3>
        <p className="mt-xs text-sm text-white/85">{category.tagline}</p>
      </div>

      {/* Encart climatisation — élément différenciant, mis en avant */}
      <div className="mt-md flex items-center gap-md rounded-xl bg-white/15 p-md ring-1 ring-white/25 backdrop-blur-sm">
        <span
          className={`grid h-10 w-10 flex-none place-items-center rounded-lg shadow-md ${category.climate.badgeClass}`}
        >
          <SnowflakeIcon className="h-5 w-5" strokeWidth={2.5} />
        </span>
        <div className="flex-1">
          <p className="text-sm font-extrabold leading-tight text-white">
            {category.climate.label}
          </p>
          <p className="text-[11px] text-white/80">{category.climate.detail}</p>
        </div>
        {category.id === 'confort' && (
          <span className="inline-flex items-center gap-xs rounded-full bg-cyan-500/40 px-sm py-xs text-[10px] font-bold uppercase text-white">
            <SparkleIcon className="h-3 w-3" strokeWidth={2.5} />
            Standard
          </span>
        )}
      </div>

      <ul className="mt-md space-y-xs">
        {category.features.map((f) => (
          <li key={f} className="flex items-start gap-xs text-sm">
            <span className="mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full bg-white/25">
              <CheckIcon className="h-3 w-3" strokeWidth={3} />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-lg rounded-xl bg-white/15 p-md backdrop-blur-sm ring-1 ring-white/20">
        <PriceRow label="Corridor Cotonou ↔ Porto-Novo" quote={corridor} highlight />
        <div className="my-sm border-t border-white/20" />
        <PriceRow label="Course urbaine (5 km)" quote={urban} />
      </div>

      <button
        type="button"
        className="mt-md w-full rounded-md bg-white py-md text-base font-bold text-primary-700 shadow-md transition hover:brightness-105 active:scale-[0.99]"
      >
        Choisir {category.name}
      </button>
    </div>
  );
}

function PriceRow({
  label,
  quote,
  highlight = false,
}: {
  label: string;
  quote: PriceQuote | null;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-md">
      <span className="text-xs font-medium uppercase tracking-wide text-white/75">
        {label}
      </span>
      <span
        className={`${highlight ? 'text-2xl' : 'text-lg'} font-extrabold text-white`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {quote ? formatFcfa(quote.price_total_fcfa) : '—'}
        <span className="ml-xs text-xs font-medium text-white/70">FCFA</span>
      </span>
    </div>
  );
}

function formatFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}
