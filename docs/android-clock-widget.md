# Android home-screen Digital Clock widget

The clock widget lives in the standalone Capacitor Android app (`android/`), not in the web dashboard.

## User-facing behavior

- Transparent widget surface; the launcher wallpaper shows through.
- No visible widget title/caption underneath. The receiver label is intentionally empty because some launchers render the provider label below the widget.
- Large hours/minutes, live seconds at exactly half text size.
- Weekday, month, and date on one quiet line.
- Sun icon for AM, half-moon icon for PM.
- Tapping the widget opens Multi-Track.
- Added from the launcher widget picker, or from **About → Add clock widget** inside the Android app.

## Native implementation

- `android/android/app/src/main/java/com/samprogram/multitrack/widget/DigitalClockWidgetProvider.java`
  - Classic `AppWidgetProvider` + `RemoteViews`.
  - `TextClock` views render hours, minutes, seconds, and date inside the launcher process, so the clock ticks without a background service or per-second broadcasts.
  - The provider swaps the AM/PM icon and schedules the next noon/midnight refresh. It uses exact alarms when already permitted for prayer reminders, otherwise an inexact idle alarm; the time itself still ticks.
  - Handles widget update/delete/enable/disable, boot, time/timezone/locale changes.
- `android/android/app/src/main/res/layout/widget_digital_clock.xml`
  - Transparent layout; seconds dimen is exactly half the hour/minute dimen.
- `android/android/app/src/main/res/xml/widget_digital_clock_info.xml`
  - Home-screen category, resizable, scalable preview layout plus fallback preview image, `updatePeriodMillis=0` because `TextClock` handles ticking.
- `android/android/app/src/main/java/com/samprogram/multitrack/widget/ClockWidgetPlugin.java`
  - Local Capacitor plugin exposing `requestPin()` so the app can ask the launcher to pin the widget. The launcher still shows its own confirmation UI.
- `android/src/lib/native.ts` and `android/src/components/AboutPanel.tsx`
  - Guarded web-to-native bridge and an “Add clock widget” action.

## Why this shape

Android’s widget picker expects an `AppWidgetProvider` receiver and RemoteViews-compatible layout [5](https://developer.android.com/codelabs/glance). `TextClock` is supported by `RemoteViews` [3](https://developer.android.com/reference/android/widget/RemoteViews) and honors 12/24-hour format patterns [1](https://developer.android.com/reference/android/widget/TextClock). Periodic `updatePeriodMillis` cannot run faster than 30 minutes [1](https://developer.android.com/develop/ui/views/appwidgets/advanced), so a per-second provider update would be wasteful; `TextClock` avoids that.

## Web widget removal

The earlier web widget gallery/routes/registry were removed from the root web app. The web service worker cache was bumped to clear retired `/widgets` routes from older installs.

## CI / release

The existing workflow `.github/workflows/android-apk.yml` builds the APK. Pull requests touching `android/**` run a validation build; branch/manual dispatch builds upload an artifact; only `main` publishes a GitHub Release. The widget adds no new runtime permission: it reuses the app’s existing boot/exact-alarm permissions where available.

## Manual test checklist

- [ ] Install APK, long-press launcher → Widgets → Multi-Track clock widget.
- [ ] Widget is transparent over wallpaper; no “Digital Clock” caption appears underneath; seconds are half-size and tick.
- [ ] Sun before noon, half moon after noon; date line updates at midnight.
- [ ] Tap widget opens app.
- [ ] About → Add clock widget shows launcher pin prompt where supported.
- [ ] Reboot device; widget still shows correct time/icon.
- [ ] Change timezone/time; widget refreshes.
