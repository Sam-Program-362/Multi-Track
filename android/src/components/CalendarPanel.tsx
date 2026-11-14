"use client";

import { useMemo, useState } from "react";
import {
  ARABIC_WEEKDAYS,
  BANGLA_WEEKDAYS,
  GREGORIAN_MONTHS,
  WEEKDAYS_SHORT,
  buildMonthGrid,
  isoKey,
  spanLabel,
  toArabicDigits,
  toBangla,
  toBanglaDigits,
  toHijri,
} from "@/lib/calendars";
import { upcomingIslamicEvents } from "@/lib/islamicEvents";
import { Panel, SectionTitle, Touchable } from "./ui";

type Layer = "hijri" | "bangla";

export default function CalendarPanel({ now }: { now: Date }) {
  const today = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    [now.getFullYear(), now.getMonth(), now.getDate()], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));
  const [selected, setSelected] = useState<string>(isoKey(today));
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    hijri: true,
    bangla: true,
  });

  const cells = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month, today),
    [cursor.year, cursor.month, today],
  );

  const eventMap = useMemo(() => {
    const start = new Date(cursor.year, cursor.month - 1, 1);
    const events = upcomingIslamicEvents(start, 130);
    const map = new Map<string, { icon: string; name: string }>();
    events.forEach((e) => map.set(isoKey(e.gregorianDate), { icon: e.icon, name: e.name }));
    return map;
  }, [cursor.year, cursor.month]);

  const selectedCell = cells.find((c) => c.iso === selected) ?? cells.find((c) => c.isToday);
  const selDate = selectedCell?.date ?? today;
  const selHijri = toHijri(selDate);
  const selBangla = toBangla(selDate);

  const shift = (delta: number) => {
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  return (
    <Panel className="p-4 sm:p-5" delay={80}>
      <SectionTitle
        icon="🗓️"
        title="Tri-Calendar"
        subtitle="Gregorian · Hijri · Bangla in one grid"
        right={
          <div className="flex items-center gap-1">
            <Touchable
              onClick={() => shift(-1)}
              className="h-9 w-9 rounded-xl border text-sm"
              style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.07)" }}
            >
              ‹
            </Touchable>
            <Touchable
              onClick={() => {
                setCursor({ year: today.getFullYear(), month: today.getMonth() });
                setSelected(isoKey(today));
              }}
              className="h-9 rounded-xl border px-3 text-[11px] font-semibold"
              style={{ borderColor: "var(--panel-border)", background: "var(--accent-soft)" }}
            >
              Today
            </Touchable>
            <Touchable
              onClick={() => shift(1)}
              className="h-9 w-9 rounded-xl border text-sm"
              style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.07)" }}
            >
              ›
            </Touchable>
          </div>
        }
      />

      {/* Month headers for the three systems */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <HeaderCard
          tag="Gregorian"
          main={`${GREGORIAN_MONTHS[cursor.month]} ${cursor.year}`}
          tint="rgba(125,211,252,0.18)"
        />
        <HeaderCard tag="Hijri · هجري" main={spanLabel(cells, "hijri")} tint="rgba(134,239,172,0.16)" />
        <HeaderCard tag="Bangla · বঙ্গাব্দ" main={spanLabel(cells, "bangla")} tint="rgba(252,211,77,0.16)" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span style={{ color: "var(--muted)" }}>Overlays:</span>
        {(["hijri", "bangla"] as Layer[]).map((l) => (
          <Touchable
            key={l}
            onClick={() => setLayers((p) => ({ ...p, [l]: !p[l] }))}
            className="rounded-full border px-3 py-1 font-medium capitalize"
            style={{
              borderColor: "var(--panel-border)",
              background: layers[l] ? "var(--accent)" : "rgba(255,255,255,0.07)",
              color: layers[l] ? "#0b1020" : "var(--fg)",
            }}
          >
            {l === "hijri" ? "Hijri ٣" : "Bangla ৩"}
          </Touchable>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide sm:text-[11px]">
        {WEEKDAYS_SHORT.map((d, i) => (
          <div key={d} className="pb-1" style={{ color: i === 5 ? "var(--accent)" : "var(--muted)" }}>
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          const isSelected = cell.iso === selected;
          const evt = eventMap.get(cell.iso);
          const isFriday = cell.date.getDay() === 5;
          return (
            <Touchable
              key={cell.iso}
              onClick={() => setSelected(cell.iso)}
              className="pop relative flex aspect-square min-h-[52px] flex-col items-center justify-center rounded-xl border p-0.5"
              style={{
                animationDelay: `${Math.min(idx * 8, 260)}ms`,
                borderColor: cell.isToday ? "var(--ring)" : "var(--panel-border)",
                background: isSelected
                  ? "var(--accent)"
                  : cell.isToday
                    ? "var(--accent-soft)"
                    : cell.inMonth
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(255,255,255,0.02)",
                color: isSelected ? "#0b1020" : cell.inMonth ? "var(--fg)" : "var(--muted)",
                opacity: cell.inMonth ? 1 : 0.45,
              }}
            >
              <span
                className={`text-[13px] font-semibold leading-none sm:text-[15px] ${isFriday && !isSelected ? "underline decoration-dotted underline-offset-2" : ""}`}
              >
                {cell.gregorianDay}
              </span>
              <span className="mt-0.5 flex flex-col items-center leading-none">
                {layers.hijri ? (
                  <span className="text-[9px] opacity-90 sm:text-[10px]">
                    {toArabicDigits(cell.hijri.day)}
                  </span>
                ) : null}
                {layers.bangla ? (
                  <span className="text-[9px] opacity-90 sm:text-[10px]">{cell.bangla.dayBn}</span>
                ) : null}
              </span>
              {evt ? (
                <span className="absolute right-0.5 top-0.5 text-[9px]" title={evt.name}>
                  {evt.icon}
                </span>
              ) : null}
              {cell.isToday ? (
                <span
                  className="pulse-dot absolute bottom-1 h-1 w-1 rounded-full"
                  style={{ background: isSelected ? "#0b1020" : "var(--ring)" }}
                />
              ) : null}
            </Touchable>
          );
        })}
      </div>

      {/* Selected-day triple readout */}
      <div
        className="fade mt-4 rounded-2xl border p-3"
        key={selected}
        style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.06)" }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DetailBlock
            tag="Gregorian"
            lines={[
              `${WEEKDAYS_SHORT[selDate.getDay()]}, ${selDate.getDate()} ${GREGORIAN_MONTHS[selDate.getMonth()]} ${selDate.getFullYear()}`,
              `Week day ${selDate.getDay() + 1} · Day ${dayOfYear(selDate)} of year`,
            ]}
          />
          <DetailBlock
            tag="Hijri · التقويم الهجري"
            rtl
            lines={[
              `${ARABIC_WEEKDAYS[selDate.getDay()]} ${toArabicDigits(selHijri.day)} ${selHijri.monthNameAr} ${toArabicDigits(selHijri.year)}`,
              `${selHijri.day} ${selHijri.monthName} ${selHijri.year} AH`,
            ]}
          />
          <DetailBlock
            tag="Bangla · বঙ্গাব্দ"
            lines={[
              `${BANGLA_WEEKDAYS[selDate.getDay()]}, ${toBanglaDigits(selBangla.day)} ${selBangla.monthNameBn} ${toBanglaDigits(selBangla.year)}`,
              `${selBangla.day} ${selBangla.monthName} ${selBangla.year} BS`,
            ]}
          />
        </div>
        {eventMap.get(selected) ? (
          <div
            className="mt-3 rounded-xl px-3 py-2 text-xs font-medium"
            style={{ background: "var(--accent-soft)" }}
          >
            {eventMap.get(selected)!.icon} {eventMap.get(selected)!.name}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function dayOfYear(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

function HeaderCard({ tag, main, tint }: { tag: string; main: string; tint: string }) {
  return (
    <div
      className="rounded-2xl border px-3 py-2"
      style={{ borderColor: "var(--panel-border)", background: tint }}
    >
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {tag}
      </div>
      <div className="truncate text-sm font-semibold">{main}</div>
    </div>
  );
}

function DetailBlock({
  tag,
  lines,
  rtl,
}: {
  tag: string;
  lines: string[];
  rtl?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {tag}
      </div>
      <div className={`mt-1 text-sm font-semibold ${rtl ? "text-right" : ""}`} dir={rtl ? "rtl" : "ltr"}>
        {lines[0]}
      </div>
      <div className="text-[11px]" style={{ color: "var(--muted)" }}>
        {lines[1]}
      </div>
    </div>
  );
}
