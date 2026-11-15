import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));
// The Android bundle has no backend; its storage layer is exercised in Node
// against an in-memory stand-in for Capacitor Preferences.
const preferencesMock = fileURLToPath(
  new URL("./tests/mocks/capacitor-preferences.ts", import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: {
      "@": src,
      "@capacitor/preferences": preferencesMock,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    reporters: ["default"],
  },
});
