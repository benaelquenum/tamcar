// Son de notification « nouveau message » via Web Audio (aucun fichier requis) : deux notes (ding-dong) plus franches qu'un simple bip,
// avec une courte vibration. Un seul contexte audio partagé, débloqué au premier toucher de l'écran (les navigateurs refusent de jouer
// un son avant une interaction ; un contexte créé à chaque message restait muet). Silencieux si l'audio est bloqué.
// Les deux applications (client et TamCar Pro) utilisent le même fichier.

let shared: AudioContext | null = null;

function audioContext(): AudioContext | null {
  try {
    if (!shared) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      shared = new AC();
    }
    if (shared.state === 'suspended') void shared.resume();
    return shared;
  } catch {
    return null;
  }
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    audioContext();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

function note(ctx: AudioContext, freq: number, at: number, dur: number, gain: number): void {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(ctx.destination);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export function playMessageSound(): void {
  try {
    const ctx = audioContext();
    if (ctx) {
      note(ctx, 988, 0, 0.32, 0.42); // si
      note(ctx, 1319, 0.14, 0.5, 0.42); // mi aigu
    }
    navigator.vibrate?.([70, 50, 70]);
  } catch {
    /* ignore */
  }
}
