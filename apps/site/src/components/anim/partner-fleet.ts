/**
 * La flotte du visiteur sur la route des partenaires : nombre de véhicules affichés. Il grandit tout seul pendant le
 * dernier chapitre ; les boutons « − » et « + » permettent de le choisir (`userN`). La scène 3D écrit `shown` (nombre
 * réellement affiché), les boutons le lisent.
 */
export const FLEET_MAX = 12;

type Listener = () => void;

export const fleetStore = {
  userN: null as number | null,
  shown: 1,
  listeners: new Set<Listener>(),
  subscribe(fn: Listener) {
    fleetStore.listeners.add(fn);
    return () => {
      fleetStore.listeners.delete(fn);
    };
  },
  setShown(n: number) {
    if (n === fleetStore.shown) return;
    fleetStore.shown = n;
    fleetStore.listeners.forEach((fn) => fn());
  },
  bump(delta: number) {
    const base = fleetStore.userN ?? fleetStore.shown;
    fleetStore.userN = Math.max(1, Math.min(FLEET_MAX, base + delta));
    fleetStore.listeners.forEach((fn) => fn());
  },
  reset() {
    fleetStore.userN = null;
  },
};
