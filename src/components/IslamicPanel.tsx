"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { METHODS, PRAYER_META, formatMinutes, type MethodKey } from "@/lib/prayer";
import {
  HIGH_LATITUDE_CHOICES,
  IQAMAH_MODES,
  STEP_CHOICES,
  TRACKING_MODES,
  buildSchedule as buildCalibratedSchedule,
  calibrationSummary,
  captureOffsetMinutes,
  dateKey,
  defaultIqamah,
  describeRule,
  describeIqamah,
  normalizeIqamah,
  resolveIqamah,
  detectedTimezone,
  formatClock,
  parseClock,
  projectMinutes,
  ruleBadge,
  stepJumpMinutes,
  timezoneDrift,
  type CalibratedScheduleItem,
  type IqamahRule,
  type PrayerRule,
  type ReminderTarget,
  type TrackingMode,
} from "@/lib/calibration";
import { upcomingIslamicEvents } from "@/lib/islamicEvents";
import { toHijri } from "@/lib/calendars";
import { zoneOffsetMinutes } from "@/lib/timezones";
import {
  SOUNDS,
  notify,
  playSound,
  requestNotificationPermission,
  unlockAudio,
  vibrate,
  type SoundId,
} from "@/lib/alarm";
import type { PrayerPref, Settings } from "@/lib/types";
import { Panel, SectionTitle, Toggle, Touchable } from "./ui";

/** One row of the day's schedule, with its astronomical baseline and rule. */
export type ScheduleItem = CalibratedScheduleItem;

/**
 * Save-time hints that travel with a preference but are not stored:
 * - recalibrate: the typed clock time is a calibration event, not just audit
 * - reset: wipe the stored rule and audit time
 */
export type PrayerPrefWriteHints = { recalibrate?: boolean; reset?: boolean };

/**
 * The day's times: astronomical baseline for `date` projected through each
 * prayer's stored calibration rule (see `lib/calibration.ts`).
 */
export function buildSchedule(
  date: Date,
  settings: Settings,
  prefs: PrayerPref[],
): ScheduleItem[] {
  return buildCalibratedSchedule(date, settings, prefs);
}

function minutesNowIn(date: Date, timezone: string): number {
  const off = zoneOffsetMinutes(date, timezone);
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return ((utcMinutes + off) % 1440 + 1440) % 1440;
}

