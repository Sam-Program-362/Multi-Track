import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Multi-Track Dashboard",
    short_name: "Multi-Track",
    description: "Calendars, world clocks, live weather, and salah times in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#05060f",
    theme_color: "#05060f",
    categories: ["utilities", "productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Open dashboard", short_name: "Dashboard", url: "/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
