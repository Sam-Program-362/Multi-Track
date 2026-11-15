"use client";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export async function unlockAudio(): Promise<boolean> {
  const c = getCtx();
  if (!c) return false;
  try {
    if (c.state === "suspended") await c.resume();
    // Silent tick to satisfy mobile autoplay policies.
    const osc = c.createOscillator();
    const gain = c.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.02);
    return true;
  } catch {
    return false;
  }
}

export type SoundId = "chime" | "adhan" | "bell" | "beep";

export const SOUNDS: { id: SoundId; label: string; icon: string }[] = [
  { id: "chime", label: "Soft chime", icon: "🔔" },
  { id: "adhan", label: "Adhan melody", icon: "🕌" },
  { id: "bell", label: "Temple bell", icon: "🛎️" },
  { id: "beep", label: "Alarm beep", icon: "⏰" },
];

type Note = { freq: number; start: number; dur: number; gain?: number; type?: OscillatorType };

const PATTERNS: Record<SoundId, Note[]> = {
  chime: [
    { freq: 880, start: 0, dur: 0.8 },
    { freq: 1108, start: 0.25, dur: 0.9 },
    { freq: 1318, start: 0.5, dur: 1.2 },
    { freq: 880, start: 1.2, dur: 1.4 },
  ],
  adhan: [
    { freq: 392, start: 0, dur: 0.55, type: "sine" },
    { freq: 440, start: 0.5, dur: 0.5 },
    { freq: 523, start: 0.95, dur: 0.75 },
    { freq: 466, start: 1.7, dur: 0.5 },
    { freq: 392, start: 2.15, dur: 1.1 },
    { freq: 349, start: 3.1, dur: 1.3 },
  ],
  bell: [
    { freq: 320, start: 0, dur: 2.4, type: "triangle", gain: 0.3 },
    { freq: 642, start: 0.02, dur: 2.0, gain: 0.18 },
    { freq: 963, start: 0.04, dur: 1.4, gain: 0.08 },
  ],
  beep: [
    { freq: 1046, start: 0, dur: 0.16, type: "square", gain: 0.18 },
    { freq: 1046, start: 0.28, dur: 0.16, type: "square", gain: 0.18 },
    { freq: 1046, start: 0.56, dur: 0.16, type: "square", gain: 0.18 },
    { freq: 1318, start: 0.9, dur: 0.4, type: "square", gain: 0.18 },
  ],
};

export function playSound(id: SoundId = "chime", repeats = 1) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const pattern = PATTERNS[id] ?? PATTERNS.chime;
  const cycle = Math.max(...pattern.map((n) => n.start + n.dur)) + 0.3;
  for (let r = 0; r < repeats; r += 1) {
    const base = c.currentTime + r * cycle;
    pattern.forEach((note) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = note.type ?? "sine";
      osc.frequency.value = note.freq;
      const peak = note.gain ?? 0.22;
      const t0 = base + note.start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + note.dur + 0.05);
    });
  }
}

export function vibrate(pattern: number[] = [220, 120, 220, 120, 420]) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

export function notify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}
