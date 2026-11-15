# Prayer time calibration & auto-adjustment

Multi-Track used to store a prayer time exactly as the user typed it. That is fine on
the day it is entered and wrong a month later: because of the Earth's axial tilt and
elliptical orbit, sunrise/sunset shift by roughly 1–2.5 minutes per day (30–50 minutes
per month), so every stored clock time slowly drifts out of sync with reality and the
user has to re-enter their schedule over and over.

This implementation turns the user's entry into a **calibration event** instead of a
fixed time, and projects every later day from the sun. It is the architecture described
in *Dynamic Prayer Time Calibration & Astronomical Adjustment System* (the engineering
report), implemented in both apps in this repository:

| App | Where |
| --- | --- |
| Next.js web app (root) | `src/lib/prayer.ts`, `src/lib/calibration.ts`, `src/app/api/prayers/route.ts`, `src/db/schema.ts` |
| Android app (`android/`, Capacitor) | `android/src/lib/prayer.ts`, `android/src/lib/calibration.ts`, `android/src/lib/storage.ts` |

Both copies of `prayer.ts` and `calibration.ts` are byte-identical; the UI
(`IslamicPanel.tsx`) is the same apart from the Android native notification/haptics code.

## The model

A prayer time has two independent parts:

```
Δuser(p)     = Tinput(p, d0) − Tastro(p, d0)        # captured once, on calibration day d0
Tfinal(p, d) = Tastro(p, d) + Δuser(p)              # every later day d
```

* `Tastro` is recomputed from the solar position for **each date**, so seasonal drift is
  followed automatically.
* `Δuser` is the local adjustment (congregation/Iqamah delay, terrain, mosque practice)
  and never changes unless the user recalibrates or nudges it.

Because `Tastro` is evaluated with the timezone offset in force on that date, a DST
change moves every timer by an hour while `Δuser` stays untouched.

### Three tracking modes (per prayer)

| Mode | Formula | Use case |
| --- | --- | --- |
| `dynamicOffset` (default) | `Tastro + Δuser` | Normal daily prayers |
| `steppedOffset` | `ceil((Tastro + Δuser) / S) × S`, `S ∈ {5,10,15}` | Mosque Iqamah boards that only move in clean steps |
| `fixedClock` | a stored `"HH:mm"` | Jumu'ah pinned at 13:30 all year |

`S` is stored per prayer; a calibrated time that drifts between 05:01 and 05:15 stays
displayed as 05:15 and jumps to 05:30 on the first day it would reach 05:16.

## Module map

`src/lib/prayer.ts` — astronomy only (report §3):

* Julian date, solar mean anomaly, mean/apparent longitude, declination, equation of
  time, solar transit.
* General hour-angle formula `H(α)`, evaluated iteratively for each prayer.
* Horizon angle with observer elevation: `α0 = 0.833° + 0.0347° × √h`
  (`elevationMeters`).
* **High-latitude fallback** (`highLatitudeRule`): only applied to the angles the sun
  actually never reaches that day, using the night length between sunset and sunrise:
  * `angle` — sixtieth rule, `α/60` of the night (default below 55°)
  * `seventh` — one seventh of the night (55°–60°)
  * `middleOfNight` — half the night (≥ 60°)
  * `none` — keep the clamped value
  * In polar day/night (no sunrise or sunset) the night length is zero, so Fajr/Isha
    collapse onto sunrise/sunset instead of inventing hours.
* Method presets follow the report's table (MWL, ISNA, Egypt, Karachi, Umm al-Qura,
  Tehran); Umm al-Qura measures Isha in minutes after Maghrib and uses 120 instead of
  90 during Ramadan.
* `computePrayerMinutes(date, opts)` — the same engine, rounded to minutes past
  local midnight.

`src/lib/calibration.ts` — the stateful offset layer (report §2 and §4):

| Export | Purpose |
| --- | --- |
| `astroMinutesFor(date, ctx)` | Astronomical baseline for a date, DST-safe (`zoneOffsetForDate`) |
| `captureOffsetMinutes(input, astro)` | Δuser with the midnight wrap resolved to the shorter arc |
| `calibrate(rule, input, astro, at)` | Turn an entered time into a stored rule |
| `nudge(rule, ±n)` | Quick ±1 minute adjustment of Δuser |
| `projectMinutes(astro, rule)` | Apply a rule (equations 2 and 7) |
| `stepJumpMinutes(minutes, S)` | Ceiling quantisation |
| `normalizeStoredRule(key, raw, ctx, date)` | Validate stored data **and upgrade legacy rows** |
| `buildSchedule(date, settings, prefs)` | The single schedule used by the panel, the in-app reminder engine and the Android notification scheduler |
| `estimateLongitudeDegrees(tz, date)` | No-GPS meridian fallback `λ ≈ Zstd × 15°` |
| `zoneOffsetForDate(date, tz)` | Offset sampled at 12:00 UTC, so DST switch days are correct |
| `timezoneDrift(stored, detected)` | Travel detector for the UI prompt |

