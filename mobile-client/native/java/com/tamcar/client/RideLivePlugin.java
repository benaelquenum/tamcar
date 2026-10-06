package com.tamcar.client;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Annonce à l'application web que cet APK sait dessiner la carte de suivi du chauffeur : le jeton FCM est alors
 * enregistré avec la plateforme « android-live » (voir NativePushRegistrar). Un ancien APK n'a pas ce plugin :
 * l'appel échoue côté web, et le jeton reste « android » (notifications simples).
 */
@CapacitorPlugin(name = "RideLive")
public class RideLivePlugin extends Plugin {
    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        call.resolve(ret);
    }
}
