"use client";

import { useState } from "react";
import { clearAll } from "@/lib/storage";
import { platformName } from "@/lib/native";
import { Panel, SectionTitle, Touchable } from "./ui";

/** Kept in sync with `versionName` in the APK by next.config.ts. */
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0";

export default function AboutPanel({ onReset }: { onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <Panel className="p-4 sm:p-5" delay={440}>
      <SectionTitle icon="ℹ️" title="About Multi-Track" subtitle={`Version ${APP_VERSION}`} />

      <div className="grid gap-2 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
        <div className="rounded-2xl border px-3 py-2" style={cardStyle}>
          <strong style={{ color: "var(--fg)" }}>Version {APP_VERSION}</strong> — this is the
          number in Settings → Apps → Multi-Track, and the one GitHub Actions stamps into
          every APK it builds.
        </div>
        <div className="rounded-2xl border px-3 py-2" style={cardStyle}>
          Running on <strong style={{ color: "var(--fg)" }}>{platformName()}</strong>. All your
          settings, clocks and prayer times are stored only on this device — there is no
          account and no server.
        </div>
        <div className="rounded-2xl border px-3 py-2" style={cardStyle}>
          Updates are installed by hand: download the newest APK from the GitHub Releases
          page and tap it. Android replaces the old version, your data stays.
        </div>
      </div>

      <div className="mt-3">
        {confirming ? (
          <div className="flex flex-wrap gap-2">
            <Touchable
              onClick={() => {
                setConfirming(false);
                onReset();
              }}
              className="rounded-xl border px-3 py-2 text-[11px] font-semibold"
              style={{ borderColor: "#ff8fa3", background: "rgba(255,143,163,0.14)", color: "#ffb9c6" }}
            >
              Yes, erase and start fresh
            </Touchable>
            <Touchable
              onClick={() => setConfirming(false)}
              className="rounded-xl border px-3 py-2 text-[11px] font-semibold"
              style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.08)" }}
            >
              Keep my data
            </Touchable>
          </div>
        ) : (
          <Touchable
            onClick={() => setConfirming(true)}
            className="w-full rounded-xl border px-3 py-2 text-[11px] font-semibold"
            style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.08)" }}
          >
            Reset all app data
          </Touchable>
        )}
      </div>
    </Panel>
  );
}

const cardStyle = {
  borderColor: "var(--panel-border)",
  background: "rgba(255,255,255,0.05)",
} as React.CSSProperties;