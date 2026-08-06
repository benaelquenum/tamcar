'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { parseMapLink, type MapLinkResult } from '@/lib/map-links';
import { placeToFeature, searchPlaces, type PlaceRow } from '@/lib/places';
import { isWithinServiceZone } from '@/lib/service-zone';
import { Logo } from '@/components/Logo';

/**
 * Point d'entrée des liens de localisation ouverts depuis une autre
 * application (WhatsApp, Google Maps, un SMS…).
 *
 * Reçoit le lien brut en `?u=`, en extrait une destination, puis bascule sur
 * l'écran de commande avec la destination déjà renseignée. Quand le lien ne
 * donne qu'un nom de lieu, on propose les correspondances de notre base.
 */
export default function OuvrirPage() {
  return (
    <Suspense fallback={<Frame><p className="text-sm text-neutral-500">Ouverture…</p></Frame>}>
      <OuvrirContent />
    </Suspense>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-white px-lg py-2xl">
      <div className="mx-auto max-w-md">
        <Logo className="mx-auto h-10 w-auto" />
        <div className="mt-xl">{children}</div>
      </div>
    </main>
  );
}

function OuvrirContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get('u') ?? '';

  const [status, setStatus] = useState<'working' | 'choose' | 'failed'>('working');
  const [message, setMessage] = useState('Lecture du lieu…');
  const [candidates, setCandidates] = useState<PlaceRow[]>([]);
  const [queryLabel, setQueryLabel] = useState('');

  const goToOrder = useCallback(
    (lat: number, lng: number, label?: string) => {
      const params = new URLSearchParams({
        dest_lat: String(lat),
        dest_lng: String(lng),
      });
      if (label) params.set('dest', label);
      router.replace(`/commande?${params.toString()}`);
    },
    [router],
  );

  const handleQuery = useCallback(async (query: string) => {
    setQueryLabel(query);
    setMessage('Recherche du lieu…');
    const rows = await searchPlaces(query);
    if (rows.length === 1) {
      const f = placeToFeature(rows[0]);
      goToOrder(f.center[1], f.center[0], f.place_name);
      return;
    }
    if (rows.length > 1) {
      setCandidates(rows);
      setStatus('choose');
      return;
    }
    setMessage(
      `Nous n'avons pas trouvé « ${query} » dans notre base de lieux. Saisissez la destination à la main.`,
    );
    setStatus('failed');
  }, [goToOrder]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!raw.trim()) {
        setMessage("Aucun lieu n'a été transmis.");
        setStatus('failed');
        return;
      }

      let result: MapLinkResult = parseMapLink(raw);

      // Lien raccourci : le serveur le déroule (impossible depuis le navigateur).
      if (result.kind === 'short') {
        setMessage('Ouverture du lien…');
        try {
          const res = await fetch(
            `/api/resolve-map-link?u=${encodeURIComponent(result.url)}`,
          );
          const body = await res.json();
          if (cancelled) return;
          result = (body?.result as MapLinkResult) ?? { kind: 'none' };
        } catch {
          result = { kind: 'none' };
        }
      }
      if (cancelled) return;

      if (result.kind === 'coords') {
        if (!isWithinServiceZone(result.lat, result.lng)) {
          setMessage(
            "Ce lieu est en dehors de notre zone de service. TamCar dessert Cotonou, Porto-Novo et le corridor entre les deux.",
          );
          setStatus('failed');
          return;
        }
        goToOrder(result.lat, result.lng, result.label);
        return;
      }

      if (result.kind === 'query') {
        await handleQuery(result.query);
        return;
      }

      setMessage(
        "Nous n'avons pas réussi à lire ce lieu. Ouvrez TamCar et saisissez la destination.",
      );
      setStatus('failed');
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [raw, goToOrder, handleQuery]);

  if (status === 'choose') {
    return (
      <Frame>
        <h1 className="text-xl font-extrabold text-neutral-900">
          Quel lieu exactement ?
        </h1>
        <p className="mt-xs text-sm text-neutral-600">
          Le lien indiquait « {queryLabel} ». Choisissez la destination :
        </p>
        <ul className="mt-lg space-y-sm">
          {candidates.map((p) => {
            const f = placeToFeature(p);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => goToOrder(f.center[1], f.center[0], f.place_name)}
                  className="w-full rounded-xl bg-neutral-50 px-lg py-md text-left ring-1 ring-neutral-200 transition hover:bg-primary-50"
                >
                  <span className="block text-sm font-bold text-neutral-900">
                    {p.name}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {[p.district, p.city].filter(Boolean).join(', ')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <Link
          href="/commande"
          className="mt-lg block text-center text-sm font-bold text-primary-600 hover:underline"
        >
          Aucun de ceux-là — saisir moi-même
        </Link>
      </Frame>
    );
  }

  if (status === 'failed') {
    return (
      <Frame>
        <h1 className="text-xl font-extrabold text-neutral-900">
          Lieu non reconnu
        </h1>
        <p className="mt-sm text-sm leading-relaxed text-neutral-600">{message}</p>
        <Link
          href="/commande"
          className="mt-xl block rounded-lg bg-primary-500 py-md text-center text-sm font-bold text-white shadow-md"
        >
          Commander une course
        </Link>
        <Link
          href="/"
          className="mt-sm block text-center text-sm text-neutral-500 hover:underline"
        >
          Retour à l&apos;accueil
        </Link>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="flex items-center gap-md">
        <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
        <p className="text-sm text-neutral-600">{message}</p>
      </div>
    </Frame>
  );
}
