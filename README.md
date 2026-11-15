# Multi-Track

Calendars, world clocks, live weather, and salah times in one adaptive interface.

This repository contains two surfaces:

- **Web dashboard** — the Next.js/PostgreSQL PWA at the repository root.
- **Android app** — the standalone Capacitor app in [`android/`](android/), built and released by [`.github/workflows/android-apk.yml`](.github/workflows/android-apk.yml).

## Web development

A PostgreSQL connection string is required by the web data layer:

```bash
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/app_db' npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/app_db' npm run build
```

## Android app

```bash
cd android
npm ci
npm run build
npx cap sync android
```

The Android app includes a **native home-screen Digital Clock widget**: transparent, live seconds at half size, weekday/month/date, and sun/half-moon AM–PM indicators. See [`docs/android-clock-widget.md`](docs/android-clock-widget.md).

The clock widget is native to Android; it is not part of the web dashboard.
