"use client";

import { useId, useMemo, useState } from "react";
import type { WorldClock } from "@/lib/types";
import {
  allTimezones,
  formatOffset,
  guessTimezone,
  relativeOffsetLabel,
  zoneOffsetMinutes,
  zoneParts,
} from "@/lib/timezones";
import { Panel, SectionTitle, Touchable } from "./ui";

const ACCENTS: Record<string, string> = {
  cyan: "#67e8f9",
  emerald: "#6ee7b7",
  violet: "#c4b5fd",
  amber: "#fcd34d",
  rose: "#fda4af",
  lime: "#bef264",
};

function pad(n: number) {
  return `${n}`.padStart(2, "0");
}

function AnalogClock({
  hour,
  minute,
  second,
  size = 150,
  color = "#67e8f9",
}: {
  hour: number;
  minute: number;
  second: number;
  size?: number;
  color?: string;
}) {
  const secAngle = second * 6;
  const minAngle = minute * 6 + second * 0.1;
  const hourAngle = (hour % 12) * 30 + minute * 0.5;
  const rawId = useId();
  const faceId = `face-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const isNight = hour >= 19 || hour < 6;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0">
      <defs>
        <radialGradient id={faceId} cx="50%" cy="35%">
          <stop offset="0%" stopColor={isNight ? "rgba(30,41,90,0.9)" : "rgba(255,255,255,0.22)"} />
          <stop offset="100%" stopColor="rgba(10,14,30,0.55)" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill={`url(#${faceId})`} stroke={color} strokeOpacity="0.5" strokeWidth="1.2" />
      {Array.from({ length: 60 }).map((_, i) => {
        const major = i % 5 === 0;
        const angle = (i * 6 * Math.PI) / 180;
        const outer = 44;
        const inner = major ? 38 : 41.5;
        return (
          <line
            key={i}
            x1={50 + outer * Math.sin(angle)}
            y1={50 - outer * Math.cos(angle)}
            x2={50 + inner * Math.sin(angle)}
            y2={50 - inner * Math.cos(angle)}
            stroke={major ? color : "rgba(255,255,255,0.35)"}
            strokeWidth={major ? 1.6 : 0.6}
            strokeLinecap="round"
          />
        );
      })}
      <g style={{ transition: "transform 300ms cubic-bezier(0.22,1,0.36,1)", transform: `rotate(${hourAngle}deg)`, transformOrigin: "50px 50px" }}>
        <line x1="50" y1="54" x2="50" y2="28" stroke="var(--fg)" strokeWidth="3.4" strokeLinecap="round" />
      </g>
      <g style={{ transition: "transform 300ms cubic-bezier(0.22,1,0.36,1)", transform: `rotate(${minAngle}deg)`, transformOrigin: "50px 50px" }}>
        <line x1="50" y1="56" x2="50" y2="17" stroke="var(--fg)" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g style={{ transition: second === 0 ? "none" : "transform 180ms cubic-bezier(0.34,1.56,0.64,1)", transform: `rotate(${secAngle}deg)`, transformOrigin: "50px 50px" }}>
        <line x1="50" y1="60" x2="50" y2="13" stroke={color} strokeWidth="1" strokeLinecap="round" />
      </g>
      <circle cx="50" cy="50" r="2.6" fill={color} />
      <circle cx="50" cy="50" r="1" fill="#0b1020" />
      <title>{`${pad(hour)}:${pad(minute)}:${pad(second)}`}</title>
    </svg>
  );
}

