package com.tamcar.client;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RideLivePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
