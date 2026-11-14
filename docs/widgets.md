# Multi-Track widgets

## What the install system is today

Multi-Track installs as a Progressive Web App:

- `src/app/manifest.ts` serves `/manifest.webmanifest` (standalone display, icons, theme colors).
- `public/sw.js` precaches an app shell, serves navigations network-first with an offline fallback, and caches static assets.
- `src/components/InstallApp.tsx` captures `beforeinstallprompt` on Chromium and shows Safari/iOS “Add to Home Screen” instructions.
- `src/components/PwaRegistration.tsx` registers the service worker from the root layout so widget-only routes are covered too.

## Platform reality

Installing a PWA does **not** give it native home-screen widgets on Android or iOS; those require a native app layer such as Android Glance/App Widgets or iOS WidgetKit [1](https://intercom.help/progressier/en/articles/12814946-can-a-pwa-create-home-screen-widgets). The manifest `widgets` member is a Microsoft-specific, experimental Windows 11 Widgets Board feature rendered with Adaptive Cards, not a cross-platform web widget API [2](https://progressivewebapps.com/manifest/members/).

So the first implementation is intentionally **web-native**: widgets run inside the installed app/browser, can be opened on their own route, and are exposed as PWA shortcuts where the browser supports them. A native OS adapter can be added later without changing the widget components.

## Design direction

Minimal clock widgets usually rely on clean typography, a quiet date line, transparent backgrounds, and very little chrome [1](https://www.positioniseverything.net/the-12-best-free-android-clock-widgets-to-tell-time-in-style/). The digital clock follows that contract:

- hours/minutes are the dominant numerals;
- seconds are exactly `0.5em` of the hour/minute size;
- weekday, month, and date sit on one subdued line;
- a sun icon means AM and a half-moon icon means PM, avoiding extra words;
- the widget itself has no card/background/border, so it is transparent over its host surface.

## Implemented

- `src/lib/widgets.ts`: small widget registry; only the digital clock is shipped.
- `src/lib/widgetClock.ts`: pure formatting helpers.
- `src/components/widgets/DigitalClockWidget.tsx`: reusable transparent clock.
- `/widgets`: gallery with the live clock and a reserved future slot.
- `/widgets/digital-clock`: standalone clock surface with auto-hiding chrome and fullscreen.
- Dashboard “Widgets” panel linking to the gallery and clock.
- Manifest shortcuts: `Clock widget` and `All widgets`.
- Service worker shell updated to precache widget routes and cache Next RSC navigation payloads.

## Future widgets

Add a new entry to `WIDGETS`, create a component under `src/components/widgets/`, and add a route under `src/app/widgets/<id>/`. Keep the widget component presentational and host-agnostic so it can later be wrapped by:

1. a Windows Adaptive Cards adapter (experimental, Edge/Windows only);
2. an Android native widget bridge;
3. an iOS WidgetKit bridge via a native shell.

## Verification

- `npm run typecheck`
- `npm run lint`
- `DATABASE_URL=... npm run build`
- Browser checks: desktop/mobile clock, gallery, dashboard; computed seconds font-size is exactly half of hours/minutes; widget background is transparent.
