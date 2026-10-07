package com.tamcar.driver;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Map;

/**
 * Pont entre l'application web chauffeur et la sonnerie native.
 *   isSupported : l'APK sait faire sonner une demande de course (le jeton FCM est alors enregistré en
 *                 « android-alert » et le serveur envoie des messages de DONNÉES, voir NativePushRegistrar) ;
 *   show / stop : le veilleur de l'application déclenche ou coupe la même sonnerie (même tag que le serveur).
 * Un ancien APK n'a pas ce plugin : les appels échouent côté web et le comportement reste celui d'avant.
 */
@CapacitorPlugin(name = "RideAlert")
public class RideAlertPlugin extends Plugin {
    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void show(PluginCall call) {
        Map<String, String> data = new HashMap<>();
        data.put("type", "ride_request");
        for (String k : new String[]{"ride_id", "title", "body", "category", "booking", "tag"}) {
            String v = call.getString(k);
            if (v != null) data.put(k, v);
        }
        RideAlertNotifier.handle(getContext().getApplicationContext(), data);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        RideAlertNotifier.end(getContext().getApplicationContext(), call.getString("ride_id"));
        call.resolve();
    }
}
