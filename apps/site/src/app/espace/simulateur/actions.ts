'use server';

import { getCurrentProfile } from '@/lib/session';
import { KNOWN_CATEGORIES, simulateFleet } from '@/lib/simulator.server';
import { MAX_QTY, type CategoryId, type SimOutput } from '@/lib/simulator-ui';

/**
 * Calcule la simulation CÔTÉ SERVEUR : les règles ne sont jamais envoyées au navigateur. Réservé aux
 * partenaires véhicule et aux administrateurs connectés (une action serveur est appelable en direct : le
 * contrôle d'accès est refait ici, indépendamment de la page).
 */
export async function simulateAction(raw: unknown): Promise<SimOutput> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== 'dealer' && profile.role !== 'admin')) {
    return { ok: false, error: 'Accès réservé aux partenaires TamCar.' };
  }

  const input = (raw ?? {}) as { factor?: unknown; items?: unknown };
  const factor = Math.min(1.5, Math.max(1, Number(input.factor) || 1));
  const items: { id: CategoryId; qty: number; cost: number | null }[] = [];

  if (Array.isArray(input.items)) {
    for (const it of input.items.slice(0, 10)) {
      const o = (it ?? {}) as { id?: unknown; qty?: unknown; cost?: unknown };
      const id = String(o.id) as CategoryId;
      if (!KNOWN_CATEGORIES.includes(id) || items.some((x) => x.id === id)) continue;
      const qty = Math.min(MAX_QTY, Math.max(0, Math.floor(Number(o.qty) || 0)));
      const c = Number(o.cost);
      const cost = Number.isFinite(c) && c > 0 ? Math.min(c, 1_000_000_000) : null;
      items.push({ id, qty, cost });
    }
  }

  return simulateFleet({ factor, items });
}
