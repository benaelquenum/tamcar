import { supabaseBrowser } from './supabase-browser';

// Crée un canal realtime en écartant d'abord toute instance existante du
// même topic. supabase.channel(topic) RÉUTILISE l'instance si le topic est
// déjà ouvert → un second .on('postgres_changes') après subscribe() jette
// « cannot add postgres_changes callbacks … after subscribe() » (vu quand
// deux composants partagent un topic, ou au remontage rapide avant la fin
// du removeChannel asynchrone). Règle : topics UNIQUES par composant +
// toujours passer par freshChannel.
export function freshChannel(
  name: string,
  opts?: Parameters<(typeof supabaseBrowser)['channel']>[1],
) {
  for (const ch of supabaseBrowser.getChannels()) {
    if (ch.topic === `realtime:${name}` || ch.topic === name) {
      try {
        supabaseBrowser.removeChannel(ch);
      } catch {
        /* ignore */
      }
    }
  }
  return supabaseBrowser.channel(name, opts);
}
