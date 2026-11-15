# Multi-Track

A tri-calendar world-clock dashboard with live weather and prayer reminders — as a
Next.js web app (root) and as an offline Android app (`android/`).

## Docs

- [Prayer time calibration & auto-adjustment](docs/prayer-time-calibration.md) — how
  prayer times follow the sun instead of drifting, and how to migrate existing data
  ([SQL](docs/migrations/2026-11-15-prayer-calibration.sql)).
- [Neon bootstrap & Vercel environments](docs/neon-bootstrap.md) — creating the application
  tables in a fresh Neon database ([SQL](docs/sql/001_initial_schema.sql)), verifying which
  database `DATABASE_URL` points at, and giving Preview its own Neon branch.

## Database setup

A new database needs the initial schema once:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/sql/001_initial_schema.sql
# or paste the same file into the Neon SQL Editor
```

The script is idempotent and additive: it never drops or rewrites anything. Until it has been
applied, the app fails safely — `GET /api/settings` answers `503` naming the missing tables and
the prayer schedule is withheld instead of being calculated from defaults.
