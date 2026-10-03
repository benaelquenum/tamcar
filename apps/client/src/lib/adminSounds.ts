'use client';

// Sons du back-office, générés par WebAudio (aucun fichier à charger).
// - Sirène SOS : balayage grave/aigu continu, volume fort, jusqu'à arrêt.
// - Carillon : trois notes montantes, pour les alertes non vitales.
// Les navigateurs bloquent le son tant que la page n'a pas reçu un clic :
// unlockAudio() est appelé au premier clic/toucher, et audioRunning() permet
// d'afficher « activer le son » tant que ce n'est pas le cas.

let ctx: AudioContext | null = null;
let siren: { stop: () => void } | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    }
    return ctx;
  } catch {
    return null;
  }
}

export function audioRunning(): boolean {
  return !!ctx && ctx.state === 'running';
}

/** À appeler depuis un geste utilisateur (clic, toucher, touche). */
export async function unlockAudio(): Promise<boolean> {
  const c = getCtx();
  if (!c) return false;
  try {
    if (c.state !== 'running') await c.resume();
  } catch {
    /* ignore */
  }
  return c.state === 'running';
}

/** Sirène SOS en boucle. Sans effet si elle tourne déjà ou si le son est bloqué. */
export function startSiren(): void {
  if (siren) return;
  const c = getCtx();
  if (!c || c.state !== 'running') return;

  const out = c.createGain();
  out.gain.value = 0.0001;
  const comp = c.createDynamicsCompressor();
  out.connect(comp);
  comp.connect(c.destination);

  // Deux oscillateurs légèrement désaccordés, modulés par un LFO lent : le « wail » d'une sirène.
  const o1 = c.createOscillator();
  const o2 = c.createOscillator();
  o1.type = 'sawtooth';
  o2.type = 'square';
  o1.frequency.value = 900;
  o2.frequency.value = 905;
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.75;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 380;
  lfo.connect(lfoGain);
  lfoGain.connect(o1.frequency);
  lfoGain.connect(o2.frequency);

  const g1 = c.createGain();
  const g2 = c.createGain();
  g1.gain.value = 0.55;
  g2.gain.value = 0.25;
  o1.connect(g1);
  o2.connect(g2);
  g1.connect(out);
  g2.connect(out);

  const t = c.currentTime;
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.9, t + 0.15);
  o1.start();
  o2.start();
  lfo.start();

  let vib: ReturnType<typeof setInterval> | null = null;
  try {
    navigator.vibrate?.([400, 200, 400, 200, 400]);
    vib = setInterval(() => navigator.vibrate?.([400, 200, 400]), 3000);
  } catch {
    /* ignore */
  }

  siren = {
    stop: () => {
      if (vib) clearInterval(vib);
      try {
        const now = c.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), now);
        out.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        o1.stop(now + 0.2);
        o2.stop(now + 0.2);
        lfo.stop(now + 0.2);
      } catch {
        /* ignore */
      }
    },
  };
}

export function stopSiren(): void {
  if (!siren) return;
  siren.stop();
  siren = null;
}

/** Carillon : trois notes montantes (alerte de dette, litige). */
export function playChime(): void {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  const note = (freq: number, at: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    o.connect(g);
    g.connect(c.destination);
    const t = c.currentTime + at;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.start(t);
    o.stop(t + 0.5);
  };
  note(784, 0);
  note(988, 0.22);
  note(1319, 0.44);
}

/** Essai de la sirène (bouton « Tester »), arrêt automatique. */
export async function testSiren(ms = 3000): Promise<boolean> {
  const ok = await unlockAudio();
  if (!ok) return false;
  const wasRunning = !!siren;
  startSiren();
  if (!wasRunning) setTimeout(stopSiren, ms);
  return true;
}
