'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'tamcar-install-dismissed-at';
const DISMISS_DAYS = 7;

function PhoneIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

export function InstallPwaBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    // Safari iOS renvoie standalone via navigator.standalone
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((navigator as any).standalone === true) return;

    const dismissAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissAt && Date.now() - dismissAt < DISMISS_DAYS * 86_400_000) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    const installed = () => {
      setDeferred(null);
      setHidden(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  async function handleInstall() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'dismissed') {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setDeferred(null);
    setHidden(true);
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setHidden(true);
  }

  if (hidden || !deferred) return null;

  return (
    <div className="fixed inset-x-lg bottom-lg z-40 mx-auto max-w-md rounded-2xl bg-gradient-to-r from-primary-500 to-primary-700 p-md text-white shadow-glow">
      <div className="flex items-center gap-md">
        <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-white/20">
          <PhoneIcon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">Installer TamCar</p>
          <p className="text-[11px] text-white/85">
            Icône sur ton écran d&apos;accueil · plein écran · plus rapide.
          </p>
        </div>
        <div className="flex items-center gap-xs">
          <button
            type="button"
            onClick={handleInstall}
            className="rounded-full bg-white px-md py-sm text-xs font-bold text-primary-700 shadow-sm hover:brightness-95"
          >
            Installer
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10"
            aria-label="Fermer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