export default function ClockPanel({
  now,
  clocks,
  use24Hour,
  onAdd,
  onDelete,
  onToggleFormat,
}: {
  now: Date;
  clocks: WorldClock[];
  use24Hour: boolean;
  onAdd: (label: string, timezone: string, accent: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onToggleFormat: (next: boolean) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [accent, setAccent] = useState("cyan");
  const [selectedZone, setSelectedZone] = useState("");
  const [busy, setBusy] = useState(false);

  const deviceZone = useMemo(() => guessTimezone(), []);
  const zones = useMemo(() => allTimezones(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? zones.filter((z) => z.toLowerCase().includes(q)) : zones;
    return list.slice(0, 60);
  }, [query, zones]);

  const local = zoneParts(now, deviceZone);
  const localOffset = zoneOffsetMinutes(now, deviceZone);

  const displayTime = (h: number, m: number, s: number) =>
    use24Hour
      ? `${pad(h)}:${pad(m)}:${pad(s)}`
      : `${pad(h % 12 === 0 ? 12 : h % 12)}:${pad(m)}:${pad(s)} ${h >= 12 ? "PM" : "AM"}`;

  const submit = async () => {
    if (!selectedZone) return;
    setBusy(true);
    await onAdd(label.trim() || selectedZone.split("/").pop()!.replace(/_/g, " "), selectedZone, accent);
    setBusy(false);
    setPicker(false);
    setLabel("");
    setSelectedZone("");
    setQuery("");
  };

  return (
    <Panel className="p-4 sm:p-5" delay={160}>
      <SectionTitle
        icon="⏱️"
        title="Clocks"
        subtitle={`Device zone: ${deviceZone} · ${formatOffset(localOffset)}`}
        right={
          <Touchable
            onClick={() => onToggleFormat(!use24Hour)}
            className="rounded-xl border px-3 py-1.5 text-[11px] font-semibold"
            style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.08)" }}
          >
            {use24Hour ? "24H" : "12H"}
          </Touchable>
        }
      />

      <div
        className="flex flex-col items-center gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center"
        style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.06)" }}
      >
        <div className="relative">
          <div className="absolute inset-0 rounded-full" style={{ boxShadow: "var(--glow)" }} />
          <AnalogClock hour={local.hour} minute={local.minute} second={local.second} color="var(--accent)" />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <div className="text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--muted)" }}>
            Local device time
          </div>
          <div className="text-3xl font-bold tabular-nums sm:text-4xl">
            {displayTime(local.hour, local.minute, local.second)}
          </div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            {local.weekday}, {local.day} {local.month} {local.year}
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
            <span className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: "var(--accent-soft)" }}>
              {deviceZone}
            </span>
            <span className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: "rgba(255,255,255,0.08)" }}>
              {formatOffset(localOffset)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--muted)" }}>
          World clocks ({clocks.length})
        </h3>
        <Touchable
          onClick={() => setPicker((p) => !p)}
          className="rounded-xl border px-3 py-1.5 text-[11px] font-semibold"
          style={{ borderColor: "var(--panel-border)", background: picker ? "var(--accent)" : "var(--accent-soft)", color: picker ? "#0b1020" : "var(--fg)" }}
        >
          {picker ? "Close" : "+ Timezone"}
        </Touchable>
      </div>

      {picker ? (
        <div
          className="pop mt-3 rounded-2xl border p-3"
          style={{ borderColor: "var(--panel-border)", background: "rgba(0,0,0,0.25)" }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search timezone e.g. Riyadh, Tokyo…"
              className="w-full rounded-xl border bg-white/10 px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--panel-border)" }}
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Custom label (optional)"
              className="w-full rounded-xl border bg-white/10 px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--panel-border)" }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(ACCENTS).map(([key, color]) => (
              <button
                key={key}
                type="button"
                onClick={() => setAccent(key)}
                className="press h-6 w-6 rounded-full border-2"
                style={{ background: color, borderColor: accent === key ? "var(--fg)" : "transparent" }}
                aria-label={key}
              />
            ))}
          </div>
          <div className="scroll-x mt-2 max-h-52 overflow-y-auto rounded-xl border" style={{ borderColor: "var(--panel-border)" }}>
            {filtered.map((z) => {
              const off = zoneOffsetMinutes(now, z);
              const p = zoneParts(now, z);
              return (
                <button
                  key={z}
                  type="button"
                  onClick={() => setSelectedZone(z)}
                  className="press flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-xs last:border-b-0"
                  style={{
                    borderColor: "rgba(255,255,255,0.08)",
                    background: selectedZone === z ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <span className="truncate">{z.replace(/_/g, " ")}</span>
                  <span className="shrink-0 tabular-nums" style={{ color: "var(--muted)" }}>
                    {pad(p.hour)}:{pad(p.minute)} · {formatOffset(off)}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs" style={{ color: "var(--muted)" }}>
                No timezone matched “{query}”.
              </div>
            ) : null}
          </div>
          <Touchable
            onClick={submit}
            disabled={!selectedZone || busy}
            className="mt-3 w-full rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#0b1020" }}
          >
            {busy ? "Adding…" : selectedZone ? `Add ${selectedZone.split("/").pop()?.replace(/_/g, " ")}` : "Pick a timezone"}
          </Touchable>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {clocks.map((clock, i) => {
          const p = zoneParts(now, clock.timezone);
          const off = zoneOffsetMinutes(now, clock.timezone);
          const diff = off - localOffset;
          const color = ACCENTS[clock.accent] ?? ACCENTS.cyan;
          const isNight = p.hour >= 19 || p.hour < 6;
          return (
            <div
              key={clock.id}
              className="pop group relative flex items-center gap-3 rounded-2xl border p-3"
              style={{
                animationDelay: `${i * 60}ms`,
                borderColor: "var(--panel-border)",
                background: isNight ? "rgba(12,18,44,0.45)" : "rgba(255,255,255,0.09)",
              }}
            >
              <AnalogClock hour={p.hour} minute={p.minute} second={p.second} size={62} color={color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">{clock.label}</span>
                  <span className="text-[11px]">{isNight ? "🌙" : "☀️"}</span>
                </div>
                <div className="text-lg font-bold tabular-nums leading-tight" style={{ color }}>
                  {displayTime(p.hour, p.minute, p.second)}
                </div>
                <div className="truncate text-[10px]" style={{ color: "var(--muted)" }}>
                  {p.weekday} {p.day} {p.month} · {formatOffset(off)} · {relativeOffsetLabel(diff)}
                </div>
              </div>
              {clock.id > 0 ? (
                <Touchable
                  onClick={() => onDelete(clock.id)}
                  className="h-7 w-7 shrink-0 rounded-lg border text-xs opacity-60 transition-opacity group-hover:opacity-100"
                  style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.08)" }}
                  aria-label={`Remove ${clock.label}`}
                >
                  ✕
                </Touchable>
              ) : null}
            </div>
          );
        })}
        {clocks.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-center text-xs sm:col-span-2" style={{ borderColor: "var(--panel-border)", color: "var(--muted)" }}>
            No world clocks yet — tap “+ Timezone” to add one.
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
