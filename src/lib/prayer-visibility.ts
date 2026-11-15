import type { CalibratedScheduleItem } from "./calibration";
import { PRAYER_META } from "./prayer";

/**
 * What the prayer UI is allowed to show when the server could not read the
 * user's saved settings.
 *
 * A fallback location (Dhaka) produces *plausible looking* times for the wrong
 * place. Showing them with a warning above is not enough — the times themselves
 * must disappear, and no reminder may fire from them. When the settings are
 * readable again the caller simply passes `verified: true` and the normal
 * schedule returns; nothing is written either way, so saved preferences and
 * calibration data are never at risk.
 */
export const PRAYER_SCHEDULE_UNAVAILABLE_MESSAGE =
  "Prayer schedule temporarily unavailable — your saved location, times and calibration are safe.";

export const PRAYER_SCHEDULE_UNAVAILABLE_DETAIL =
  "The server could not load your saved settings, so times calculated for another location are withheld instead of being shown as yours. They will reappear as soon as the database is reachable.";

/** The schedule to render; empty when the settings were not verified. */
export function visiblePrayerSchedule(
  items: CalibratedScheduleItem[],
  verified: boolean,
): CalibratedScheduleItem[] {
  return verified ? items : [];
}

/** Prayers that may fire a reminder; none when the settings were not verified. */
export function reminderPrayers(
  items: CalibratedScheduleItem[],
  verified: boolean,
): CalibratedScheduleItem[] {
  if (!verified) return [];
  return items.filter((item) => item.reminder && PRAYER_META[item.key].isPrayer);
}
