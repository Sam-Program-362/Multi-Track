"use client";

import { useEffect } from "react";

/**
 * Registers the service worker once for every route (dashboard, widget gallery,
 * standalone clock shortcut). Kept in the root layout so widget-only installs
 * still get offline support even when the dashboard is never opened.
 */
export default function PwaRegistration() {
  useEffect(() => {
    // Avoid caching dev-server chunks/HMR payloads; installability is a production concern.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);

  return null;
}
