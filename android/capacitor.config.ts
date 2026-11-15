import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // This appId is permanent. Changing it makes Android treat the next build as
  // a brand new app, so old installs can never be updated again.
  appId: "com.samprogram.multitrack",
  appName: "Multi-Track",
  webDir: "out",
  android: {
    backgroundColor: "#05060f",
    // Prayers are local, so no cleartext traffic or mixed content is needed.
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_multitrack",
      iconColor: "#05060f",
    },
  },
};

export default config;