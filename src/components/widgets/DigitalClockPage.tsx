"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import DigitalClockWidget from "./DigitalClockWidget";
import InstallApp from "../InstallApp";

/** Standalone, distraction-free clock surface with auto-hiding chrome. */
export default function DigitalClockPage() {
  const shellRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChromeVisible(false), 3200);
  }, []);

  useEffect(() => {
    // Chrome starts visible; hide it after a short idle period.
    hideTimer.current = window.setTimeout(() => setChromeVisible(false), 3200);
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.clearTimeout(hideTimer.current);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (shellRef.current?.requestFullscreen) {
        await shellRef.current.requestFullscreen();
      } else {
        setMessage("Fullscreen is not available in this browser. Install the app for a standalone window.");
        revealChrome();
      }
    } catch {
      setMessage("Fullscreen was blocked by the browser.");
      revealChrome();
    }
  };

  return (
    <div
      ref={shellRef}
      className="widget-standalone-shell"
      onPointerMove={revealChrome}
      onPointerDown={revealChrome}
      onKeyDown={revealChrome}
      tabIndex={-1}
    >
      <header className={`widget-standalone-chrome ${chromeVisible ? "is-visible" : ""}`}>
        <Link
          href="/widgets"
          className="press rounded-full border px-3 py-1.5 text-[11px] font-semibold"
          style={{ borderColor: "rgba(255,255,255,0.18)", background: "rgba(10,14,30,0.55)" }}
        >
          ← Widgets
        </Link>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="press rounded-full border px-3 py-1.5 text-[11px] font-semibold"
          style={{ borderColor: "rgba(255,255,255,0.18)", background: "rgba(10,14,30,0.55)" }}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </header>

      <main className="widget-standalone-stage">
        <DigitalClockWidget size="standalone" />
      </main>

      {message ? (
        <div className="widget-standalone-message" role="status">
          {message}
        </div>
      ) : null}

      <InstallApp />
    </div>
  );
}