export default function IslamicPanel({
  now,
  settings,
  prefs,
  onSettings,
  onPref,
}: {
  now: Date;
  settings: Settings;
  prefs: PrayerPref[];
  onSettings: (patch: Partial<Settings>) => Promise<void>;
  onPref: (patch: PrayerPref & PrayerPrefWriteHints) => Promise<void>;
}) {
  const [tab, setTab] = useState<"times" | "events" | "setup">("times");
  const [audioReady, setAudioReady] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState<TrackingMode>("dynamicOffset");
  const [draftStep, setDraftStep] = useState<number>(10);
  const [draftTime, setDraftTime] = useState("");
  const [draftOffset, setDraftOffset] = useState(0);
  const [draftIqamah, setDraftIqamah] = useState<IqamahRule>(defaultIqamah());
  const [draftReminderAt, setDraftReminderAt] = useState<ReminderTarget>("azan");
  const [tzDismissed, setTzDismissed] = useState(false);

  const today = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    [now.getFullYear(), now.getMonth(), now.getDate()], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const schedule = useMemo(
    () => buildSchedule(today, settings, prefs),
    [today, settings, prefs],
  );

  const nowMinutes = minutesNowIn(now, settings.timezone);
  const nowSeconds = nowMinutes * 60 + now.getSeconds();

  const prayerOnly = schedule.filter((s) => PRAYER_META[s.key].isPrayer);
  const nextItem =
    schedule.find((s) => s.minutes > nowMinutes) ??
    (schedule.length ? { ...schedule[0], minutes: schedule[0].minutes + 1440 } : null);
  const prevItem =
    [...schedule].reverse().find((s) => s.minutes <= nowMinutes) ??
    (schedule.length
      ? { ...schedule[schedule.length - 1], minutes: schedule[schedule.length - 1].minutes - 1440 }
      : null);

  const countdownSeconds = nextItem ? nextItem.minutes * 60 - nowSeconds : 0;
  const totalSpan =
    nextItem && prevItem ? Math.max(1, (nextItem.minutes - prevItem.minutes) * 60) : 1;
  const elapsed = prevItem ? nowSeconds - prevItem.minutes * 60 : 0;
  const progress = Math.min(1, Math.max(0, elapsed / totalSpan));

  const events = useMemo(() => upcomingIslamicEvents(today, 400), [today]);
  const hijriToday = useMemo(() => toHijri(today), [today]);

  // Reminder engine
  useEffect(() => {
    if (!settings.remindersEnabled) return;
    const dayKey = today.toDateString();
    schedule.forEach((item) => {
      if (!item.reminder || !PRAYER_META[item.key].isPrayer) return;
      const id = `${dayKey}:${item.key}:${item.reminderAt}`;
      if (firedRef.current.has(id)) return;
      const at = item.reminderMinutes;
      const diff = nowMinutes - at;
      if (diff === 0 && now.getSeconds() < 8) {
        firedRef.current.add(id);
        const label = PRAYER_META[item.key].label;
        vibrate();
        playSound((settings.reminderSound as SoundId) ?? "chime", 2);
        notify(
          `${label} ${item.reminderAt === "iqamah" ? "jamaat" : "time"}`,
          `It is now ${formatMinutes(at, settings.use24Hour)} — ${
            item.reminderAt === "iqamah" ? "jamaat for" : "time for"
          } ${label}.`,
        );
        setBanner(
          `🕌 ${label}${item.reminderAt === "iqamah" ? " jamaat" : ""} — ${formatMinutes(at, settings.use24Hour)}`,
        );
        window.setTimeout(() => setBanner(null), 25000);
      }
    });
  }, [nowMinutes, now, schedule, settings.remindersEnabled, settings.reminderSound, settings.use24Hour, today]);

  const enableAlerts = async () => {
    const ok = await unlockAudio();
    await requestNotificationPermission();
    setAudioReady(ok);
    playSound((settings.reminderSound as SoundId) ?? "chime", 1);
    vibrate([60, 40, 60]);
  };

  /** The rule as it currently stands in the editor (used by the preview). */
  const draftRule: PrayerRule = {
    mode: draftMode,
    offsetMin: draftOffset,
    stepMin: draftMode === "steppedOffset" ? draftStep : 0,
    fixedClock: draftMode === "fixedClock" ? draftTime : null,
    calibratedAt: null,
  };

  const openEditor = (item: ScheduleItem) => {
    setEditing(item.key);
    setDraftMode(item.mode);
    setDraftStep(item.stepMinutes || 10);
    setDraftOffset(item.offsetMinutes);
    setDraftTime(formatClock(item.minutes));
    setDraftIqamah(normalizeIqamah(item.iqamahRule));
    setDraftReminderAt(item.reminderAt);
  };

  /** Switching mode re-projects the visible time, so the editor stays WYSIWYG. */
  const changeMode = (item: ScheduleItem, next: TrackingMode) => {
    setDraftMode(next);
    if (next === "fixedClock") return; // pin whatever time is currently shown
    setDraftTime(
      formatClock(
        projectMinutes(item.astroMinutes, {
          mode: next,
          offsetMin: draftOffset,
          stepMin: draftStep,
          fixedClock: null,
        }),
      ),
    );
  };

  /** ±1 minute nudge on Δuser, kept in step with the visible clock time. */
  const nudgeDraft = (item: ScheduleItem, delta: number) => {
    if (draftMode === "fixedClock") {
      setDraftTime(formatClock((parseClock(draftTime) ?? item.minutes) + delta));
      return;
    }
    const nextOffset = draftOffset + delta;
    setDraftOffset(nextOffset);
    setDraftTime(
      formatClock(
        projectMinutes(item.astroMinutes, {
          mode: draftMode,
          offsetMin: nextOffset,
          stepMin: draftStep,
          fixedClock: null,
        }),
      ),
    );
  };

  /** Azan minute the editor is currently previewing (jamaat section needs it). */
  const draftAzan = (item: ScheduleItem): number => {
    if (draftMode === "fixedClock") return parseClock(draftTime) ?? item.minutes;
    return projectMinutes(item.astroMinutes, {
      mode: draftMode,
      offsetMin: draftOffset,
      stepMin: draftStep,
      fixedClock: null,
    });
  };

  const prefFromItem = (
    item: ScheduleItem,
    patch: Partial<PrayerPref> = {},
  ): PrayerPref => {
    const existing = prefs.find((p) => p.prayerKey === item.key);
    return {
      prayerKey: item.key,
      mode: item.mode,
      offsetMinutes: item.offsetMinutes,
      stepMinutes: item.stepMinutes,
      fixedTime: item.fixedClock,
      customTime: existing?.customTime ?? null,
      calibratedAt: item.rule.calibratedAt,
      reminderEnabled: item.reminder,
      iqamah: item.iqamahRule,
      reminderAt: item.reminderAt,
      ...patch,
    };
  };

  const saveEditor = async (item: ScheduleItem, clear = false) => {
    const existing = prefs.find((p) => p.prayerKey === item.key);
    const calibratedToday = dateKey(now);

    if (clear) {
      await onPref({
        prayerKey: item.key,
        mode: "dynamicOffset",
        offsetMinutes: 0,
        stepMinutes: 0,
        fixedTime: null,
        customTime: null,
        calibratedAt: null,
        reminderEnabled: item.reminder,
        iqamah: normalizeIqamah(draftIqamah),
        reminderAt: draftReminderAt,
        reset: true,
      });
      setEditing(null);
      return;
    }

    if (draftMode === "fixedClock") {
      const fixed = parseClock(draftTime);
      if (fixed === null) return;
      await onPref({
        prayerKey: item.key,
        mode: "fixedClock",
        offsetMinutes: 0,
        stepMinutes: 0,
        fixedTime: formatClock(fixed),
        customTime: existing?.customTime ?? null,
        calibratedAt: calibratedToday,
        reminderEnabled: item.reminder,
        iqamah: normalizeIqamah(draftIqamah),
        reminderAt: draftReminderAt,
      });
      setEditing(null);
      return;
    }

    // If the clock field no longer matches the projection of the stored Δuser,
    // the user typed a new masjid time: that is a fresh calibration event.
    const projected = projectMinutes(item.astroMinutes, {
      mode: draftMode,
      offsetMin: draftOffset,
      stepMin: draftStep,
      fixedClock: null,
    });
    const typedRaw = parseClock(draftTime);
    // Mosque-step mode only ever shows grid times, so snap what was typed
    // before comparing it with the projection (otherwise a typed 05:17 would
    // look like a new calibration while the row renders 05:30).
    const typed =
      typedRaw !== null && draftMode === "steppedOffset"
        ? stepJumpMinutes(typedRaw, draftStep)
        : typedRaw;
    const retyped = typed !== null && typed !== projected;
    // A freshly typed time is calibrated now (Δuser = typed − sun today).
    // Nudges and mode changes keep the existing offset untouched.
    const offsetMinutes =
      retyped && typed !== null
        ? captureOffsetMinutes(typed, item.astroMinutes)
        : draftOffset;

    await onPref({
      prayerKey: item.key,
      mode: draftMode,
      offsetMinutes,
      stepMinutes: draftMode === "steppedOffset" ? draftStep : 0,
      fixedTime: null,
      customTime: retyped && typed !== null ? formatClock(typed) : existing?.customTime ?? null,
      calibratedAt: retyped
        ? calibratedToday
        : item.rule.calibratedAt ?? calibratedToday,
      reminderEnabled: item.reminder,
      iqamah: normalizeIqamah(draftIqamah),
      reminderAt: draftReminderAt,
      recalibrate: retyped,
    });
    setEditing(null);
  };

  return (
    <Panel className="p-4 sm:p-5" delay={320}>
      <SectionTitle
        icon="🕌"
        title="Islamic Tracker"
        subtitle={`${hijriToday.day} ${hijriToday.monthName} ${hijriToday.year} AH · ${METHODS[settings.method as MethodKey]?.name ?? ""}`}
        right={
          <div className="flex gap-1">
            {(["times", "events", "setup"] as const).map((t) => (
              <Touchable
                key={t}
                onClick={() => setTab(t)}
                className="rounded-xl px-2.5 py-1.5 text-[11px] font-semibold capitalize"
                style={{
                  background: tab === t ? "var(--accent)" : "rgba(255,255,255,0.08)",
                  color: tab === t ? "#0b1020" : "var(--fg)",
                }}
              >
                {t}
              </Touchable>
            ))}
          </div>
        }
      />

      {banner ? (
        <div
          className="ring-flash pop mb-3 flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-sm font-semibold"
          style={{ background: "var(--accent)", color: "#0b1020" }}
        >
          <span>{banner}</span>
          <button type="button" className="press text-xs" onClick={() => setBanner(null)}>
            ✕
          </button>
        </div>
      ) : null}

      {timezoneDrift(settings.timezone, detectedTimezone()) && !tzDismissed ? (
        <div
          className="fade mb-3 rounded-2xl border px-3 py-2 text-[11px]"
          style={{ borderColor: "var(--ring)", background: "var(--accent-soft)" }}
        >
          <div className="text-xs font-semibold">📍 Your device is in {detectedTimezone()}</div>
          <div className="mt-0.5" style={{ color: "var(--muted)" }}>
            Your saved location uses {settings.timezone}. Only the time zone changes — every
            calibrated offset Δuser stays exactly as it is.
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Touchable
              onClick={async () => {
                await onSettings({ timezone: detectedTimezone() });
                setTzDismissed(true);
              }}
              className="rounded-xl px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: "var(--accent)", color: "#0b1020" }}
            >
              Use {detectedTimezone()}
            </Touchable>
            <Touchable
              onClick={() => setTzDismissed(true)}
              className="rounded-xl border px-2.5 py-1 text-[11px] font-semibold"
              style={{ borderColor: "var(--panel-border)" }}
            >
              Not now
            </Touchable>
          </div>
        </div>
      ) : null}

      {tab === "times" ? (
        <>
          <div
            className="relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4"
            style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.07)" }}
          >
            <ProgressRing progress={progress} label={nextItem ? PRAYER_META[nextItem.key].icon : "🕌"} />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--muted)" }}>
                Next
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold">
                  {nextItem ? PRAYER_META[nextItem.key].label : "—"}
                </span>
                <span className="text-sm" dir="rtl" style={{ color: "var(--muted)" }}>
                  {nextItem ? PRAYER_META[nextItem.key].arabic : ""}
                </span>
              </div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--accent)" }}>
                {formatCountdown(countdownSeconds)}
              </div>
              <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                at {nextItem ? formatMinutes(nextItem.minutes, settings.use24Hour) : "—"} ·{" "}
                {prevItem ? `since ${PRAYER_META[prevItem.key].label}` : ""}
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-1.5">
            {schedule.map((item, i) => {
              const meta = PRAYER_META[item.key];
              const isNext = nextItem?.key === item.key;
              const passed = item.minutes <= nowMinutes;
              return (
                <div
                  key={item.key}
                  className="pop rounded-2xl border"
                  style={{
                    animationDelay: `${i * 50}ms`,
                    borderColor: isNext ? "var(--ring)" : "var(--panel-border)",
                    background: isNext ? "var(--accent-soft)" : "rgba(255,255,255,0.05)",
                  }}
                >
                  <div className="flex items-center gap-3 p-2.5">
                    <span className="text-xl">{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${passed && !isNext ? "opacity-60" : ""}`}>
                          {meta.label}
                        </span>
                        <span className="text-[11px]" dir="rtl" style={{ color: "var(--muted)" }}>
                          {meta.arabic}
                        </span>
                        {ruleBadge(item.rule) ? (
                          <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
                            {ruleBadge(item.rule)}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                        {meta.bangla}
                      </div>
                    </div>
                    <span className="text-right">
                      <span className="block text-base font-bold tabular-nums">
                        {formatMinutes(item.minutes, settings.use24Hour)}
                      </span>
                      {item.iqamahMinutes !== null ? (
                        <span
                          className="block text-[10px] tabular-nums"
                          style={{ color: "var(--muted)" }}
                        >
                          jamaat {formatMinutes(item.iqamahMinutes, settings.use24Hour)}
                        </span>
                      ) : null}
                    </span>
                    {meta.isPrayer ? (
                      <>
                        <Toggle
                          checked={item.reminder}
                          label={`${meta.label} reminder`}
                          onChange={(next) =>
                            onPref(prefFromItem(item, { reminderEnabled: next }))
                          }
                        />
                        <Touchable
                          onClick={() => (editing === item.key ? setEditing(null) : openEditor(item))}
                          className="h-7 w-7 rounded-lg border text-[11px]"
                          style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.08)" }}
                          aria-label={`Edit ${meta.label}`}
                        >
                          ✎
                        </Touchable>
                      </>
                    ) : (
                      <span className="w-[76px]" />
                    )}
                  </div>

                  {editing === item.key ? (
                    <div className="fade border-t px-3 py-3" style={{ borderColor: "var(--panel-border)" }}>
                      <div className="flex flex-wrap gap-1.5">
                        {TRACKING_MODES.map((m) => (
                          <Touchable
                            key={m.id}
                            onClick={() => changeMode(item, m.id)}
                            className="rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold"
                            style={{
                              borderColor: "var(--panel-border)",
                              background:
                                draftMode === m.id ? "var(--accent)" : "rgba(255,255,255,0.07)",
                              color: draftMode === m.id ? "#0b1020" : "var(--fg)",
                            }}
                          >
                            {m.label}
                          </Touchable>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[10px]" style={{ color: "var(--muted)" }}>
                        {TRACKING_MODES.find((m) => m.id === draftMode)?.hint}
                      </p>

                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <label className="text-[11px]">
                          <span style={{ color: "var(--muted)" }}>
                            {draftMode === "fixedClock"
                              ? "Fixed clock time (never moves)"
                              : "Your masjid / jamaat time today"}
                          </span>
                          <input
                            type="time"
                            value={draftTime}
                            onChange={(e) => setDraftTime(e.target.value)}
                            className="mt-1 w-full rounded-xl border bg-white/10 px-3 py-2 text-sm"
                            style={{ borderColor: "var(--panel-border)" }}
                          />
                        </label>
                        <div className="text-[11px]">
                          <span style={{ color: "var(--muted)" }}>Calibration</span>
                          <div
                            className="mt-1 flex items-center gap-1.5 rounded-xl border px-2 py-1.5"
                            style={{ borderColor: "var(--panel-border)" }}
                          >
                            <span className="truncate font-semibold tabular-nums">
                              {draftMode === "fixedClock"
                                ? `fixed ${draftTime || "—"}`
                                : describeRule(draftRule)}
                            </span>
                            <span className="flex-1" />
                            <Touchable
                              onClick={() => nudgeDraft(item, -1)}
                              className="rounded-lg border px-2 py-0.5 text-[11px] font-bold"
                              style={{ borderColor: "var(--panel-border)" }}
                              aria-label="Subtract one minute"
                            >
                              −1
                            </Touchable>
                            <Touchable
                              onClick={() => nudgeDraft(item, 1)}
                              className="rounded-lg border px-2 py-0.5 text-[11px] font-bold"
                              style={{ borderColor: "var(--panel-border)" }}
                              aria-label="Add one minute"
                            >
                              +1
                            </Touchable>
                          </div>
                          <div className="mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
                            Sun today {formatClock(item.astroMinutes)}
                            {draftMode !== "fixedClock" ? (
                              <>
                                {" · "}
                                {draftOffset === 0
                                  ? "no offset saved"
                                  : `${draftOffset > 0 ? "+" : "−"}${Math.abs(draftOffset)} min saved`}
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {draftMode === "steppedOffset" ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span style={{ color: "var(--muted)" }}>Round up in steps of</span>
                          {STEP_CHOICES.map((step) => (
                            <Touchable
                              key={step}
                              onClick={() => {
                                setDraftStep(step);
                                setDraftTime(
                                  formatClock(
                                    projectMinutes(item.astroMinutes, {
                                      mode: "steppedOffset",
                                      offsetMin: draftOffset,
                                      stepMin: step,
                                      fixedClock: null,
                                    }),
                                  ),
                                );
                              }}
                              className="rounded-lg border px-2 py-1 font-semibold"
                              style={{
                                borderColor: "var(--panel-border)",
                                background:
                                  draftStep === step ? "var(--accent)" : "rgba(255,255,255,0.07)",
                                color: draftStep === step ? "#0b1020" : "var(--fg)",
                              }}
                            >
                              {step} min
                            </Touchable>
                          ))}
                        </div>
                      ) : null}

                      <div
                        className="mt-3 rounded-xl border p-2.5"
                        style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.03)" }}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-1">
                          <span className="text-[11px] font-semibold">Jamaat (congregation)</span>
                          <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                            jamaat only · never changes the azan
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {IQAMAH_MODES.map((m) => (
                            <Touchable
                              key={m.id}
                              onClick={() =>
                                setDraftIqamah((rule) => normalizeIqamah({ ...rule, mode: m.id }))
                              }
                              className="rounded-lg border px-2 py-1 text-[10px] font-semibold"
                              style={{
                                borderColor: "var(--panel-border)",
                                background:
                                  draftIqamah.mode === m.id
                                    ? "var(--accent)"
                                    : "rgba(255,255,255,0.07)",
                                color: draftIqamah.mode === m.id ? "#0b1020" : "var(--fg)",
                              }}
                            >
                              {m.label}
                            </Touchable>
                          ))}
                        </div>
                        <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
                          {IQAMAH_MODES.find((m) => m.id === draftIqamah.mode)?.hint}
                        </p>

                        {draftIqamah.mode === "delay" ? (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                            <span style={{ color: "var(--muted)" }}>Jamaat is</span>
                            <Touchable
                              onClick={() =>
                                setDraftIqamah((rule) =>
                                  normalizeIqamah({ ...rule, delayMin: Math.max(0, rule.delayMin - 5) }),
                                )
                              }
                              className="rounded-lg border px-2 py-0.5 font-bold"
                              style={{ borderColor: "var(--panel-border)" }}
                              aria-label="Five minutes earlier"
                            >
                              −5
                            </Touchable>
                            <span className="min-w-[52px] text-center font-semibold tabular-nums">
                              {draftIqamah.delayMin} min
                            </span>
                            <Touchable
                              onClick={() =>
                                setDraftIqamah((rule) =>
                                  normalizeIqamah({ ...rule, delayMin: rule.delayMin + 5 }),
                                )
                              }
                              className="rounded-lg border px-2 py-0.5 font-bold"
                              style={{ borderColor: "var(--panel-border)" }}
                              aria-label="Five minutes later"
                            >
                              +5
                            </Touchable>
                            <span style={{ color: "var(--muted)" }}>after the azan</span>
                          </div>
                        ) : null}

                        {draftIqamah.mode === "clock" ? (
                          <label className="mt-1.5 block text-[11px]">
                            <span style={{ color: "var(--muted)" }}>Jamaat clock time (same every day)</span>
                            <input
                              type="time"
                              value={draftIqamah.clock ?? ""}
                              onChange={(e) =>
                                setDraftIqamah((rule) =>
                                  normalizeIqamah({ ...rule, clock: e.target.value || null }),
                                )
                              }
                              className="mt-1 w-full rounded-xl border bg-white/10 px-3 py-2 text-sm"
                              style={{ borderColor: "var(--panel-border)" }}
                            />
                          </label>
                        ) : null}

                        {draftIqamah.mode === "table" ? (
                          <div className="mt-1.5 space-y-1.5">
                            <p className="text-[10px] leading-relaxed" style={{ color: "var(--muted)" }}>
                              Copy the jamaat dates from the mosque board. The newest entry on or
                              before a date applies; before the first entry the earliest one does.
                              This table changes the jamaat time only — the azan keeps following
                              the sun plus your offset.
                            </p>
                            {draftIqamah.table.length === 0 ? (
                              <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                                No entries yet — add the mosque&apos;s current jamaat time to start.
                              </p>
                            ) : null}
                            {draftIqamah.table.map((row, index) => (
                              <div key={`${row.from}-${index}`} className="flex items-center gap-1.5">
                                <input
                                  type="date"
                                  value={row.from}
                                  onChange={(e) =>
                                    setDraftIqamah((rule) => ({
                                      ...rule,
                                      table: rule.table.map((entry, i) =>
                                        i === index ? { ...entry, from: e.target.value } : entry,
                                      ),
                                    }))
                                  }
                                  className="min-w-0 flex-1 rounded-lg border bg-white/10 px-2 py-1 text-[11px]"
                                  style={{ borderColor: "var(--panel-border)" }}
                                  aria-label={`Effective date of jamaat entry ${index + 1}`}
                                />
                                <input
                                  type="time"
                                  value={row.clock ?? ""}
                                  onChange={(e) =>
                                    setDraftIqamah((rule) => ({
                                      ...rule,
                                      table: rule.table.map((entry, i) =>
                                        i === index
                                          ? {
                                              ...entry,
                                              clock: e.target.value || null,
                                              delayMin: e.target.value ? null : entry.delayMin,
                                            }
                                          : entry,
                                      ),
                                    }))
                                  }
                                  className="w-[104px] rounded-lg border bg-white/10 px-2 py-1 text-[11px]"
                                  style={{ borderColor: "var(--panel-border)" }}
                                  aria-label={`Jamaat time from entry ${index + 1}`}
                                />
                                <Touchable
                                  onClick={() =>
                                    setDraftIqamah((rule) => ({
                                      ...rule,
                                      table: rule.table.filter((_, i) => i !== index),
                                    }))
                                  }
                                  className="rounded-lg border px-2 py-1 text-[11px]"
                                  style={{ borderColor: "var(--panel-border)" }}
                                  aria-label={`Remove jamaat entry ${index + 1}`}
                                >
                                  ✕
                                </Touchable>
                              </div>
                            ))}
                            <Touchable
                              onClick={() =>
                                setDraftIqamah((rule) =>
                                  normalizeIqamah({
                                    ...rule,
                                    table: [
                                      ...rule.table,
                                      {
                                        from: dateKey(now),
                                        clock: formatClock(item.iqamahMinutes ?? item.minutes),
                                      },
                                    ],
                                  }),
                                )
                              }
                              className="rounded-lg border px-2 py-1 text-[10px] font-semibold"
                              style={{ borderColor: "var(--panel-border)" }}
                            >
                              + Add date
                            </Touchable>
                          </div>
                        ) : null}

                        {(() => {
                          const preview = resolveIqamah(
                            draftAzan(item),
                            normalizeIqamah(draftIqamah),
                            today,
                          );
                          const azanNow = draftAzan(item);
                          return (
                            <div className="mt-1.5 text-[10px] leading-relaxed" style={{ color: "var(--muted)" }}>
                              {preview ? (
                                <>
                                  azan {formatClock(azanNow)} · {describeIqamah(draftIqamah, preview)} →{" "}
                                  <strong style={{ color: "var(--fg)" }}>
                                    jamaat {formatClock(preview.minutes)}
                                  </strong>
                                </>
                              ) : (
                                <>No jamaat time will be shown for this prayer.</>
                              )}
                            </div>
                          );
                        })()}

                        {draftIqamah.mode !== "none" ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span style={{ color: "var(--muted)" }}>Remind me at</span>
                            {(["azan", "iqamah"] as const).map((target) => (
                              <Touchable
                                key={target}
                                onClick={() => setDraftReminderAt(target)}
                                className="rounded-lg border px-2 py-0.5 font-semibold"
                                style={{
                                  borderColor: "var(--panel-border)",
                                  background:
                                    draftReminderAt === target
                                      ? "var(--accent)"
                                      : "rgba(255,255,255,0.07)",
                                  color: draftReminderAt === target ? "#0b1020" : "var(--fg)",
                                }}
                              >
                                {target === "azan" ? "Azan" : "Jamaat"}
                              </Touchable>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-2 flex gap-2">
                        <Touchable
                          onClick={() => saveEditor(item)}
                          className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold"
                          style={{ background: "var(--accent)", color: "#0b1020" }}
                        >
                          Save
                        </Touchable>
                        <Touchable
                          onClick={() => saveEditor(item, true)}
                          className="rounded-xl border px-3 py-2 text-xs"
                          style={{ borderColor: "var(--panel-border)" }}
                        >
                          Reset
                        </Touchable>
                        <Touchable
                          onClick={() => setEditing(null)}
                          className="rounded-xl border px-3 py-2 text-xs"
                          style={{ borderColor: "var(--panel-border)" }}
                        >
                          Cancel
                        </Touchable>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--muted)" }}>
            <span>
              {prayerOnly.filter((p) => p.reminder).length}/{prayerOnly.length} reminders armed
            </span>
            <span aria-hidden>·</span>
            <span>{calibrationSummary(schedule)}</span>
            {!audioReady ? (
              <Touchable
                onClick={enableAlerts}
                className="rounded-xl border px-3 py-1.5 font-semibold"
                style={{ borderColor: "var(--panel-border)", background: "var(--accent-soft)", color: "var(--fg)" }}
              >
                🔊 Enable sound + vibration
              </Touchable>
            ) : (
              <span className="rounded-xl px-2 py-1" style={{ background: "var(--accent-soft)" }}>
                ✅ Alerts armed
              </span>
            )}
          </div>
        </>
      ) : null}

      {tab === "events" ? (
        <div className="grid gap-2">
          <div
            className="relative overflow-hidden rounded-2xl border p-4"
            style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.07)" }}
          >
            <div className="orb" style={{ width: 150, height: 150, right: -40, top: -60, background: "var(--accent)" }} />
            {events[0] ? (
              <div className="relative flex items-center gap-4">
                <span className="text-4xl">{events[0].icon}</span>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--muted)" }}>
                    Next Islamic event
                  </div>
                  <div className="text-lg font-bold">{events[0].name}</div>
                  <div className="text-sm" dir="rtl" style={{ color: "var(--muted)" }}>
                    {events[0].arabic}
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: "var(--accent)" }}>
                    {events[0].daysLeft === 0 ? "Today" : `${events[0].daysLeft} days left`}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                    {events[0].gregorianDate.toDateString()} · {events[0].hijriLabel}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          {events.slice(1).map((e, i) => (
            <div
              key={e.id}
              className="pop flex items-center gap-3 rounded-2xl border px-3 py-2.5"
              style={{
                animationDelay: `${i * 45}ms`,
                borderColor: "var(--panel-border)",
                background: "rgba(255,255,255,0.05)",
              }}
            >
              <span className="text-xl">{e.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{e.name}</div>
                <div className="truncate text-[10px]" style={{ color: "var(--muted)" }}>
                  {e.note} · {e.hijriLabel}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold tabular-nums" style={{ color: "var(--accent)" }}>
                  {e.daysLeft}d
                </div>
                <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                  {e.gregorianDate.toLocaleDateString([], { day: "numeric", month: "short", year: "2-digit" })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "setup" ? (
        <div className="grid gap-3">
          <Field label="Calculation method">
            <select
              value={settings.method}
              onChange={(e) => onSettings({ method: e.target.value as MethodKey })}
              className="w-full rounded-xl border bg-white/10 px-3 py-2 text-sm"
              style={{ borderColor: "var(--panel-border)" }}
            >
              {Object.entries(METHODS).map(([key, m]) => (
                <option key={key} value={key} className="bg-slate-900">
                  {m.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Asr juristic school">
            <div className="flex gap-2">
              {(["Standard", "Hanafi"] as const).map((j) => (
                <Touchable
                  key={j}
                  onClick={() => onSettings({ asrJuristic: j })}
                  className="flex-1 rounded-xl border px-3 py-2 text-xs font-semibold"
                  style={{
                    borderColor: "var(--panel-border)",
                    background: settings.asrJuristic === j ? "var(--accent)" : "rgba(255,255,255,0.07)",
                    color: settings.asrJuristic === j ? "#0b1020" : "var(--fg)",
                  }}
                >
                  {j === "Standard" ? "Standard (Shafi'i)" : "Hanafi"}
                </Touchable>
              ))}
            </div>
          </Field>

          <Field label="Elevation (metres, optional)">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={4000}
              step={10}
              value={settings.elevationMeters}
              onChange={(e) =>
                onSettings({ elevationMeters: Math.max(0, Number(e.target.value) || 0) })
              }
              className="w-full rounded-xl border bg-white/10 px-3 py-2 text-sm"
              style={{ borderColor: "var(--panel-border)" }}
              aria-label="Elevation above sea level in metres"
            />
            <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
              Raises the apparent horizon for sunrise and sunset — worth a few minutes in hill
              towns, no effect at sea level.
            </p>
          </Field>

          <Field label="High-latitude twilight rule">
            <div className="flex flex-wrap gap-1.5">
              {HIGH_LATITUDE_CHOICES.map((choice) => (
                <Touchable
                  key={choice.id}
                  onClick={() => onSettings({ highLatitudeRule: choice.id })}
                  className="rounded-lg border px-2 py-1 text-[11px] font-semibold"
                  style={{
                    borderColor: "var(--panel-border)",
                    background:
                      settings.highLatitudeRule === choice.id
                        ? "var(--accent)"
                        : "rgba(255,255,255,0.07)",
                    color: settings.highLatitudeRule === choice.id ? "#0b1020" : "var(--fg)",
                  }}
                >
                  {choice.label}
                </Touchable>
              ))}
            </div>
            <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
              {HIGH_LATITUDE_CHOICES.find((c) => c.id === settings.highLatitudeRule)?.hint}
            </p>
          </Field>

          <Field label="Reminder alert">
            <div className="flex items-center justify-between rounded-xl border px-3 py-2" style={{ borderColor: "var(--panel-border)" }}>
              <span className="text-xs">Vibration + sound at prayer time</span>
              <Toggle
                checked={settings.remindersEnabled}
                onChange={(next) => onSettings({ remindersEnabled: next })}
                label="reminders"
              />
            </div>
          </Field>

          <Field label="Alarm tone">
            <div className="grid grid-cols-2 gap-2">
              {SOUNDS.map((s) => (
                <Touchable
                  key={s.id}
                  onClick={async () => {
                    await unlockAudio();
                    setAudioReady(true);
                    await onSettings({ reminderSound: s.id });
                    playSound(s.id, 1);
                    vibrate([80, 50, 80]);
                  }}
                  className="rounded-xl border px-3 py-2 text-xs font-medium"
                  style={{
                    borderColor: "var(--panel-border)",
                    background: settings.reminderSound === s.id ? "var(--accent)" : "rgba(255,255,255,0.07)",
                    color: settings.reminderSound === s.id ? "#0b1020" : "var(--fg)",
                  }}
                >
                  {s.icon} {s.label}
                </Touchable>
              ))}
            </div>
          </Field>

          <Touchable
            onClick={() => {
              vibrate();
              playSound((settings.reminderSound as SoundId) ?? "chime", 2);
              setBanner("🔔 Test reminder — this is how alerts feel");
              window.setTimeout(() => setBanner(null), 8000);
            }}
            className="rounded-xl px-3 py-2.5 text-sm font-semibold"
            style={{ background: "var(--accent)", color: "#0b1020" }}
          >
            ▶️ Test alarm & vibration
          </Touchable>

          <div
            className="rounded-2xl border px-3 py-2 text-[11px] leading-relaxed"
            style={{
              borderColor: "var(--panel-border)",
              background: "rgba(255,255,255,0.05)",
              color: "var(--muted)",
            }}
          >
            <strong style={{ color: "var(--fg)" }}>Auto time adjustment</strong> — you never store a fixed
            clock time. Entering a masjid time once records your offset Δuser against that day&apos;s
            astronomical baseline; from then on every timer is rebuilt as
            <em> solar time today + Δuser</em>, so seasonal drift is followed automatically instead of
            leaving your reminders behind.
            <div className="mt-1">{calibrationSummary(schedule)}</div>
            <div className="mt-1">
              Sun data for {settings.locationName} ({settings.timezone}). Keep this tab open for in-app
              alarms to fire.
            </div>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
            Tapping ✎ on a prayer separates two different things. <strong>Azan (prayer begins)</strong>{" "}
            offers three tracking modes: <strong>auto</strong> (sun + your offset),{" "}
            <strong>mosque steps</strong> (clean 5/10/15 minute board) and <strong>fixed clock</strong>{" "}
            (Jumu&apos;ah pinned regardless of season); ±1 nudges your saved offset without
            recalibrating. <strong>Jamaat (congregation)</strong> is the mosque&apos;s own policy and is
            stored separately, so correcting it never moves the azan: a constant delay after the azan,
            a fixed clock time, or a <strong>seasonal table</strong> of dated entries copied from the
            mosque board. A single entered jamaat time is treated as a fixed clock — it is never
            stretched into a yearly pattern.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function formatCountdown(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${`${h}`.padStart(2, "0")}:${`${m}`.padStart(2, "0")}:${`${sec}`.padStart(2, "0")}`;
}

function ProgressRing({ progress, label }: { progress: number; label: string }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative grid h-[88px] w-[88px] shrink-0 place-items-center">
      <svg width="88" height="88" viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <span className="absolute text-2xl">{label}</span>
    </div>
  );
}
