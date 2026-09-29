"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PrayerPref, Settings, WorldClock } from "@/lib/types";
import { PHASE_THEMES, phaseForHour, themeVars, type DayPhase } from "@/lib/theme";
import {
  GREGORIAN_MONTHS,
  toArabicDigits,
  toBangla,
  toBanglaDigits,
  toHijri,
} from "@/lib/calendars";
import { guessTimezone } from "@/lib/timezones";
import Splash from "./Splash";
import CalendarPanel from "./CalendarPanel";
import ClockPanel from "./ClockPanel";
import WeatherPanel from "./WeatherPanel";
import IslamicPanel from "./IslamicPanel";
import { Touchable } from "./ui";
import InstallApp from "./InstallApp";

const PHASE_OPTIONS: Array<DayPhase | "auto"> = [
  "auto",
  "dawn",
  "morning",
  "afternoon",
  "evening",
  "night",
];

export default function Dashboard({
  initialSettings,
  initialClocks,
  initialPrefs,
}: {
  initialSettings: Settings;
  initialClocks: WorldClock[];
  initialPrefs: PrayerPref[];
}) {
  const [now, setNow] = useState(() => new Date());
  const [settings, setSettings] = useState(initialSettings);
  const [clocks, setClocks] = useState(initialClocks);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [override, setOverride] = useState<DayPhase | "auto">("auto");
  const [mounted, setMounted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const phase: DayPhase = override === "auto" ? phaseForHour(now.getHours()) : override;
  const theme = PHASE_THEMES[phase];

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const saveSettings = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
      try {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          setSettings((await res.json()) as Settings);
          flash("Saved ✓");
        }
      } catch {
        flash("Offline — change kept locally");
      }
    },
    [flash],
  );

  const addClock = useCallback(
    async (label: string, timezone: string, accent: string) => {
      try {
        const res = await fetch("/api/clocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, timezone, accent }),
        });
        if (res.ok) {
          const created = (await res.json()) as WorldClock;
          setClocks((prev) => [...prev, created]);
          flash(`${label} clock added`);
          return;
        }
      } catch {
        /* fall through */
      }
      setClocks((prev) => [
        ...prev,
        { id: -Date.now(), label, timezone, accent, sortOrder: prev.length + 1 },
      ]);
      flash("Added locally");
    },
    [flash],
  );

  const deleteClock = useCallback(
    async (id: number) => {
      setClocks((prev) => prev.filter((c) => c.id !== id));
      try {
        await fetch(`/api/clocks/${id}`, { method: "DELETE" });
      } catch {
        /* ignore */
      }
      flash("Clock removed");
    },
    [flash],
  );

  const savePref = useCallback(
    async (patch: PrayerPref) => {
      setPrefs((prev) => {
        const rest = prev.filter((p) => p.prayerKey !== patch.prayerKey);
        return [...rest, patch];
      });
      try {
        const res = await fetch("/api/prayers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          setPrefs((await res.json()) as PrayerPref[]);
          flash("Prayer time updated");
        }
      } catch {
        flash("Offline — kept locally");
      }
    },
    [flash],
  );

  const hijri = useMemo(() => toHijri(now), [now.getDate(), now.getMonth(), now.getFullYear()]); // eslint-disable-line react-hooks/exhaustive-deps
  const bangla = useMemo(() => toBangla(now), [now.getDate(), now.getMonth(), now.getFullYear()]); // eslint-disable-line react-hooks/exhaustive-deps

  const stars = useMemo(
    () =>
      Array.from({ length: 46 }).map((_, i) => ({
        id: i,
        left: (i * 37.7) % 100,
        top: (i * 53.3) % 92,
        size: (i % 3) + 1,
        delay: (i % 9) * 0.45,
      })),
    [],
  );

  const timeString = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !settings.use24Hour,
  });

  return (
    <div className="app-shell relative overflow-hidden" style={themeVars(theme) as React.CSSProperties}>
      <Splash />

      {/* Ambience */}
      <div className="stars" aria-hidden>
        {phase === "night" || phase === "dawn"
          ? stars.map((s) => (
              <span
                key={s.id}
                className="star"
                style={{
                  left: `${s.left}%`,
                  top: `${s.top}%`,
                  width: s.size,
                  height: s.size,
                  animationDelay: `${s.delay}s`,
                }}
              />
            ))
          : null}
        <span className="orb" style={{ width: 340, height: 340, left: "-6%", top: "12%", background: theme.accent }} />
        <span
          className="orb"
          style={{ width: 280, height: 280, right: "-4%", bottom: "8%", background: theme.ring, animationDelay: "4s" }}
        />
      </div>

      <main className="relative mx-auto max-w-6xl px-3 pb-16 pt-5 sm:px-5">
        {/* Header */}
        <header className="rise mb-4">
          <div
            className="glass relative overflow-hidden rounded-3xl p-4 sm:p-5"
            style={{ boxShadow: theme.glow }}
          >
            <div
              className="spin-slow absolute -right-16 -top-16 h-52 w-52 rounded-full opacity-25"
              style={{ background: `conic-gradient(from 0deg, transparent, ${theme.accent}, transparent)` }}
              aria-hidden
            />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src="/logo.svg" alt="" className="h-12 w-12 rounded-[14px] shadow-lg sm:h-14 sm:w-14" />
                <div>
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em]" style={{ color: theme.muted }}>
                    <span className="pulse-dot inline-block h-2 w-2 rounded-full" style={{ background: theme.accent }} />
                    {theme.greeting} {theme.emoji}
                  </div>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                    Multi-Track Dashboard
                  </h1>
                  <p className="text-xs sm:text-sm" style={{ color: theme.muted }}>
                    {settings.locationName} · {guessTimezone()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold tabular-nums sm:text-4xl" suppressHydrationWarning>
                  {mounted ? timeString : "--:--:--"}
                </div>
                <div className="text-[11px]" style={{ color: theme.muted }}>
                  {theme.label} mode · auto-themed
                </div>
              </div>
            </div>

            <div className="relative mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <DateChip
                tag="Gregorian"
                value={`${now.getDate()} ${GREGORIAN_MONTHS[now.getMonth()]} ${now.getFullYear()}`}
              />
              <DateChip
                tag="Hijri"
                value={`${toArabicDigits(hijri.day)} ${hijri.monthNameAr} ${toArabicDigits(hijri.year)}`}
                sub={`${hijri.day} ${hijri.monthName} ${hijri.year} AH`}
                rtl
              />
              <DateChip
                tag="Bangla"
                value={`${toBanglaDigits(bangla.day)} ${bangla.monthNameBn} ${toBanglaDigits(bangla.year)}`}
                sub={`${bangla.day} ${bangla.monthName} ${bangla.year} BS`}
              />
            </div>

            <div className="relative mt-4 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: theme.muted }}>
                Theme
              </span>
              {PHASE_OPTIONS.map((p) => (
                <Touchable
                  key={p}
                  onClick={() => setOverride(p)}
                  className="rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize"
                  style={{
                    borderColor: theme.border,
                    background: override === p ? theme.accent : "rgba(255,255,255,0.08)",
                    color: override === p ? "#0b1020" : theme.text,
                  }}
                >
                  {p}
                </Touchable>
              ))}
            </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <CalendarPanel now={now} />
          <ClockPanel
            now={now}
            clocks={clocks}
            use24Hour={settings.use24Hour}
            onAdd={addClock}
            onDelete={deleteClock}
            onToggleFormat={(next) => saveSettings({ use24Hour: next })}
          />
          <IslamicPanel
            now={now}
            settings={settings}
            prefs={prefs}
            onSettings={saveSettings}
            onPref={savePref}
          />
          <WeatherPanel settings={settings} onLocationChange={saveSettings} />
        </div>

        <footer className="mt-8 text-center text-[11px]" style={{ color: theme.muted }}>
          Tri-calendar · world clocks · live weather · salah reminders — all in one interface.
        </footer>
      </main>

      <InstallApp />

      {toast ? (
        <div
          className="pop fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-xs font-semibold shadow-xl"
          style={{ background: theme.accent, color: "#0b1020" }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function DateChip({
  tag,
  value,
  sub,
  rtl,
}: {
  tag: string;
  value: string;
  sub?: string;
  rtl?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border px-3 py-2"
      style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.07)" }}
    >
      <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--muted)" }}>
        {tag}
      </div>
      <div className={`text-sm font-semibold ${rtl ? "text-right" : ""}`} dir={rtl ? "rtl" : "ltr"}>
        {value}
      </div>
      {sub ? (
        <div className="text-[10px]" style={{ color: "var(--muted)" }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}
