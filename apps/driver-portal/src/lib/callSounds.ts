'use client';

// Sonneries de l'appel, générées par WebAudio (aucun fichier à charger, donc
// aucune data). Chaque fonction renvoie la fonction qui l'arrête.
//
// Sonnerie d'appel entrant « dynamique » : une petite mélodie qui change à chaque retentissement (trois motifs qui se succèdent),
// monte en puissance (crescendo) sur les premières secondes pour qu'on l'entende même dans un sac ou un véhicule bruyant, avec une
// vibration qui s'allonge. Les deux applications (client et TamCar Pro) utilisent le même fichier.

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

/** Note de sonnerie : un son plein (onde triangulaire) doublé d'un harmonique léger. */
function chime(c: AudioContext, freq: number, at: number, dur: number, gain: number): void {
  const t0 = c.currentTime + at;
  for (const [type, f, g0] of [['triangle', freq, gain], ['sine', freq * 2, gain * 0.28]] as const) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    o.connect(g);
    g.connect(c.destination);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(g0, t0 + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
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

// Trois motifs (do-mi-sol-do, sol-mi-sol-do, mi-sol-do-mi aigu) joués à tour de rôle
const MOTIFS: number[][] = [
  [523.25, 659.25, 783.99, 1046.5],
  [783.99, 659.25, 783.99, 1046.5],
  [659.25, 783.99, 1046.5, 1318.5],
];

/** Sonnerie d'appel entrant : mélodie changeante en crescendo, avec vibration, toutes les 2,4 s. */
export function startRingtone(): () => void {
  const c = audioContext();
  let n = 0;
  const ring = () => {
    if (c) {
      const motif = MOTIFS[n % MOTIFS.length];
      // Volume : de 0,16 à 0,5 en 9 retentissements, puis stable
      const vol = Math.min(0.5, 0.16 + n * 0.04);
      motif.forEach((f, i) => chime(c, f, i * 0.17, 0.3, vol));
      // Reprise de la dernière note, plus longue, qui conclut la phrase
      chime(c, motif[3], 0.78, 0.55, vol * 0.9);
    }
    try {
      const long = Math.min(500, 200 + n * 40);
      navigator.vibrate?.([long, 120, long]);
    } catch {
      /* ignore */
    }
    n += 1;
  };
  ring();
  const t = setInterval(ring, 2_400);
  return () => {
    clearInterval(t);
    try {
      navigator.vibrate?.(0);
    } catch {
      /* ignore */
    }
  };
}
