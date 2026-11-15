/**
 * Everything that talks to the Android shell through Capacitor.
 *
 * All of it is guarded: in a normal browser (or during the static build) the
 * Capacitor plugins simply are not there, so every entry point degrades to a
 * no-op or to the existing web Notification API.
 */
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { LocalNotifications, type LocalNotificationSchema } from "@capacitor/local-notifications";
import { StatusBar, Style } from "@capacitor/status-bar";
import { formatMinutes, PRAYER_META, type PrayerKey } from "./prayer";
import { zoneOffsetMinutes } from "./timezones";
import type { SoundId } from "./alarm";

/** How far ahead prayer reminders are pre-scheduled. */
export const REMINDER_HORIZON_DAYS = 7;

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function platformName(): string {
  try {
    return Capacitor.getPlatform();
  } catch {
    return "web";
  }
}

/* ------------------------------------------------------------------ */
/* Status bar / back button / haptics                                  */
/* ------------------------------------------------------------------ */

/** Dark theme app on a dark background, so the status bar must use light text. */
export async function configureStatusBar(background = "#05060f"): Promise<void> {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: background });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    /* not fatal */
  }
}

/**
 * The app is a single screen: there is nothing to go "back" to, so the
 * hardware back button should close the app rather than leaving the user on a
 * blank page.
 */
export async function configureBackButton(): Promise<void> {
  if (!isNative()) return;
  try {
    await App.addListener("backButton", () => {
      void App.minimizeApp();
    });
  } catch {
    /* not fatal */
  }
}

export async function hapticImpact(style: ImpactStyle = ImpactStyle.Light): Promise<void> {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style });
  } catch {
    /* not fatal */
  }
}

export async function hapticNotification(type: NotificationType): Promise<void> {
  if (!isNative()) return;
  try {
    await Haptics.notification({ type });
  } catch {
    /* not fatal */
  }
}

/* ------------------------------------------------------------------ */
/* Notification permissions                                             */
/* ------------------------------------------------------------------ */

export type ReminderPermission = {
  /** Can the app post notifications at all (Android 13+ runtime permission)? */
  notifications: boolean;
  /** Can it use exact alarms so a reminder fires at the exact minute? */
  exactAlarms: boolean;
  /** True when running in a browser instead of the Android app. */
  web: boolean;
};

export async function getReminderPermissions(): Promise<ReminderPermission> {
  if (!isNative()) {
    const granted =
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted";
    return { notifications: granted, exactAlarms: granted, web: true };
  }
  let notifications = false;
  let exactAlarms = false;
  try {
    const status = await LocalNotifications.checkPermissions();
    notifications = status.display === "granted";
  } catch {
    /* ignore */
  }
  try {
    const exact = await LocalNotifications.checkExactNotificationSetting();
    exactAlarms = exact.exact_alarm === "granted";
  } catch {
    /* Android < 12 reports granted anyway; ignore failures */
  }
  return { notifications, exactAlarms, web: false };
}

/** Ask for POST_NOTIFICATIONS (Android 13+). Returns the new status. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative()) {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    try {
      return (await Notification.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  try {
    const status = await LocalNotifications.requestPermissions();
    return status.display === "granted";
  } catch {
    return false;
  }
}

/** Open the Android "Alarms & reminders" screen for this app. */
export async function openExactAlarmSettings(): Promise<void> {
  if (!isNative()) return;
  try {
    await LocalNotifications.changeExactNotificationSetting();
  } catch {
    /* not available on this Android version */
  }
}

/* ------------------------------------------------------------------ */
/* Notification channels + scheduling                                  */
/* ------------------------------------------------------------------ */

/**
 * Android 8+ plays notification sounds per *channel*, and the sound of an
 * existing channel can never be changed — so each reminder sound gets its own
 * channel and switching sound in the app simply starts using the other one.
 */
export async function ensureNotificationChannel(sound: SoundId = "chime"): Promise<string> {
  const channelId = `reminders-${sound}`;
  if (!isNative()) return channelId;
  try {
    await LocalNotifications.createChannel({
      id: channelId,
      name: `${sound} reminder`,
      description: "Prayer time reminders",
      importance: 4, // IMPORTANCE_HIGH — heads up banner
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: "#05060f",
      sound: `${sound}.wav`,
    });
  } catch {
    /* channel creation is best effort */
  }
  return channelId;
}

