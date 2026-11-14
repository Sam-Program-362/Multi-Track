"use client";

import { useEffect, useState } from "react";
import { getDigitalClockParts } from "@/lib/widgetClock";

type Props = {
  /** Widget defaults to 12-hour time so the sun/half-moon meridiem is meaningful. */
  use24Hour?: boolean;
  size?: "preview" | "standalone";
  className?: string;
};

/**
 * Plain transparent digital clock.
 *
 * Design contract:
 * - hours/minutes are the dominant numerals; seconds render at exactly 0.5em
 * - no card, border or background behind the numerals (transparent surface)
 * - weekday, month and date on one quiet line below the time
 * - a sun (AM) or half moon (PM) replaces the AM/PM text
 */
export default function DigitalClockWidget({ use24Hour = false, size = "preview", className = "" }: Props) {
  // Start empty so server and client first paint match; tick only after mount.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timer: number | undefined;

    const tick = () => {
      const current = new Date();
      setNow(current);
      // Align the next tick to the next wall-clock second instead of drifting.
      timer = window.setTimeout(tick, 1000 - current.getMilliseconds() + 8);
    };

    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
      } else {
        tick();
      }
    };

    const initial = window.setTimeout(tick, 0);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(initial);
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const parts = now ? getDigitalClockParts(now, use24Hour) : null;

  return (
    <div
      className={`digital-clock-widget digital-clock-widget--${size} ${className}`}
      role="timer"
      aria-live="off"
      aria-label={parts ? `${parts.timeLabel}, ${parts.dateLabel}` : "Loading clock"}
    >
      <div className="digital-clock-widget__time" aria-hidden="true">
        <span>{parts?.hours ?? "--"}</span>
        <span className="digital-clock-widget__colon">:</span>
        <span>{parts?.minutes ?? "--"}</span>
        <span className="digital-clock-widget__small-group">
          <span className="digital-clock-widget__colon">:</span>
          <span className="digital-clock-widget__seconds">{parts?.seconds ?? "--"}</span>
        </span>
        {!use24Hour ? (
          <span className="digital-clock-widget__meridiem" title={parts?.meridiem ?? "AM"}>
            {parts?.meridiem === "PM" ? <HalfMoonIcon /> : <SunIcon />}
          </span>
        ) : null}
      </div>
      <div className="digital-clock-widget__date" aria-hidden="true">
        {parts?.dateLabel ?? " "}
      </div>
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </svg>
  );
}

function HalfMoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
    </svg>
  );
}
