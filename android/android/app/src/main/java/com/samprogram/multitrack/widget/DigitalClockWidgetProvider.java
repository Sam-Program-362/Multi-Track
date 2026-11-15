package com.samprogram.multitrack.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.widget.RemoteViews;

import com.samprogram.multitrack.MainActivity;
import com.samprogram.multitrack.R;

import java.util.Calendar;

/**
 * Transparent digital clock home-screen widget.
 *
 * The time/date itself is rendered by TextClock inside the launcher process, so
 * seconds tick without waking the app. This provider only swaps the AM/PM icon
 * and schedules the next noon/midnight refresh.
 */
public class DigitalClockWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_REFRESH = "com.samprogram.multitrack.widget.REFRESH";
    private static final int REFRESH_REQUEST_CODE = 1001;
    private static final int OPEN_APP_REQUEST_CODE = 1002;

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateWidgets(context, appWidgetManager, appWidgetIds);
        scheduleNextMeridiemRefresh(context, appWidgetManager);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_REFRESH.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_LOCALE_CHANGED.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, DigitalClockWidgetProvider.class));
            updateWidgets(context, manager, ids);
            scheduleNextMeridiemRefresh(context, manager);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onEnabled(Context context) {
        scheduleNextMeridiemRefresh(context, AppWidgetManager.getInstance(context));
    }

    @Override
    public void onDisabled(Context context) {
        cancelMeridiemRefresh(context);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        scheduleNextMeridiemRefresh(context, AppWidgetManager.getInstance(context));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions) {
        updateWidget(context, appWidgetManager, appWidgetId);
    }

    private static void updateWidgets(Context context, AppWidgetManager manager, int[] ids) {
        if (ids == null) return;
        for (int id : ids) {
            updateWidget(context, manager, id);
        }
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_digital_clock);

        boolean isAm = Calendar.getInstance().get(Calendar.HOUR_OF_DAY) < 12;
        views.setImageViewResource(
                R.id.widget_meridiem,
                isAm ? R.drawable.widget_sun : R.drawable.widget_half_moon
        );
        views.setContentDescription(
                R.id.widget_meridiem,
                context.getString(isAm ? R.string.widget_am : R.string.widget_pm)
        );

        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                context,
                OPEN_APP_REQUEST_CODE,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, openPending);

        manager.updateAppWidget(appWidgetId, views);
    }

    private static PendingIntent refreshPendingIntent(Context context) {
        Intent intent = new Intent(context, DigitalClockWidgetProvider.class);
        intent.setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(
                context,
                REFRESH_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static void scheduleNextMeridiemRefresh(Context context, AppWidgetManager manager) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        PendingIntent pending = refreshPendingIntent(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, DigitalClockWidgetProvider.class));
        if (ids == null || ids.length == 0) {
            alarmManager.cancel(pending);
            return;
        }

        Calendar next = Calendar.getInstance();
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.get(Calendar.HOUR_OF_DAY) < 12) {
            next.set(Calendar.HOUR_OF_DAY, 12);
        } else {
            next.add(Calendar.DAY_OF_YEAR, 1);
            next.set(Calendar.HOUR_OF_DAY, 0);
        }
        // Land just after the boundary so the icon reflects the new half-day.
        next.add(Calendar.SECOND, 1);
        long triggerAt = next.getTimeInMillis();

        boolean canUseExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms();
        if (canUseExact) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pending);
            }
        } else {
            // The app already asks for exact-alarm access for prayer reminders.
            // If the user has not granted it, the clock still ticks; only the
            // AM/PM icon refresh may be delayed by the OS.
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
        }
    }

    private static void cancelMeridiemRefresh(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.cancel(refreshPendingIntent(context));
        }
    }
}
