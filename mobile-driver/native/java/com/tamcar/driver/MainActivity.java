package com.tamcar.driver;

import android.app.NotificationManager;
import android.content.Context;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RideAlertPlugin.class);
        super.onCreate(savedInstanceState);
        // Canaux de notification (sonnerie) créés dès le premier lancement : le chauffeur peut en régler le son.
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) RideAlertNotifier.ensureChannels(this, nm);
    }

    @Override
    public void onStart() {
        super.onStart();
        RideAlertNotifier.appForeground = true;
    }

    @Override
    public void onStop() {
        RideAlertNotifier.appForeground = false;
        super.onStop();
    }
}
