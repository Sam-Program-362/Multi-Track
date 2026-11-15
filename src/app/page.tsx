import Dashboard from "@/components/Dashboard";
import { getClocks, loadHomeData } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  // One function owns the order: schema first, then the user's real settings,
  // then the prayer preferences (see `loadHomeData`). Reading settings before
  // the schema was ready used to fall back to Dhaka defaults, and those
  // defaults were then used to derive legacy prayer offsets.
  const home = await loadHomeData();
  const clocks = await getClocks();

  return (
    <Dashboard
      initialSettings={home.settings}
      initialClocks={clocks}
      initialPrefs={home.prefs}
      initialNotice={home.notice}
      settingsVerified={home.settingsVerified}
    />
  );
}
