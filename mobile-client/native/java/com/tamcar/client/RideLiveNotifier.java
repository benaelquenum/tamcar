package com.tamcar.client;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffColorFilter;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.drawable.IconCompat;

import java.util.Collections;
import java.util.Map;

/**
 * Carte de suivi du chauffeur sur l'écran verrouillé, façon Uber : « Votre chauffeur arrive dans 6 min »,
 * une barre de progression où l'icône du véhicule commandé (voiture, tricycle ou moto) avance vers l'épingle
 * d'arrivée, mise à jour en place sans sonner.
 *
 * Les messages viennent du serveur (message FCM de DONNÉES, voir send-push) :
 *   type = ride_progress      : affiche ou met à jour la carte
 *   type = ride_progress_end  : retire la carte (sauf si une notification de fin l'a déjà remplacée)
 * Même tag « ride:<id> » et même identifiant 0 que les notifications FCM de la course : une notification de fin
 * (« Course terminée ») remplace la carte sur place.
 *
 * Android 16 et plus : style de progression « Live Updates » (promue sur l'écran verrouillé).
 * Avant : carte personnalisée dessinée ici (barre + icône en image). Tout est protégé : en cas d'erreur, une
 * notification simple est affichée plutôt que rien.
 */
public final class RideLiveNotifier {
    private static final String LOG = "TamCarLive";
    static final String CHANNEL_LIVE = "ride_live";
    static final String CHANNEL_ALERT = "ride_alert";
    static final String EXTRA_LIVE = "tc_live";
    /** Adresse de l'application web (celle de capacitor.config.json). */
    static final String BASE_URL = "https://tamcar-client.vercel.app";

    private static final int BLUE = 0xFF2563EB;
    private static final int CYAN = 0xFF06B6D4;
    private static final long TIMEOUT_MS = 15 * 60 * 1000L; // la carte s'éteint seule si le suivi s'arrête

    private RideLiveNotifier() {}

    public static void handle(Context ctx, Map<String, String> data) {
        try {
            String type = data.get("type");
            if ("ride_progress_end".equals(type)) {
                cancelIfLive(ctx, data.get("ride_id"));
            } else if ("ride_progress".equals(type)) {
                show(ctx, data);
            }
        } catch (Throwable t) {
            Log.w(LOG, "Suivi en direct ignoré", t);
        }
    }

    // ------------------------------------------------------------------ affichage

    static void show(Context ctx, Map<String, String> data) {
        String rideId = data.get("ride_id");
        if (rideId == null || rideId.isEmpty()) return;
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        if (!nm.areNotificationsEnabled()) return;
        ensureChannels(ctx);

        String title = nz(data.get("title"), "Votre chauffeur");
        String body = nz(data.get("body"), "");
        String kind = kind(data.get("icon"));
        int progress = clamp(parseInt(data.get("progress"), 0), 0, 100);
        boolean alert = "1".equals(data.get("alert"));
        boolean arrived = "arrived".equals(data.get("state"));
        String chip = data.get("chip");
        String tag = nz(data.get("tag"), "ride:" + rideId);
        PendingIntent pi = contentIntent(ctx, rideId, data.get("url"));

        Notification n;
        try {
            boolean custom = Build.VERSION.SDK_INT < 36 || "1".equals(data.get("force_custom"));
            n = custom
                    ? buildCustom(ctx, pi, alert, kind, title, body, progress, arrived)
                    : buildProgressStyle(ctx, pi, alert, kind, title, body, progress, chip);
        } catch (Throwable t) {
            Log.w(LOG, "Carte personnalisée impossible, notification simple", t);
            n = base(ctx, pi, alert, kind).setContentTitle(title).setContentText(body).setProgress(100, progress, false).build();
        }
        try {
            nm.notify(tag, 0, n);
        } catch (SecurityException e) {
            Log.w(LOG, "Notifications non autorisées", e);
        }
    }

