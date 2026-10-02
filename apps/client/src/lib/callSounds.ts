'use client';

// Sonneries de l'appel, générées par WebAudio (aucun fichier à charger, donc
// aucune data). Chaque fonction renvoie la fonction qui l'arrête.

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  try {
    if (!ctx) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new Ctx();
    }
    if (ctx && ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function beep(c: AudioContext, freq: number, at: number, dur: number, gain: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  o.connect(g);
  g.connect(c.destination);
  g.gain.setValueAtTime(0.0001, c.currentTime + at);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + at + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
  o.start(c.currentTime + at);
  o.stop(c.currentTime + at + dur + 0.05);
}

/** Tonalité d'attente côté appelant : un bip long toutes les 3 s. */
export function startRingback(): () => void {
  const c = audioContext();
  if (!c) return () => undefined;
  const ring = () => beep(c, 425, 0, 1.1, 0.18);
  ring();
  const t = setInterval(ring, 3_000);
  return () => clearInterval(t);
}

/** Sonnerie d'appel entrant : deux bips aigus et une vibration, toutes les 2,5 s. */
export function startRingtone(): () => void {
  const c = audioContext();
  const ring = () => {
    if (c) {
      beep(c, 880, 0, 0.35, 0.3);
      beep(c, 1175, 0.4, 0.35, 0.3);
    }
    try {
      navigator.vibrate?.([300, 150, 300]);
    } catch {
      /* ignore */
    }
  };
  ring();
  const t = setInterval(ring, 2_500);
  return () => {
    clearInterval(t);
    try {
      navigator.vibrate?.(0);
    } catch {
      /* ignore */
    }
  };
}