/**
 * Convert a wall-clock time in `timezone` on the calendar date of `date`
 * into a real JS Date. Done twice so DST transitions land correctly.
 */
function zonedTimeToDate(date: Date, timezone: string, minutes: number): Date {
  const wall = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
    0,
    0,
  );
  let instant = wall;
  for (let i = 0; i < 2; i += 1) {
    const offset = zoneOffsetMinutes(new Date(instant), timezone);
    instant = wall - offset * 60_000;
  }
  return new Date(instant);
}

export type ReminderItem = {
  key: PrayerKey;
  /** Minutes past midnight in the user's configured timezone. */
  minutes: number;
  enabled: boolean;
  /** "iqamah" makes the notification say jamaat instead of prayer time. */
  target?: "azan" | "iqamah";
};

/**
 * Replace every pending reminder with a freshly computed week of them.
 *
 * Called on app launch and whenever the location, calculation method, prayer
 * times or offsets change, so the alarms always match what the app displays.
 */
export async function schedulePrayerReminders(options: {
  remindersEnabled: boolean;
  sound: SoundId;
  timezone: string;
  use24Hour: boolean;
  /** Same times every day (legacy). Prefer `itemsForDate`. */
  items?: ReminderItem[];
  /**
   * Compute the times for one calendar date. Calibrated schedules move with
   * the sun, so every one of the next 7 days needs its own projection.
   */
  itemsForDate?: (date: Date) => ReminderItem[];
}): Promise<number> {
  if (!isNative()) return 0;

  const { remindersEnabled, sound, timezone, use24Hour, items, itemsForDate } = options;

  try {
    await LocalNotifications.cancelAll();
  } catch {
    /* ignore */
  }
  if (!remindersEnabled) return 0;

  const channelId = await ensureNotificationChannel(sound);
  if (!itemsForDate && (!items || items.length === 0)) return 0;

  const now = Date.now();
  const notifications: LocalNotificationSchema[] = [];

  for (let day = 0; day < REMINDER_HORIZON_DAYS; day += 1) {
    const date = new Date();
    date.setDate(date.getDate() + day);
    const dayItems = itemsForDate ? itemsForDate(date) : items ?? [];
    const active = dayItems.filter((item) => item.enabled && PRAYER_META[item.key].isPrayer);
    active.forEach((item, index) => {
      const at = zonedTimeToDate(date, timezone, item.minutes);
      if (at.getTime() <= now) return;
      const meta = PRAYER_META[item.key];
      const clock = formatMinutes(item.minutes, use24Hour);
      const jamaat = item.target === "iqamah";
      notifications.push({
        id: day * 10 + index + 1,
        title: `${meta.icon} ${meta.label}${jamaat ? " jamaat" : " time"}`,
        body: `It is ${clock} — ${jamaat ? "jamaat for" : "time for"} ${meta.label}.`,
        channelId,
        smallIcon: "ic_stat_multitrack",
        extra: { prayerKey: item.key, target: item.target ?? "azan" },
        schedule: { at, allowWhileIdle: true },
      });
    });
  }

  if (notifications.length === 0) return 0;

  try {
    const result = await LocalNotifications.schedule({ notifications });
    return result.notifications.length;
  } catch {
    return 0;
  }
}

/** Remove every scheduled reminder (used when the user switches them off). */
export async function cancelPrayerReminders(): Promise<void> {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancelAll();
  } catch {
    /* ignore */
  }
}

export async function pendingReminderCount(): Promise<number> {
  if (!isNative()) return 0;
  try {
    const { notifications } = await LocalNotifications.getPending();
    return notifications.length;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/* Location                                                             */
/* ------------------------------------------------------------------ */

export type Coords = { latitude: number; longitude: number; accuracy: number };

/**
 * Ask for the device position. Returns `null` when the permission is denied
 * or the lookup fails — the caller falls back to manual city search.
 */
export async function getCurrentPosition(): Promise<Coords | null> {
  if (!isNative()) {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
      );
    });
  }

  try {
    let status = await Geolocation.checkPermissions();
    if (status.location !== "granted") {
      status = await Geolocation.requestPermissions();
      if (status.location !== "granted") return null;
    }
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 10000,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
  } catch {
    return null;
  }
}