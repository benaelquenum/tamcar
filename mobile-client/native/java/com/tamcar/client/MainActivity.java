package com.tamcar.client;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RideLivePlugin.class);
        super.onCreate(savedInstanceState);
        // Canaux de notification créés dès le démarrage (et non à la première carte de suivi) : les rappels de réservation et
        // les alertes de course arrivent ainsi sur le canal à importance HAUTE (en haut de l'écran, avec son et vibration).
        RideLiveNotifier.ensureChannels(this);
    }
}
