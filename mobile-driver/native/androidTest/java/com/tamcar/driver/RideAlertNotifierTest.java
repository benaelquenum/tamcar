package com.tamcar.driver;

import android.content.Context;
import android.os.Bundle;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.HashMap;
import java.util.Map;

/**
 * Contrôle de la sonnerie « nouvelle course » sur un émulateur : affiche l'alerte (comme si FCM l'avait livrée),
 * la laisse sonner, puis la retire (course annulée). Ne s'exécute jamais dans l'APK livré.
 *
 * Arguments : category = moto | tricycle | essentiel, hold = durée en ms avant le retrait (20000 par défaut).
 */
@RunWith(AndroidJUnit4.class)
public class RideAlertNotifierTest {
    private static final String RIDE = "5b1d4c6e-2a7f-4a1e-9d3b-0c6f1e8a7b42";

    @Test
    public void sonnerie_puis_fin() throws Exception {
        Context ctx = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Bundle args = InstrumentationRegistry.getArguments();
        String category = args.getString("category", "moto");
        long hold = Long.parseLong(args.getString("hold", "20000"));

        Map<String, String> m = new HashMap<>();
        m.put("type", "ride_request");
        m.put("ride_id", RIDE);
        m.put("title", "🚗 Nouvelle course Moto");
        m.put("body", "À 600 m · Marché Ouando → Carrefour Dowa, Porto-Novo");
        m.put("category", category);
        m.put("tag", "new-ride:" + RIDE);
        m.put("force", "1");
        RideAlertNotifier.handle(ctx, m);

        Thread.sleep(hold);

        Map<String, String> end = new HashMap<>();
        end.put("type", "ride_request_end");
        end.put("ride_id", RIDE);
        RideAlertNotifier.handle(ctx, end);
        Thread.sleep(1500);
    }
}
