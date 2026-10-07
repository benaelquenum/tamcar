package com.tamcar.driver;

import android.util.Log;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Remplace le service FCM du plugin @capacitor/push-notifications (retiré du manifeste par apply-native.mjs).
 * Les messages « ride_request… » (alerte de course) sont traités ici, même application fermée : ils font sonner
 * ou retirent l'alerte. Tous les autres messages repassent par le plugin, comportement inchangé.
 */
public class DriverMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        try {
            Map<String, String> data = remoteMessage.getData();
            String type = data.get("type");
            if (type != null && type.startsWith("ride_request")) {
                RideAlertNotifier.handle(getApplicationContext(), data);
                return;
            }
        } catch (Throwable t) {
            Log.w("TamCarAlert", "Message d'alerte ignoré", t);
        }
        super.onMessageReceived(remoteMessage);
    }
}
