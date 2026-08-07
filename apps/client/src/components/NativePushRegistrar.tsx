'use client';

import { useEffect, useState } from 'react';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { supabaseBrowser } from '@/lib/supabase-browser';

// Enregistrement FCM de l'app NATIVE cliente : demande la permission,
// récupère le token push et le sauvegarde en base (native_push_tokens).
// L'edge function send-push envoie alors sur FCM → notifications reçues
// même application fermée.
//
// Pourquoi c'est indispensable : le Web Push ne fonctionne PAS dans la
// WebView native. Sans ce composant, un client sur l'APK ne recevait
// aucune notification — ni « Réservation confirmée », ni les rappels
// H-30/H-20/H-10/H-5 —, alors que le même compte ouvert dans Chrome les
// recevait normalement. Le portail chauffeur avait ce registrar depuis le
// début, l'application cliente non.
//
// No-op sur le web (Web Push géré par EnableNotifications) et tolérant
// aux anciens APK dépourvus du plugin @capacitor/push-notifications.

type PushNotificationsPlugin = {
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  addListener(
    event: 'registration',
    cb: (token: { value: string }) => void,
  ): Promise<{ remove: () => void }>;
  addListener(
    event: 'pushNotificationActionPerformed',
    cb: (action: { notification?: { data?: { url?: string } } }) => void,
  ): Promise<{ remove: () => void }>;
};

const PushNotifications = registerPlugin<PushNotificationsPlugin>('PushNotifications');

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function NativePushRegistrar() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let active = true;
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (active) setAuthed(Boolean(data.session));
    });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
      setAuthed(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authed || !isNative()) return;
    const removers: Array<() => void> = [];

    (async () => {
      try {
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive !== 'granted') return;

        const reg = await PushNotifications.addListener('registration', (token) => {
          if (token?.value) {
            supabaseBrowser
              .rpc('save_native_push_token', { p_token: token.value, p_platform: 'android' })
              .then(() => undefined);
          }
        });
        removers.push(() => reg.remove());

        const act = await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            const url = action?.notification?.data?.url || '/';
            try {
              window.location.assign(url);
            } catch {
              /* ignore */
            }
          },
        );
        removers.push(() => act.remove());

        await PushNotifications.register();
      } catch {
        // Plugin absent (vieil APK) ou Firebase non configuré → no-op.
      }
    })();

    return () => {
      removers.forEach((r) => r());
    };
  }, [authed]);

  return null;
}
