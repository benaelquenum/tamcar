'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

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
 * Bannière = l'IMAGE telle quelle (conçue à l'avance : fichier du site ou
 * image téléversée par l'admin). Une seule image, ou carrousel qui défile
 * tout seul si plusieurs : un glissement d'une image à la suivante toutes
 * les 3 s, relancé à chaque geste (balayage ou point cliqué) pour ne pas
 * changer de bannière sous le doigt. Clic → link_url. Les bannières sans
 * image sont ignorées.
 */
export function BannerCarousel({
  banners,
  intervalMs = 3000,
  className = '',
  aspectClass = '',
}: {
  banners: BannerItem[];
  intervalMs?: number;
  className?: string;
  /** Ratio imposé (ex. « aspect-[5/2] ») : évite que la page saute quand les
   *  images n'ont pas toutes la même hauteur. Vide = hauteur naturelle. */
  aspectClass?: string;
}) {
  const items = banners.filter((b) => b.image_url);
  const n = items.length;
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);

  const go = useCallback((k: number) => setIndex(((k % n) + n) % n), [n]);

  // Le minuteur dépend de `index` : toute navigation, automatique ou non,
  // repart d'un décompte plein.
  useEffect(() => {
    if (n <= 1) return;
    const id = setTimeout(() => setIndex((p) => (p + 1) % n), intervalMs);
    return () => clearTimeout(id);
  }, [index, n, intervalMs]);

  if (n === 0) return null;

  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
  }

  return (
    <div className={className}>
      <div
        className="overflow-hidden rounded-[20px] shadow-md"
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {items.map((b, k) => {
            const img = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.image_url as string}
                alt={b.title || 'Bannière'}
                draggable={false}
                loading={k === 0 ? 'eager' : 'lazy'}
                className={`block w-full select-none object-cover ${aspectClass}`}
              />
            );
            return (
              <div key={b.id} className="w-full flex-none" aria-hidden={k !== index}>
                {b.link_url ? (
                  b.link_url.startsWith('/') ? (
                    <Link href={b.link_url} className="block" tabIndex={k === index ? 0 : -1}>
                      {img}
                    </Link>
                  ) : (
                    <a href={b.link_url} className="block" tabIndex={k === index ? 0 : -1}>
                      {img}
                    </a>
                  )
                ) : (
                  img
                )}
              </div>
            );
          })}
        </div>
      </div>

      {n > 1 && (
        <div className="mt-md flex items-center justify-center gap-xs">
          {items.map((_, k) => (
            <button
              key={k}
              type="button"
              aria-label={`Aller à la bannière ${k + 1}`}
              aria-current={k === index}
              onClick={() => go(k)}
              className={`h-2 rounded-full transition-all duration-300 ${
                k === index ? 'w-5 bg-primary-600' : 'w-2 bg-neutral-200'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
