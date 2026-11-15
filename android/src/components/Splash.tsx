"use client";

import { useEffect, useState } from "react";

const RINGS = [0, 400, 800, 1200];
const GLYPHS = ["🕌", "🗓️", "⏱️", "☁️"];

export default function Splash() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setGone(true), 3150);
    return () => window.clearTimeout(t);
  }, []);

  if (gone) return null;

  return (
    <div className="splash" aria-hidden>
      {RINGS.map((delay, i) => (
        <span
          key={delay}
          className="splash-ring"
          style={{
            width: 180 + i * 40,
            height: 180 + i * 40,
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
      <div className="relative flex flex-col items-center gap-5 px-6 text-center">
        <div className="flex items-center gap-3">
          {GLYPHS.map((g, i) => (
            <span
              key={g}
              className="splash-word text-3xl sm:text-4xl"
              style={{ animationDelay: `${180 * i}ms` }}
            >
              {g}
            </span>
          ))}
        </div>
        <h1
          className="splash-word bg-gradient-to-r from-sky-200 via-white to-amber-200 bg-clip-text text-3xl font-bold tracking-[0.2em] text-transparent sm:text-4xl"
          style={{ animationDelay: "700ms" }}
        >
          MULTI&nbsp;TRACK
        </h1>
        <p
          className="splash-word text-xs tracking-[0.35em] text-sky-200/80"
          style={{ animationDelay: "950ms" }}
        >
          CALENDARS · CLOCKS · WEATHER · SALAH
        </p>
        <div className="mt-2 h-[3px] w-56 overflow-hidden rounded-full bg-white/10">
          <div
            className="splash-bar h-full rounded-full"
            style={{
              background: "linear-gradient(90deg,#7dd3fc,#c4b5fd,#fcd34d)",
            }}
          />
        </div>
        <p
          className="splash-word text-[10px] tracking-[0.2em] text-white/45"
          style={{ animationDelay: "1300ms" }}
        >
          بسم الله الرحمن الرحيم
        </p>
      </div>
    </div>
  );
}
