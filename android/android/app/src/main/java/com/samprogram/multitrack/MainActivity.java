package com.samprogram.multitrack;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.samprogram.multitrack.widget.ClockWidgetPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom local plugins must be registered before the bridge is created.
        registerPlugin(ClockWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
