package com.samprogram.multitrack.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the Android app ask the launcher to pin the clock widget. The launcher
 * still shows its own confirmation UI; this never places a widget silently.
 */
@CapacitorPlugin(name = "ClockWidget")
public class ClockWidgetPlugin extends Plugin {

    @PluginMethod
    public void requestPin(PluginCall call) {
        JSObject result = new JSObject();
        try {
            Context context = getContext();
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            boolean supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && manager != null
                    && manager.isRequestPinAppWidgetSupported();
            result.put("supported", supported);

            if (!supported) {
                result.put("requested", false);
                call.resolve(result);
                return;
            }

            ComponentName provider = new ComponentName(context, DigitalClockWidgetProvider.class);
            boolean requested = manager.requestPinAppWidget(provider, null, null);
            result.put("requested", requested);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to request the clock widget", error);
        }
    }
}