    private static NotificationCompat.Builder base(Context ctx, PendingIntent pi, boolean alert, String kind) {
        Bundle extras = new Bundle();
        extras.putBoolean(EXTRA_LIVE, true);
        return new NotificationCompat.Builder(ctx, alert ? CHANNEL_ALERT : CHANNEL_LIVE)
                .setSmallIcon(smallIcon(kind))
                .setColor(BLUE)
                .setContentIntent(pi)
                .setOngoing(true)
                .setAutoCancel(false)
                .setShowWhen(false)
                .setOnlyAlertOnce(!alert)
                .setPriority(alert ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setTimeoutAfter(TIMEOUT_MS)
                .addExtras(extras);
    }

    /** Avant Android 16 : carte dessinée ici (titre, détail, barre avec l'icône du véhicule). */
    private static Notification buildCustom(Context ctx, PendingIntent pi, boolean alert, String kind,
                                            String title, String body, int progress, boolean arrived) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.notification_ride_live);
        rv.setTextViewText(R.id.tc_title, title);
        rv.setTextViewText(R.id.tc_body, body);
        rv.setViewVisibility(R.id.tc_body, body.isEmpty() ? View.GONE : View.VISIBLE);
        rv.setImageViewBitmap(R.id.tc_bar, drawBar(ctx, progress, kind, arrived));
        return base(ctx, pi, alert, kind)
                .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                .setCustomContentView(rv)
                .setCustomBigContentView(rv)
                .setContentTitle(title)
                .setContentText(body)
                .build();
    }

    /** Android 16 et plus : style de progression natif, promu sur l'écran verrouillé (Live Updates). */
    private static Notification buildProgressStyle(Context ctx, PendingIntent pi, boolean alert, String kind,
                                                   String title, String body, int progress, String chip) {
        NotificationCompat.ProgressStyle style = new NotificationCompat.ProgressStyle()
                .setStyledByProgress(true)
                .setProgressSegments(Collections.singletonList(new NotificationCompat.ProgressStyle.Segment(100).setColor(BLUE)))
                .setProgress(progress)
                .setProgressTrackerIcon(IconCompat.createWithBitmap(vehicleBadge(ctx, kind, 96)))
                .setProgressEndIcon(IconCompat.createWithBitmap(pinBadge(ctx, 96)));
        NotificationCompat.Builder b = base(ctx, pi, alert, kind)
                .setStyle(style)
                .setContentTitle(title)
                .setContentText(body)
                .setRequestPromotedOngoing(true);
        if (chip != null && !chip.isEmpty()) {
            b.setShortCriticalText(chip.length() > 7 ? chip.substring(0, 7) : chip);
        }
        return b.build();
    }

    // ------------------------------------------------------------------ fin de suivi

    static void cancelIfLive(Context ctx, String rideId) {
        if (rideId == null || rideId.isEmpty()) return;
        NotificationManager m = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (m == null) return;
        String tag = "ride:" + rideId;
        for (StatusBarNotification sbn : m.getActiveNotifications()) {
            if (tag.equals(sbn.getTag()) && sbn.getNotification().extras.getBoolean(EXTRA_LIVE, false)) {
                m.cancel(tag, sbn.getId());
            }
        }
    }

    // ------------------------------------------------------------------ dessin

    /** Barre de progression : piste, partie parcourue (bleu vers cyan), épingle d'arrivée, véhicule. */
    private static Bitmap drawBar(Context ctx, int progress, String kind, boolean arrived) {
        final int w = 1100, h = 88, pad = 36;
        final float cy = h / 2f, th = 14f, dia = 64f;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        float left = pad, right = w - pad;
        float vx = left + dia / 2f + (right - left - dia) * (progress / 100f);

        p.setColor(0x669AA7BD);
        c.drawRoundRect(new RectF(left, cy - th / 2, right, cy + th / 2), th / 2, th / 2, p);

        p.setShader(new LinearGradient(left, 0, Math.max(vx, left + 1), 0, BLUE, CYAN, Shader.TileMode.CLAMP));
        c.drawRoundRect(new RectF(left, cy - th / 2, vx, cy + th / 2), th / 2, th / 2, p);
        p.setShader(null);

        if (!arrived) {
            float px = right - 22f;
            p.setColor(0xFFFFFFFF);
            c.drawCircle(px, cy, 24f, p);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(4f);
            p.setColor(BLUE);
            c.drawCircle(px, cy, 24f, p);
            p.setStyle(Paint.Style.FILL);
            drawIcon(ctx, c, R.drawable.ic_pin, px, cy, 30f, BLUE);
        }

        p.setColor(BLUE);
        c.drawCircle(vx, cy, dia / 2f, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(4f);
        p.setColor(0xFFFFFFFF);
        c.drawCircle(vx, cy, dia / 2f - 2f, p);
        p.setStyle(Paint.Style.FILL);
        drawIcon(ctx, c, vehicleRes(kind), vx, cy, 40f, 0xFFFFFFFF);
        return bmp;
    }

    /** Pastille ronde avec l'icône du véhicule (curseur de la barre Live Updates). */
    private static Bitmap vehicleBadge(Context ctx, String kind, int size) {
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(BLUE);
        c.drawCircle(size / 2f, size / 2f, size / 2f, p);
        drawIcon(ctx, c, vehicleRes(kind), size / 2f, size / 2f, size * 0.66f, 0xFFFFFFFF);
        return bmp;
    }

    /** Pastille blanche avec l'épingle (repère d'arrivée). */
    private static Bitmap pinBadge(Context ctx, int size) {
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(0xFFFFFFFF);
        c.drawCircle(size / 2f, size / 2f, size / 2f, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(size * 0.06f);
        p.setColor(BLUE);
        c.drawCircle(size / 2f, size / 2f, size / 2f - size * 0.03f, p);
        drawIcon(ctx, c, R.drawable.ic_pin, size / 2f, size / 2f, size * 0.6f, BLUE);
        return bmp;
    }

    private static void drawIcon(Context ctx, Canvas c, int res, float cx, float cy, float size, int color) {
        Drawable d = ContextCompat.getDrawable(ctx, res);
        if (d == null) return;
        d = d.mutate();
        d.setColorFilter(new PorterDuffColorFilter(color, PorterDuff.Mode.SRC_IN));
        int half = Math.round(size / 2f);
        d.setBounds(Math.round(cx) - half, Math.round(cy) - half, Math.round(cx) + half, Math.round(cy) + half);
        d.draw(c);
    }

    // ------------------------------------------------------------------ outils

    private static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager m = ctx.getSystemService(NotificationManager.class);
        if (m == null) return;
        NotificationChannel live = new NotificationChannel(CHANNEL_LIVE, "Suivi de votre chauffeur", NotificationManager.IMPORTANCE_LOW);
        live.setDescription("Heure d'arrivée du chauffeur, mise à jour en direct");
        live.setShowBadge(false);
        live.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        NotificationChannel alert = new NotificationChannel(CHANNEL_ALERT, "Arrivée du chauffeur", NotificationManager.IMPORTANCE_HIGH);
        alert.setDescription("Chauffeur trouvé, bientôt là, arrivé");
        alert.enableVibration(true);
        alert.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        m.createNotificationChannel(live);
        m.createNotificationChannel(alert);
    }

    private static PendingIntent contentIntent(Context ctx, String rideId, String url) {
        String path = nz(url, "/ride/" + rideId);
        Uri uri = Uri.parse(path.startsWith("http") ? path : BASE_URL + path);
        Intent i = new Intent(Intent.ACTION_VIEW, uri);
        i.setClass(ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, rideId.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String kind(String icon) {
        return "moto".equals(icon) || "tricycle".equals(icon) ? icon : "car";
    }

    private static int vehicleRes(String kind) {
        if ("moto".equals(kind)) return R.drawable.ic_vehicle_moto;
        if ("tricycle".equals(kind)) return R.drawable.ic_vehicle_tricycle;
        return R.drawable.ic_vehicle_car;
    }

    private static int smallIcon(String kind) {
        return vehicleRes(kind);
    }

    private static String nz(String s, String d) {
        return s == null || s.isEmpty() ? d : s;
    }

    private static int parseInt(String s, int d) {
        try {
            return Integer.parseInt(s);
        } catch (Exception e) {
            return d;
        }
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
