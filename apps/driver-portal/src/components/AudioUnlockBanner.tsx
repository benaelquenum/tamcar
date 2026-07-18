'use client';

import { useEffect, useState } from 'react';

/**
 * Bandeau qui s'affiche jusqu'au premier tap "Activer les sons".
 * Un gesture explicite débloque toutes les futures lectures audio de la page
 * — indispensable côté chauffeur où le son de nouvelle demande doit sonner
 * même si l'écran est verrouillé / la page vient d'être ouverte.
 *
 * Préférence mémorisée dans sessionStorage.
 */
export function AudioUnlockBanner({ label }: { label?: string }) {
  const [unlocked, setUnlocked] = useState<boolean>(true);
  useEffect(() => {
    try {
      const flag = sessionStorage.getItem('tamcar-audio-unlocked');
      setUnlocked(flag === '1');
    } catch {
      setUnlocked(false);
    }
  }, []);

  if (unlocked) return null;

  function handleUnlock() {
    try {
      const el = new Audio();
      el.muted = false;
      el.volume = 0.001;
      el.src =
        'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjEyLjEwMAAAAAAAAAAAAAAA//tQxAADSMAJvUAAAgAAA0gAAABMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
      el.play().catch(() => undefined);
      setTimeout(() => {
        try {
          el.pause();
          el.currentTime = 0;
        } catch { /* ignore */ }
      }, 100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx: typeof AudioContext | undefined =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      }
      sessionStorage.setItem('tamcar-audio-unlocked', '1');
      setUnlocked(true);
    } catch {
      sessionStorage.setItem('tamcar-audio-unlocked', '1');
      setUnlocked(true);
    }
  }

  return (
    <button
      type="button"
      onClick={handleUnlock}
      className="fixed inset-x-lg top-lg z-50 flex items-center justify-center gap-sm rounded-full bg-primary-500 px-lg py-md text-sm font-bold text-white shadow-lg ring-2 ring-white/30 animate-pulse"
      style={{ maxWidth: 'min(calc(100% - 32px), 420px)', margin: '0 auto' }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
      {label || 'Activer les notifications sonores'}
    </button>
  );
}
