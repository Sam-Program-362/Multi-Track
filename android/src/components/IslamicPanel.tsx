"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  METHODS,
  PRAYER_META,
  PRAYER_ORDER,
  computePrayerTimes,
  formatMinutes,
  minutesToInputValue,
  parseTimeToMinutes,
  type MethodKey,
  type PrayerKey,
} from "@/lib/prayer";
import { upcomingIslamicEvents } from "@/lib/islamicEvents";
import { toHijri } from "@/lib/calendars";
import { zoneOffsetMinutes } from "@/lib/timezones";
import {
  SOUNDS,
  notify,
  playSound,
  unlockAudio,
  vibrate,
  type SoundId,
} from "@/lib/alarm";
import {
  hapticNotification,
  isNative,
  requestNotificationPermission,
} from "@/lib/native";
import { NotificationType } from "@capacitor/haptics";
import type { PrayerPref, Settings } from "@/lib/types";
import { Panel, SectionTitle, Toggle, Touchable } from "./ui";

export type ScheduleItem = {
  key: PrayerKey;
  minutes: number;
  custom: boolean;
  offset: number;
  reminder: boolean;
};

export function buildSchedule(
  date: Date,
  settings: Settings,
  prefs: PrayerPref[],
): ScheduleItem[] {
  const tzHours = zoneOffsetMinutes(date, settings.timezone) / 60;
  const times = computePrayerTimes(date, {
    latitude: settings.latitude,
    longitude: settings.longitude,
    timezoneOffsetHours: tzHours,
    method: settings.method as MethodKey,
    asrJuristic: settings.asrJuristic,
  });
  const prefMap = new Map(prefs.map((p) => [p.prayerKey, p]));
  return PRAYER_ORDER.map((key) => {
    const pref = prefMap.get(key);
    const customMinutes = pref?.customTime ? parseTimeToMinutes(pref.customTime) : null;
    const base = customMinutes ?? Math.round(times[key] * 60);
    const offset = pref?.offsetMinutes ?? 0;
    return {
      key,
      minutes: ((base + offset) % 1440 + 1440) % 1440,
      custom: customMinutes !== null,
      offset,
      reminder: pref?.reminderEnabled ?? true,
    };
  });
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
  onPref: (patch: PrayerPref) => Promise<void>;
}) {
  const [tab, setTab] = useState<"times" | "events" | "setup">("times");
  const [audioReady, setAudioReady] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  const [editing, setEditing] = useState<PrayerKey | null>(null);
  const [draftTime, setDraftTime] = useState("");
  const [draftOffset, setDraftOffset] = useState(0);

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
      const id = `${dayKey}:${item.key}`;
      if (firedRef.current.has(id)) return;
      const diff = nowMinutes - item.minutes;
      if (diff === 0 && now.getSeconds() < 8) {
        firedRef.current.add(id);
        const label = PRAYER_META[item.key].label;
        vibrate();
        void hapticNotification(NotificationType.Success);
        playSound((settings.reminderSound as SoundId) ?? "chime", 2);
        // On Android the scheduled notification is what actually reaches the user;
        // the web Notification API is only used in a browser.
        if (!isNative()) {
          notify(`${label} time`, `It is now ${formatMinutes(item.minutes, settings.use24Hour)} — time for ${label}.`);
        }
        setBanner(`🕌 ${label} — ${formatMinutes(item.minutes, settings.use24Hour)}`);
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

  const openEditor = (item: ScheduleItem) => {
    setEditing(item.key);
    setDraftTime(minutesToInputValue(item.minutes - item.offset));
    setDraftOffset(item.offset);
  };

  const saveEditor = async (item: ScheduleItem, clear = false) => {
    await onPref({
      prayerKey: item.key,
      customTime: clear ? null : draftTime || null,
      offsetMinutes: clear ? 0 : draftOffset,
      reminderEnabled: item.reminder,
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
                        {item.custom ? (
                          <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
                            custom
                          </span>
                        ) : null}
                        {item.offset !== 0 ? (
                          <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[9px]">
                            {item.offset > 0 ? "+" : ""}
                            {item.offset}m
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                        {meta.bangla}
                      </div>
                    </div>
                    <span className="text-base font-bold tabular-nums">
                      {formatMinutes(item.minutes, settings.use24Hour)}
                    </span>
                    {meta.isPrayer ? (
                      <>
                        <Toggle
                          checked={item.reminder}
                          label={`${meta.label} reminder`}
                          onChange={(next) =>
                            onPref({
                              prayerKey: item.key,
                              customTime: item.custom
                                ? minutesToInputValue(item.minutes - item.offset)
                                : null,
                              offsetMinutes: item.offset,
                              reminderEnabled: next,
                            })
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
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-[11px]">
                          <span style={{ color: "var(--muted)" }}>Custom time (overrides calculation)</span>
                          <input
                            type="time"
                            value={draftTime}
                            onChange={(e) => setDraftTime(e.target.value)}
                            className="mt-1 w-full rounded-xl border bg-white/10 px-3 py-2 text-sm"
                            style={{ borderColor: "var(--panel-border)" }}
                          />
                        </label>
                        <label className="text-[11px]">
                          <span style={{ color: "var(--muted)" }}>Minute adjustment ({draftOffset}m)</span>
                          <input
                            type="range"
                            min={-30}
                            max={30}
                            value={draftOffset}
                            onChange={(e) => setDraftOffset(Number(e.target.value))}
                            className="mt-3 w-full accent-[var(--accent)]"
                          />
                        </label>
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
              void hapticNotification(NotificationType.Success);
              playSound((settings.reminderSound as SoundId) ?? "chime", 2);
              setBanner("🔔 Test reminder — this is how alerts feel");
              window.setTimeout(() => setBanner(null), 8000);
            }}
            className="rounded-xl px-3 py-2.5 text-sm font-semibold"
            style={{ background: "var(--accent)", color: "#0b1020" }}
          >
            ▶️ Test alarm & vibration
          </Touchable>

          <p className="text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
            Times are computed astronomically for {settings.locationName} ({settings.timezone}). Tap ✎ on any
            prayer to set your own masjid jamaat time or nudge it by minutes; the reminder follows your custom
            time.{" "}
            {isNative()
              ? "On the Android app each reminder is scheduled as a real phone notification for the next 7 days, and this tone is used for it."
              : "In the browser this tone only plays while this tab is open — install the Android app for background reminders."}
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
