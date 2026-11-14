"use client";

import Link from "next/link";
import { DIGITAL_CLOCK_WIDGET } from "@/lib/widgets";
import DigitalClockWidget from "./DigitalClockWidget";
import { Panel, SectionTitle } from "../ui";

/** Dashboard entry point for the widget system. The clock itself has no background. */
export default function WidgetsPanel() {
  return (
    <Panel className="mb-4 p-4 sm:p-5" delay={120} hover={false}>
      <SectionTitle
        icon={
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
          </svg>
        }
        title="Widgets"
        subtitle="Small, live views for your installed app"
        right={
          <Link
            href="/widgets"
            className="press rounded-xl border px-3 py-1.5 text-[11px] font-semibold"
            style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.08)" }}
          >
            View all
          </Link>
        }
      />

      <div className="widget-dashboard-preview">
        <DigitalClockWidget />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{DIGITAL_CLOCK_WIDGET.name}</div>
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>
            Transparent · live seconds · sun/moon AM–PM
          </div>
        </div>
        <Link
          href={DIGITAL_CLOCK_WIDGET.href}
          className="press rounded-xl px-4 py-2 text-xs font-bold"
          style={{ background: "var(--accent)", color: "#0b1020" }}
        >
          Open widget <span aria-hidden>↗</span>
        </Link>
      </div>
    </Panel>
  );
}
