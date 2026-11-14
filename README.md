# Multi-Track

Calendars, world clocks, live weather, and salah times in one adaptive Next.js dashboard.

## Development

A PostgreSQL connection string is required by the data layer:

```bash
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/app_db' npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/app_db' npm run build
```

## Widgets

Multi-Track includes a web-native widget system. The first widget is a plain transparent digital clock with half-size seconds and sun/moon AM–PM indicators.

- Gallery: `/widgets`
- Standalone clock: `/widgets/digital-clock`
- Plan and platform notes: [`docs/widgets.md`](docs/widgets.md)

These are web widgets inside the installed PWA/browser, not native Android/iOS home-screen widgets.
