export type DayPhase = "dawn" | "morning" | "afternoon" | "evening" | "night";

export type PhaseTheme = {
  id: DayPhase;
  label: string;
  greeting: string;
  emoji: string;
  /** Layered CSS background for the page shell. */
  background: string;
  /** Glass panel tint. */
  panel: string;
  border: string;
  accent: string;
  accentSoft: string;
  text: string;
  muted: string;
  glow: string;
  ring: string;
};

export const PHASE_THEMES: Record<DayPhase, PhaseTheme> = {
  dawn: {
    id: "dawn",
    label: "Dawn",
    greeting: "Peaceful dawn",
    emoji: "🌄",
    background:
      "radial-gradient(1100px 620px at 15% -10%, #ffd3a5 0%, transparent 60%), radial-gradient(900px 520px at 90% 5%, #fda085 0%, transparent 55%), linear-gradient(175deg, #2b1c4b 0%, #6b4a7a 38%, #d98e7a 72%, #ffd9a0 100%)",
    panel: "rgba(255,255,255,0.14)",
    border: "rgba(255,255,255,0.28)",
    accent: "#ffb27a",
    accentSoft: "rgba(255,178,122,0.22)",
    text: "#fff6ec",
    muted: "rgba(255,246,236,0.72)",
    glow: "0 0 50px rgba(255,170,120,0.35)",
    ring: "rgba(255,196,140,0.85)",
  },
  morning: {
    id: "morning",
    label: "Morning",
    greeting: "Good morning",
    emoji: "🌅",
    background:
      "radial-gradient(1000px 600px at 12% -8%, #ffe27a 0%, transparent 58%), radial-gradient(900px 520px at 88% 0%, #7fd6ff 0%, transparent 60%), linear-gradient(170deg, #0f5c99 0%, #2e9bd6 40%, #7fd0ef 72%, #d8f4ff 100%)",
    panel: "rgba(255,255,255,0.18)",
    border: "rgba(255,255,255,0.35)",
    accent: "#ffd34d",
    accentSoft: "rgba(255,211,77,0.22)",
    text: "#f4fbff",
    muted: "rgba(244,251,255,0.78)",
    glow: "0 0 50px rgba(255,220,120,0.35)",
    ring: "rgba(255,226,122,0.9)",
  },
  afternoon: {
    id: "afternoon",
    label: "Afternoon",
    greeting: "Good afternoon",
    emoji: "☀️",
    background:
      "radial-gradient(1000px 560px at 80% -10%, #fff3b0 0%, transparent 55%), radial-gradient(900px 600px at 5% 20%, #6ee7ff 0%, transparent 60%), linear-gradient(165deg, #0b6fa4 0%, #1e9fd0 45%, #67c9e8 75%, #cdf1ff 100%)",
    panel: "rgba(255,255,255,0.17)",
    border: "rgba(255,255,255,0.32)",
    accent: "#ffe066",
    accentSoft: "rgba(255,224,102,0.22)",
    text: "#f7fdff",
    muted: "rgba(247,253,255,0.78)",
    glow: "0 0 50px rgba(255,235,150,0.32)",
    ring: "rgba(255,235,150,0.9)",
  },
  evening: {
    id: "evening",
    label: "Evening",
    greeting: "Good evening",
    emoji: "🌇",
    background:
      "radial-gradient(1000px 600px at 82% 0%, #ff8a5c 0%, transparent 58%), radial-gradient(900px 520px at 8% 10%, #b043a8 0%, transparent 60%), linear-gradient(175deg, #1a1440 0%, #4b2263 35%, #9c3f6d 65%, #ef7d54 100%)",
    panel: "rgba(255,255,255,0.13)",
    border: "rgba(255,255,255,0.24)",
    accent: "#ff9e6b",
    accentSoft: "rgba(255,158,107,0.2)",
    text: "#fff1e9",
    muted: "rgba(255,241,233,0.72)",
    glow: "0 0 55px rgba(255,130,90,0.35)",
    ring: "rgba(255,158,107,0.9)",
  },
  night: {
    id: "night",
    label: "Night",
    greeting: "Quiet night",
    emoji: "🌙",
    background:
      "radial-gradient(900px 520px at 78% 8%, #2b3f8f 0%, transparent 58%), radial-gradient(800px 480px at 10% 85%, #16305c 0%, transparent 60%), linear-gradient(180deg, #05060f 0%, #0a1030 45%, #101a44 75%, #16224f 100%)",
    panel: "rgba(255,255,255,0.08)",
    border: "rgba(255,255,255,0.16)",
    accent: "#8ab4ff",
    accentSoft: "rgba(138,180,255,0.18)",
    text: "#e9f0ff",
    muted: "rgba(233,240,255,0.66)",
    glow: "0 0 60px rgba(90,130,255,0.32)",
    ring: "rgba(138,180,255,0.85)",
  },
};

export function phaseForHour(hour: number): DayPhase {
  if (hour >= 4 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 20) return "evening";
  return "night";
}

export function themeVars(theme: PhaseTheme): Record<string, string> {
  return {
    "--app-bg": theme.background,
    "--panel": theme.panel,
    "--panel-border": theme.border,
    "--accent": theme.accent,
    "--accent-soft": theme.accentSoft,
    "--fg": theme.text,
    "--muted": theme.muted,
    "--glow": theme.glow,
    "--ring": theme.ring,
  };
}
