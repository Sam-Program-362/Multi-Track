import Dashboard from "@/components/Dashboard";
import { getClocks, getPrayerPrefs, getSettings } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Settings first so the prayer preferences can reuse them: the calibration
  // context (location, method, timezone) lives on the settings row, and
  // fetching it twice would race the first-run seeding insert.
  const settings = await getSettings();
  const [clocks, prefs] = await Promise.all([getClocks(), getPrayerPrefs(settings)]);

  return (
    <Dashboard initialSettings={settings} initialClocks={clocks} initialPrefs={prefs} />
  );
}
