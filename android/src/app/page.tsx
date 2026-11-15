"use client";

import { useEffect, useState } from "react";
import Dashboard from "@/components/Dashboard";
import {
  DEFAULT_CLOCKS,
  DEFAULT_SETTINGS,
  getClocks,
  getPrayerPrefs,
  getSettings,
} from "@/lib/storage";
import type { PrayerPref, Settings, WorldClock } from "@/lib/types";

/**
 * There is no server anymore: the page renders instantly with the defaults and
 * swaps in whatever is stored on the device as soon as it has been read.
 */
export default function Home() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [clocks, setClocks] = useState<WorldClock[]>(DEFAULT_CLOCKS);
  const [prefs, setPrefs] = useState<PrayerPref[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [storedSettings, storedClocks, storedPrefs] = await Promise.all([
        getSettings(),
        getClocks(),
        getPrayerPrefs(),
      ]);
      if (!active) return;
      setSettings(storedSettings);
      setClocks(storedClocks);
      setPrefs(storedPrefs);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Dashboard initialSettings={settings} initialClocks={clocks} initialPrefs={prefs} />
  );
}