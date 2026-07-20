import {
  computePrice,
  DEMO_TRAJETS,
  type PriceQuote,
  type VehicleCategory,
} from '@/lib/pricing';
import { CarIcon, MotoIcon, TricycleIcon, SuvIcon } from './Icon';

type CategoryDef = {
  id: VehicleCategory;
  name: string;
  tagline: string;
  seats: string;
  accent: string;
  Icon: (props: { className?: string; strokeWidth?: number }) => JSX.Element;
};

const CATEGORIES: CategoryDef[] = [
  { id: 'moto',      name: 'Moto',      tagline: 'Rapide, éco',    seats: '2 pl.', accent: 'bg-orange-500',  Icon: MotoIcon },
  { id: 'tricycle',  name: 'Tricycle',  tagline: 'Kloboto',        seats: '3 pl.', accent: 'bg-violet-500',  Icon: TricycleIcon },
  { id: 'essentiel', name: 'Essentiel', tagline: 'Voiture éco',    seats: '4 pl.', accent: 'bg-primary-500', Icon: CarIcon },
  { id: 'confort',   name: 'Confort',   tagline: 'Voiture clim.',  seats: '4 pl.', accent: 'bg-amber-500',   Icon: SuvIcon },
];

export async function CategoryPricingCards() {
  const results = await Promise.all(
    CATEGORIES.map((cat) =>
      computePrice({ ...DEMO_TRAJETS.urbainCourt.params, p_category: cat.id }),
    ),
  );
  const prices = CATEGORIES.reduce<Record<VehicleCategory, PriceQuote | null>>(
    (acc, cat, i) => { acc[cat.id] = results[i]; return acc; },
    {} as Record<VehicleCategory, PriceQuote | null>,
  );

  return (
    <section className="mt-xl">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold text-neutral-900">Nos catégories</h2>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary-500">
          Prix indicatif · 5 km
        </span>
      </div>

      <div className="mt-md grid grid-cols-2 gap-sm">
        {CATEGORIES.map((cat) => (
          <MiniCategoryTile key={cat.id} category={cat} quote={prices[cat.id]} />
        ))}
      </div>
    </section>
  );
}

function MiniCategoryTile({ category, quote }: { category: CategoryDef; quote: PriceQuote | null }) {
  const { Icon } = category;
  return (
    <div className="relative overflow-hidden rounded-xl bg-white p-md shadow-sm ring-1 ring-neutral-200">
      <div className="flex items-center gap-sm">
        <span
          className={`grid h-9 w-9 flex-none place-items-center rounded-full text-white ${category.accent}`}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-neutral-900">{category.name}</p>
          <p className="truncate text-[11px] text-neutral-500">{category.tagline} · {category.seats}</p>
        </div>
      </div>
      <div className="mt-sm flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Dès</span>
        <span
          className="text-base font-extrabold text-neutral-900"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {quote ? formatFcfa(quote.price_total_fcfa) : '—'}
          <span className="ml-xs text-[10px] font-medium text-neutral-500">F</span>
        </span>
      </div>
    </div>
  );
}

function formatFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}
