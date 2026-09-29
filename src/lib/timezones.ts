const FALLBACK_ZONES = [
  "UTC",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "Asia/Dhaka",
  "Asia/Dubai",
  "Asia/Istanbul",
  "Asia/Jakarta",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Kuala_Lumpur",
  "Asia/Riyadh",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Europe/Rome",
  "Pacific/Auckland",
];

export function allTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    const list = intl.supportedValuesOf?.("timeZone");
    if (list && list.length) return list;
  } catch {
    /* ignore */
  }
  return FALLBACK_ZONES;
}

export type ZoneParts = {
  hour: number;
  minute: number;
  second: number;
  weekday: string;
  day: number;
  month: string;
  year: number;
  dayPeriod: string;
};

const cache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = cache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    cache.set(timeZone, f);
  }
  return f;
}

export function zoneParts(date: Date, timeZone: string): ZoneParts {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatterFor(timeZone).formatToParts(date);
  } catch {
    parts = formatterFor("UTC").formatToParts(date);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour"));
  return {
    hour: Number.isNaN(hour) ? 0 : hour,
    minute: Number(get("minute")) || 0,
    second: Number(get("second")) || 0,
    weekday: get("weekday"),
    day: Number(get("day")) || 1,
    month: get("month"),
    year: Number(get("year")) || date.getFullYear(),
    dayPeriod: Number(get("hour")) >= 12 ? "PM" : "AM",
  };
}

/** Offset of a timezone from UTC, in minutes, at the given instant. */
export function zoneOffsetMinutes(date: Date, timeZone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = dtf.formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    const asUTC = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    return Math.round((asUTC - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${`${m}`.padStart(2, "0")}` : ""}`;
}

export function relativeOffsetLabel(diffMinutes: number): string {
  if (diffMinutes === 0) return "Same time as you";
  const ahead = diffMinutes > 0;
  const abs = Math.abs(diffMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const parts = [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
  return `${parts} ${ahead ? "ahead" : "behind"}`;
}

export function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
