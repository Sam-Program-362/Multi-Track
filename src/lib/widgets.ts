/**
 * Widget registry.
 *
 * Widgets are web-native, glanceable views that run inside Multi-Track (browser
 * tab, installed PWA, or a standalone shortcut window). They are intentionally
 * decoupled from the dashboard panels so the same component can be embedded,
 * opened full screen, or pinned as its own installable shortcut.
 *
 * Native OS home-screen widgets (Android Glance / iOS WidgetKit) are a separate
 * future adapter; the web platform does not expose them to PWAs today.
 */

export type WidgetId = "digital-clock";

export type WidgetDefinition = {
  id: WidgetId;
  name: string;
  shortName: string;
  description: string;
  /** Route that renders the widget on its own, installable surface. */
  href: string;
  icon: string;
};

export const DIGITAL_CLOCK_WIDGET: WidgetDefinition = {
  id: "digital-clock",
  name: "Digital Clock",
  shortName: "Clock",
  description:
    "A plain, transparent clock with live hours, minutes and half-size seconds, plus the weekday, month and date. A sun or half moon marks AM/PM.",
  href: "/widgets/digital-clock",
  icon: "clock",
};

/** Only shipped widgets live here. Add future widgets as new entries. */
export const WIDGETS: readonly WidgetDefinition[] = [DIGITAL_CLOCK_WIDGET];
