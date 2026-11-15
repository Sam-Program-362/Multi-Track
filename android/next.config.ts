import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

const nextConfig: NextConfig = {
  // The Android build loads the app from a local file:// bundle, so the whole
  // app has to be pre-rendered as static HTML. No server, no database.
  output: "export",
  images: { unoptimized: true },
  env: {
    // Shown on the About screen. Kept in sync with `versionName` in the APK,
    // which Android reads from the same package.json field.
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
};

export default nextConfig;