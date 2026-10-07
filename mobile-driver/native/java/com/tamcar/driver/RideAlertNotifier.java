package com.tamcar.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.util.Map;

/**
 * Alerte « nouvelle course » du chauffeur : une vraie sonnerie, même application fermée ou écran verrouillé.
 *
 * Constat (2026-10-07) : l'alerte précédente était une notification standard au son par défaut, facile à manquer.
 * Ici : canal d'importance maximale dont le son est la sonnerie TamCar (res/raw/ride_request.wav) jouée sur le flux
 * « alarme » (volume d'alarme, passe en mode vibreur et en « Ne pas déranger » par défaut), répétée en boucle
 * (FLAG_INSISTENT) jusqu'à ce que le chauffeur réagisse, que la demande soit retirée ou que 30 s s'écoulent ;
 * vibration longue, écran allumé quelques secondes.
 *
 * Messages (FCM de DONNÉES, voir send-push, ou appel direct du plugin RideAlert) :
 *   type = ride_request      : sonne (réservations : simple notification, sans boucle)
 *   type = ride_request_end  : retire l'alerte et coupe la sonnerie (course annulée, prise, expirée)
 * Tag « new-ride:<id> » identique aux notifications du serveur : tout se remplace sur place.
 *
 * Application OUVERTE au premier plan : on ne fait rien ici, l'écran de l'application sonne et affiche déjà la demande.
 */
public final class RideAlertNotifier {
    private static final String LOG = "TamCarAlert";
    static final String CHANNEL_RING = "ride_request_v1";
    static final String CHANNEL_BOOKING = "ride_booking_v1";
    private static final int NOTIF_ID = 7001;
    private static final long RING_MS = 30_000L;
    private static final long[] VIBRATION = {0, 700, 250, 700, 250, 700, 250, 1100};

    /** Mis à jour par MainActivity (onStart / onStop). */
    static volatile boolean appForeground = false;

    private RideAlertNotifier() {}

    public static void handle(Context ctx, Map<String, String> data) {
        try {
            String type = data.get("type");
            if ("ride_request_end".equals(type)) {
                end(ctx, data.get("ride_id"));
            } else if ("ride_request".equals(type)) {
                request(ctx, data);
            }
        } catch (Throwable t) {
            Log.w(LOG, "Alerte de course ignorée", t);
        }
    }

    static void end(Context ctx, String rideId) {
        if (rideId == null || rideId.isEmpty()) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel("new-ride:" + rideId, NOTIF_ID);
    }

    private static void request(Context ctx, Map<String, String> data) {
        String rideId = nz(data.get("ride_id"), "");
        if (rideId.isEmpty()) return;
        // Application ouverte : l'écran gère. « force » : tests sur émulateur.
        if (appForeground && !"1".equals(data.get("force"))) return;

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannels(ctx, nm);

        boolean booking = "1".equals(data.get("booking"));
        String title = nz(data.get("title"), "Nouvelle course TamCar");
        String body = nz(data.get("body"), "Un client attend. Ouvrez TamCar pour accepter.");
        String category = nz(data.get("category"), "");
        String tag = nz(data.get("tag"), "new-ride:" + rideId);

        Intent open = new Intent(ctx, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                ctx, rideId.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, booking ? CHANNEL_BOOKING : CHANNEL_RING)
                .setSmallIcon(vehicleRes(category))
                .setColor(0xFF2563EB)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true) // FCM + veilleur de l'application : une seule sonnerie par demande
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(booking ? NotificationCompat.CATEGORY_MESSAGE : NotificationCompat.CATEGORY_ALARM)
                .setTimeoutAfter(booking ? 10 * 60_000L : RING_MS);

        if (!booking && Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            // Avant Android 8 : pas de canal, le son se règle sur la notification.
            b.setSound(ringUri(ctx), android.media.AudioManager.STREAM_ALARM).setVibrate(VIBRATION);
        }

        Notification n = b.build();
        if (!booking) n.flags |= Notification.FLAG_INSISTENT; // répète la sonnerie jusqu'à réaction / retrait
        try {
            nm.notify(tag, NOTIF_ID, n);
        } catch (SecurityException e) {
            Log.w(LOG, "Notifications non autorisées", e);
            return;
        }
        if (!booking) wakeScreen(ctx);
    }

    private static void wakeScreen(Context ctx) {
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            @SuppressWarnings("deprecation")
            PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                    "tamcar:ride_request");
            wl.acquire(6000);
        } catch (Throwable t) {
            Log.w(LOG, "Allumage de l'écran impossible", t);
        }
    }

    static Uri ringUri(Context ctx) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + ctx.getPackageName() + "/raw/ride_request");
    }

    /** Canaux créés au démarrage de l'application et à la réception de la première alerte. */
    static void ensureChannels(Context ctx, NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel ring = new NotificationChannel(
                CHANNEL_RING, "Nouvelles courses (sonnerie)", NotificationManager.IMPORTANCE_HIGH);
        ring.setDescription("Sonnerie forte à chaque demande de course, même téléphone verrouillé.");
        AudioAttributes alarm = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        ring.setSound(ringUri(ctx), alarm);
        ring.enableVibration(true);
        ring.setVibrationPattern(VIBRATION);
        ring.enableLights(true);
        ring.setLightColor(0xFF2563EB);
        ring.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ring.setShowBadge(true);
        nm.createNotificationChannel(ring);

        NotificationChannel booking = new NotificationChannel(
                CHANNEL_BOOKING, "Réservations à l'avance", NotificationManager.IMPORTANCE_HIGH);
        booking.setDescription("Réservations programmées : alerte normale, sans boucle.");
        booking.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(booking);
    }

    private static int vehicleRes(String category) {
        if ("moto".equals(category)) return R.drawable.ic_vehicle_moto;
        if ("tricycle".equals(category)) return R.drawable.ic_vehicle_tricycle;
        return R.drawable.ic_vehicle_car;
    }

    private static String nz(String s, String fallback) {
        return s == null || s.isEmpty() ? fallback : s;
    }
}
