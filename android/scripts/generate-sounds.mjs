/**
 * Renders the same tones the app plays in the foreground into WAV files under
 * android/app/src/main/res/raw, so Android notification channels can play a
 * real sound for each reminder style.
 *
 *   node scripts/generate-sounds.mjs
 *
 * The patterns are kept in sync with PATTERNS in src/lib/alarm.ts.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "android", "app", "src", "main", "res", "raw");

const RATE = 44100;

/** @type {Record<string, Array<{freq:number,start:number,dur:number,gain?:number,type?:string}>>} */
const PATTERNS = {
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

function harmonic(type, phase) {
  const t = (phase / (2 * Math.PI)) % 1;
  switch (type) {
    case "square":
      return t < 0.5 ? 1 : -1;
    case "triangle":
      return 4 * Math.abs(t - 0.5) - 1;
    case "sawtooth":
      return 2 * t - 1;
    default:
      return Math.sin(phase);
  }
}

function renderWav(pattern) {
  const cycle = Math.max(...pattern.map((n) => n.start + n.dur)) + 0.3;
  const total = Math.ceil(cycle * RATE);
  const samples = new Float64Array(total);

  for (const note of pattern) {
    const from = Math.floor(note.start * RATE);
    const length = Math.floor(note.dur * RATE);
    const peak = note.gain ?? 0.22;
    const type = note.type ?? "sine";
    for (let i = 0; i < length; i += 1) {
      const index = from + i;
      if (index >= total) break;
      const t = i / RATE;
      // Same 4ms attack / exponential decay envelope as the WebAudio version.
      const attack = Math.min(1, t / 0.04);
      const envelope = attack * Math.exp((-5 * t) / note.dur);
      samples[index] += harmonic(type, 2 * Math.PI * note.freq * t) * peak * envelope;
    }
  }

  const pcm = new Int16Array(total);
  for (let i = 0; i < total; i += 1) {
    pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 32767;
  }

  const header = Buffer.alloc(44);
  const dataBytes = pcm.length * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format = PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(dataBytes, 40);

  return Buffer.concat([header, Buffer.from(pcm.buffer)]);
}

await mkdir(outDir, { recursive: true });
for (const [name, pattern] of Object.entries(PATTERNS)) {
  const wav = renderWav(pattern);
  await writeFile(join(outDir, `${name}.wav`), wav);
  console.log(`${name}.wav (${(wav.length / 1024).toFixed(0)} KB)`);
}