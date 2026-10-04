import { supabaseBrowser } from './supabase-browser';

// Priorité de proximité : une course s'ouvre par cercles successifs autour du client (réglage du
// back-office). Un cercle qui s'ouvre ne déclenche aucun événement en base : l'écran du chauffeur relit
// donc le pool à chaque ouverture. Ces délais viennent de la base ; en cas d'échec, valeurs par défaut.
const DEFAULT_DELAYS_S = [10, 20, 40];
const TTL_MS = 10 * 60_000;

let cached: { at: number; delaysMs: number[] } | null = null;

/** Délais (ms) auxquels relire le pool après la création d'une course (1 s de marge). Vide si la priorité est désactivée. */
export async function ringDelaysMs(): Promise<number[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.delaysMs;
  let delaysMs = DEFAULT_DELAYS_S.map((s) => s * 1000 + 1000);
  try {
    const { data } = await supabaseBrowser.rpc('ride_ring_plan');
    const p = (Array.isArray(data) ? data[0] : data) as
      | { enabled: boolean; d2_s: number; d3_s: number; d4_s: number }
      | undefined;
    if (p) {
      delaysMs = p.enabled
        ? [p.d2_s, p.d3_s, p.d4_s].filter((s) => s > 0).map((s) => s * 1000 + 1000)
        : [];
    }
  } catch {
    /* valeurs par défaut */
  }
  cached = { at: Date.now(), delaysMs };
  return delaysMs;
}