## Persistence

### Next.js app (PostgreSQL via Drizzle)

`prayer_prefs` gained four columns (see `docs/migrations/2026-11-15-prayer-calibration.sql`):

| Column | Type | Meaning |
| --- | --- | --- |
| `mode` | `text not null default 'dynamicOffset'` | tracking mode |
| `step_minutes` | `integer not null default 0` | `S`, 0 = off |
| `fixed_time` | `text` | `"HH:mm"` for `fixedClock` |
| `calibrated_at` | `text` | calibration date `d0` as `"YYYY-MM-DD"` |

`offset_minutes` keeps holding Δuser and `custom_time` is kept only as an audit trail of
the clock time the user typed — it never drives scheduling.

`src/db/ensure-schema.ts` runs the same `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
statements once per process before the first prayer read/write, so a deploy against a
database that was created before this feature keeps working without a separate migration
step (this repository has no migration runner on Vercel). The statements are idempotent;
you can still apply them explicitly with `npx drizzle-kit push` or the SQL file.

`PUT /api/prayers` accepts a partial rule:

```jsonc
// recalibrate to the masjid time the user typed (Δuser is measured server-side)
{ "prayerKey": "fajr", "customTime": "05:25", "recalibrate": true, "calibratedAt": "2026-11-15" }

// nudge Δuser by the offset the client already computed
{ "prayerKey": "fajr", "offsetMinutes": 24 }

// pin Jumu'ah
{ "prayerKey": "dhuhr", "mode": "fixedClock", "fixedTime": "13:30" }

// back to pure astronomy
{ "prayerKey": "fajr", "mode": "dynamicOffset", "offsetMinutes": 0, "reset": true }
```

Anything not sent keeps its stored value. `recalibrate: true` is what distinguishes a
calibration event from the audit-only `customTime`.

### Android app (device storage)

`android/src/lib/storage.ts` is at `STORAGE_VERSION = 2`. v1 prayer preferences held a
static `customTime`; `migrate()` converts each one into a proper Δuser rule and rewrites
the payload, so the familiar time is preserved today and starts following the sun
tomorrow. The same lazy backfill happens server-side in `getPrayerPrefs()`, because
otherwise every read would re-pin the old time to "today" and the drift would never
happen.

## UI (`IslamicPanel.tsx`)

* **Calibration badge** per row — `auto · Δ+23m`, `steps of 10m`, `fixed 13:30`.
* **Editor** — mode chips, the masjid time field ("your masjid / jamaat time today"),
  a calibration chip showing the live rule, `−1`/`+1` nudges on Δuser, 5/10/15 minute
  step chips, and a "Sun today 04:55" hint so the entered time is always explainable.
* **Save semantics** — if the clock field still matches the projection of the stored
  Δuser, only the offset/mode is saved; if the user typed a new time, that becomes a
  fresh calibration event (`customTime` + `recalibrate`).
* **Travel prompt** — when `Intl.DateTimeFormat().resolvedOptions().timeZone` differs
  from the stored zone, a banner offers to adopt the new zone. Offsets are preserved;
  only the timezone (and therefore the baseline) changes.
* **Reminder text** — the summary line explains that times auto-adjust, and the setup
  tab documents the three modes.

## Android notifications

`schedulePrayerReminders()` now accepts `itemsForDate(date)`, and the dashboard passes
`buildSchedule(date, …)` for each of the next 7 days. Repeating today's clock times for
a week would have reintroduced a small amount of drift (up to ~2 minutes per day), which
matters precisely because these are exact-minute alarms.

## Verifying the maths

The astronomical baseline and the calibration algebra were checked against the report's
worked example and a set of invariants (Dhaka, London DST switch, Tromsø polar day,
midnight wrap, step quantisation, fixed clock, legacy migration):

```
Dhaka 2026-11-15  Fajr 04:55  Sunrise 06:13  Dhuhr 11:44  Asr 14:51  Maghrib 17:13  Isha 18:31
Fajr entered 05:25 → Δuser +30 → 30 days later the timer moves with the sun automatically
London Dhuhr 28 Mar 12:07 → 29 Mar 13:06 (DST), Δuser unchanged
Tromsø 21 Jun: Fajr/Isha collapse onto sunrise/sunset (no night to divide)
```

`npm run typecheck` and `npm run build` pass for both the root app and `android/`.
