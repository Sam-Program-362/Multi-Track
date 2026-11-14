"use client";

import Link from "next/link";
import { WIDGETS } from "@/lib/widgets";
import InstallApp from "../InstallApp";
import DigitalClockWidget from "./DigitalClockWidget";
import { Panel } from "../ui";

export default function WidgetsGallery() {
  return (
    <div className="app-shell widget-gallery-shell">
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6">
        <header className="rise mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Back to dashboard" className="press">
              <img src="/logo.svg" alt="" className="h-11 w-11 rounded-2xl shadow-lg" />
            </Link>
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em]" style={{ color: "var(--muted)" }}>
                Multi-Track
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Widgets</h1>
            </div>
          </div>
          <Link
            href="/"
            className="press rounded-xl border px-3 py-2 text-xs font-semibold"
            style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.08)" }}
          >
            ← Dashboard
          </Link>
        </header>

        <p className="mb-6 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          Lightweight, live views that stay out of the way. Open one full screen, or install
          Multi-Track and use the Clock widget shortcut where your browser supports it.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {WIDGETS.map((widget, index) => (
            <Panel key={widget.id} className="flex flex-col p-5" delay={index * 90} hover={false}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{widget.name}</h2>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                    {widget.description}
                  </p>
                </div>
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg"
                  style={{ background: "var(--accent-soft)", border: "1px solid var(--panel-border)" }}
                  aria-hidden
                >
                  {widget.id === "digital-clock" ? <ClockGlyph /> : widget.icon}
                </span>
              </div>

              <div className="widget-gallery-preview">
                {widget.id === "digital-clock" ? <DigitalClockWidget /> : null}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
                  Web widget · offline-ready
                </span>
                <Link
                  href={widget.href}
                  className="press rounded-xl px-4 py-2 text-xs font-bold"
                  style={{ background: "var(--accent)", color: "#0b1020" }}
                >
                  Open <span aria-hidden>↗</span>
                </Link>
              </div>
            </Panel>
          ))}

          <div
            className="rise flex min-h-48 flex-col items-center justify-center rounded-3xl border border-dashed p-6 text-center"
            style={{ borderColor: "var(--panel-border)", animationDelay: "120ms" }}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <h2 className="mt-2 text-sm font-semibold">More widgets later</h2>
            <p className="mt-1 max-w-xs text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              This space is reserved for the next widget. The clock is the first available one.
            </p>
          </div>
        </div>

        <section
          className="mt-6 rounded-2xl border p-4 text-xs leading-relaxed"
          style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.06)", color: "var(--muted)" }}
        >
          <strong style={{ color: "var(--fg)" }}>About widgets on your device.</strong>{" "}
          These are web widgets that run inside Multi-Track. Installing the PWA does not create
          native Android or iOS home-screen widgets; those need a separate native app layer.
        </section>
      </main>
      <InstallApp />
    </div>
  );
}

function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
