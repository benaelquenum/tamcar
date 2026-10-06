package com.tamcar.client;

import android.content.Context;
import android.os.Bundle;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.HashMap;
import java.util.Map;

/**
 * Contrôle visuel de la carte de suivi sur un émulateur : fait défiler les états d'une course, une carte toutes
 * les 12 s, pendant qu'on prend des captures d'écran (adb). Ne s'exécute jamais dans l'APK livré.
 *
 * Arguments (adb / gradle -Pandroid.testInstrumentationRunnerArguments.icon=moto) :
 *   icon   = car | moto | tricycle
 *   custom = 1 pour forcer la carte dessinée à la main (sinon, Android 16 : style Live Updates)
 */
@RunWith(AndroidJUnit4.class)
public class RideLiveNotifierTest {
    private static final String RIDE = "903a9b9b-854e-406b-a7cb-301dbbec2acc";

    private static Map<String, String> msg(String state, String title, String body, String icon, int progress, String chip,
                                           boolean alert, boolean custom) {
        Map<String, String> m = new HashMap<>();
        m.put("type", "ride_progress");
        m.put("ride_id", RIDE);
        m.put("state", state);
        m.put("title", title);
        m.put("body", body);
        m.put("icon", icon);
        m.put("progress", String.valueOf(progress));
        m.put("chip", chip);
        m.put("alert", alert ? "1" : "0");
        m.put("url", "/ride/" + RIDE);
        m.put("tag", "ride:" + RIDE);
        if (custom) m.put("force_custom", "1");
        return m;
    }

    @Test
    public void defilement_des_etats() throws Exception {
        Context ctx = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Bundle args = InstrumentationRegistry.getArguments();
        String icon = args.getString("icon", "car");
        boolean custom = "1".equals(args.getString("custom", "0"));
        String detail = "Bénael · Bajaj Boxer 150 · RB1234AA";

        RideLiveNotifier.handle(ctx, msg("enroute", "Votre chauffeur arrive dans 9 min", detail, icon, 8, "9 min", true, custom));
        Thread.sleep(12000);
        RideLiveNotifier.handle(ctx, msg("enroute", "Votre chauffeur arrive dans 4 min", detail, icon, 58, "4 min", false, custom));
        Thread.sleep(12000);
        RideLiveNotifier.handle(ctx, msg("arriving", "Votre chauffeur arrive", "Soyez prêt au point de départ · RB1234AA", icon, 92, "1 min", true, custom));
        Thread.sleep(12000);
        RideLiveNotifier.handle(ctx, msg("arrived", "Votre chauffeur est arrivé", "Rejoignez-le au point de départ · RB1234AA", icon, 100, "Arrivé", true, custom));
        Thread.sleep(12000);
        RideLiveNotifier.handle(ctx, msg("trip", "En course · arrivée dans 12 min", "Vers 4Q (Mènontin), Cotonou", icon, 30, "12 min", false, custom));
        Thread.sleep(12000);

        Map<String, String> end = new HashMap<>();
        end.put("type", "ride_progress_end");
        end.put("ride_id", RIDE);
        RideLiveNotifier.handle(ctx, end);
        Thread.sleep(2000);
    }
}
