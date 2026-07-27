'use client';

import { useEffect, useState } from 'react';

export type BannerItem = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  cta_text: string | null;
  gradient: string | null;
};

/**
 * Affiche une bannière unique, ou un carrousel auto-défilant si plusieurs.
 * Pleine largeur. Image de fond optionnelle sinon dégradé. Clic → link_url.
 */
export function BannerCarousel({
  banners,
  intervalMs = 5000,
  className = '',
}: {
  banners: BannerItem[];
  intervalMs?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const n = banners.length;

  useEffect(() => {
    if (n <= 1) return;
    const id = setInterval(() => setIndex((p) => (p + 1) % n), intervalMs);
    return () => clearInterval(id);
  }, [n, intervalMs]);

  if (n === 0) return null;
  const b = banners[Math.min(index, n - 1)];
  const gradient = b.gradient || 'from-primary-500 to-primary-700';

  const inner = (
    <div
      className={`relative flex min-h-32 w-full flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-lg text-white shadow-glow`}
    >
      {b.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={b.image_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
      )}
      <div className="relative">
        <h3 className="text-base font-extrabold leading-tight">{b.title}</h3>
        {b.subtitle && <p className="mt-xs text-xs text-white/85">{b.subtitle}</p>}
      </div>
      {b.cta_text && (
        <span className="relative mt-md inline-flex w-fit items-center gap-xs rounded-full bg-white/25 px-md py-xs text-[11px] font-bold backdrop-blur-sm">
          {b.cta_text} →
        </span>
      )}
    </div>
  );

  return (
    <div className={className}>
      {b.link_url ? (
        <a href={b.link_url} className="block">
          {inner}
        </a>
      ) : (
        inner
      )}
      {n > 1 && (
        <div className="mt-sm flex justify-center gap-xs">
          {banners.map((_, k) => (
            <button
              key={k}
              type="button"
              aria-label={`Aller à la bannière ${k + 1}`}
              onClick={() => setIndex(k)}
              className={`h-1.5 rounded-full transition-all ${
                k === index ? 'w-4 bg-primary-500' : 'w-1.5 bg-neutral-300'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
