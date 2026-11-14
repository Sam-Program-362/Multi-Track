import type { Metadata } from "next";
import DigitalClockPage from "@/components/widgets/DigitalClockPage";

export const metadata: Metadata = {
  title: "Digital Clock Widget · Multi-Track",
  description: "A plain transparent digital clock with live seconds, date, and sun/moon AM–PM.",
};

export default function DigitalClockWidgetPage() {
  return <DigitalClockPage />;
}
