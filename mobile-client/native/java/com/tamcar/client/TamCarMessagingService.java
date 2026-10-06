package com.tamcar.client;

import android.util.Log;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Remplace le service FCM du plugin @capacitor/push-notifications (retiré du manifeste par apply-native.mjs).
 * Les messages de suivi en direct (type « ride_progress… ») sont traités ici, même application fermée : ils
 * dessinent ou mettent à jour la carte de suivi du chauffeur. Tous les autres messages repassent par le plugin,
 * comportement inchangé.
 */
public class TamCarMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        try {
            Map<String, String> data = remoteMessage.getData();
            String type = data.get("type");
            if (type != null && type.startsWith("ride_progress")) {
                RideLiveNotifier.handle(getApplicationContext(), data);
                return;
            }
        } catch (Throwable t) {
            Log.w("TamCarLive", "Message de suivi ignoré", t);
        }
        super.onMessageReceived(remoteMessage);
    }
}
