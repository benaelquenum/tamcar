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
 * Bannière = l'IMAGE téléversée, telle quelle (conçue à l'avance par l'admin).
 * Une seule image, ou carrousel auto-défilant si plusieurs. Clic → link_url.
 * Les bannières sans image sont ignorées.
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
  const items = banners.filter((b) => b.image_url);
  const [index, setIndex] = useState(0);
  const n = items.length;

  useEffect(() => {
    if (n <= 1) return;
    const id = setInterval(() => setIndex((p) => (p + 1) % n), intervalMs);
    return () => clearInterval(id);
  }, [n, intervalMs]);

  if (n === 0) return null;
  const b = items[Math.min(index, n - 1)];

  const inner = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={b.image_url as string}
      alt={b.title || 'Bannière'}
      className="block w-full rounded-2xl object-cover shadow-sm"
    />
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
          {items.map((_, k) => (
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
