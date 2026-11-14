import type { Metadata } from "next";
import WidgetsGallery from "@/components/widgets/WidgetsGallery";

export const metadata: Metadata = {
  title: "Widgets · Multi-Track",
  description: "Lightweight, live web widgets for Multi-Track.",
};

export default function WidgetsPage() {
  return <WidgetsGallery />;
}
