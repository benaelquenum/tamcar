'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { freshChannel } from '@/lib/realtime';
import { audioRunning, playChime, startSiren, stopSiren, unlockAudio } from '@/lib/adminSounds';
import { AlertTriangleIcon, BellIcon, CheckIcon } from '@/components/Icon';

export type AdminCounts = {
  sos: number; // SOS ouverts, pas encore pris en charge : déclenchent la sirène
  sos_active: number; // SOS ouverts ou pris en charge, pas encore résolus
  debts: number; // alertes de dette pas encore consultées
  debts_suspended: number; // chauffeurs actuellement suspendus pour dette
  disputes: number; // litiges à examiner par un humain
};

const EMPTY: AdminCounts = { sos: 0, sos_active: 0, debts: 0, debts_suspended: 0, disputes: 0 };

type Toast = {
  id: string;
  severity: 'critical' | 'normal' | 'info';
  title: string;
  body: string | null;
  link: string | null;
};

type Ctx = { counts: AdminCounts; refresh: () => void };
const AlertsCtx = createContext<Ctx>({ counts: EMPTY, refresh: () => undefined });

export function useAdminAlerts(): Ctx {
  return useContext(AlertsCtx);
}

const MUTE_MS = 2 * 60_000;

export function AdminAlertsProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<AdminCounts>(EMPTY);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [audioOn, setAudioOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const muteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await supabaseBrowser.rpc('admin_badge_counts');
      if (data && typeof data === 'object') {
        const next = { ...EMPTY, ...(data as Partial<AdminCounts>) };
        setCounts((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      }
    } catch {
      /* réseau : on réessaie au prochain tour */
    }
  }, []);

  // Compteurs : au chargement, toutes les 8 s, et au retour sur l'onglet.
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // Nouvelles alertes en temps réel.
  useEffect(() => {
    const ch = freshChannel('admin-alerts-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_alerts' }, (payload) => {
        const a = payload.new as { id: string; severity: Toast['severity']; title: string; body: string | null; link: string | null };
        setToasts((prev) => [...prev, { id: a.id, severity: a.severity, title: a.title, body: a.body, link: a.link }].slice(-4));
        if (a.severity === 'normal') playChime();
        if (a.severity === 'info') {
          setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== a.id)), 8_000);
        }
        void refresh();
      })
      .subscribe();
    return () => {
      void supabaseBrowser.removeChannel(ch);
    };
  }, [refresh]);

  // Son : débloqué au premier geste, état vérifié régulièrement.
  useEffect(() => {
    const unlock = () => {
      void unlockAudio().then(setAudioOn);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const t = setInterval(() => setAudioOn(audioRunning()), 2_000);
    setAudioOn(audioRunning());
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      clearInterval(t);
    };
  }, []);

  // Sirène : tant qu'un SOS n'est pas pris en charge, sauf sourdine.
  const sirenWanted = counts.sos > 0 && audioOn && !muted;
  useEffect(() => {
    if (sirenWanted) startSiren();
    else stopSiren();
    return () => stopSiren();
  }, [sirenWanted]);

  function mute() {
    setMuted(true);
    if (muteTimer.current) clearTimeout(muteTimer.current);
    muteTimer.current = setTimeout(() => setMuted(false), MUTE_MS);
  }
  useEffect(() => () => {
    if (muteTimer.current) clearTimeout(muteTimer.current);
  }, []);

  const value = useMemo(() => ({ counts, refresh }), [counts, refresh]);

  return (
    <AlertsCtx.Provider value={value}>
      {children}

      {/* Bandeau SOS : impossible à manquer */}
      {counts.sos > 0 && (
        <div className="fixed inset-x-0 top-0 z-[70] flex flex-wrap items-center justify-center gap-md bg-error px-lg py-md text-white shadow-lg animate-pulse">
          <AlertTriangleIcon className="h-6 w-6 flex-none" />
          <p className="text-base font-extrabold uppercase tracking-wide">
            SOS : {counts.sos} alerte{counts.sos > 1 ? 's' : ''} non prise{counts.sos > 1 ? 's' : ''} en charge
          </p>
          <Link href="/admin/sos" className="rounded-lg bg-white px-lg py-sm text-sm font-extrabold text-error">
            Ouvrir
          </Link>
          {audioOn && (
            <button
              type="button"
              onClick={mute}
              className="rounded-lg bg-white/20 px-md py-sm text-xs font-bold text-white hover:bg-white/30"
            >
              {muted ? 'Sirène en sourdine (2 min)' : 'Couper la sirène 2 min'}
            </button>
          )}
        </div>
      )}

      {/* Son bloqué par le navigateur */}
      {!audioOn && (
        <button
          type="button"
          onClick={() => void unlockAudio().then(setAudioOn)}
          className={`fixed inset-x-0 z-[65] flex items-center justify-center gap-sm bg-warning px-lg py-sm text-xs font-bold text-white ${
            counts.sos > 0 ? 'top-[60px]' : 'top-0'
          }`}
        >
          <BellIcon className="h-4 w-4" />
          Le son des alertes est coupé par le navigateur : cliquez ici pour l&apos;activer (sirène SOS, carillons).
        </button>
      )}

      {/* Notifications à l'écran */}
      <div className="fixed bottom-md right-md z-[70] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl p-md text-white shadow-xl ring-1 ring-black/10 ${
              t.severity === 'critical' ? 'bg-error' : t.severity === 'normal' ? 'bg-warning' : 'bg-primary-600'
            }`}
          >
            <div className="flex items-start gap-sm">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold">{t.title}</p>
                {t.body && <p className="mt-xs text-xs text-white/90">{t.body}</p>}
                {t.link && (
                  <Link
                    href={t.link}
                    onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                    className="mt-xs inline-block text-xs font-bold underline"
                  >
                    Voir
                  </Link>
                )}
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="flex-none rounded-full p-xs text-white/80 hover:bg-white/20"
              >
                <CheckIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </AlertsCtx.Provider>
  );
}

/** À poser dans une page : marque comme vues les alertes d'un type et rafraîchit les badges. */
export function MarkAlertsSeen({ kind }: { kind: string }) {
  const { refresh } = useAdminAlerts();
  useEffect(() => {
    void supabaseBrowser.rpc('admin_mark_alerts_seen', { p_kind: kind }).then(() => refresh());
  }, [kind, refresh]);
  return null;
}
