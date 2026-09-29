import Dashboard from "@/components/Dashboard";
import { getClocks, getPrayerPrefs, getSettings } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [settings, clocks, prefs] = await Promise.all([
    getSettings(),
    getClocks(),
    getPrayerPrefs(),
  ]);

  return (
    <Dashboard initialSettings={settings} initialClocks={clocks} initialPrefs={prefs} />
  );
}
