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

### Two independent decisions per prayer

1. **Azan** — when the prayer *begins*: astronomy (`Tastro`) plus the user's `Δuser`.
2. **Jamaat / Iqamah** — when the *congregation* is called: mosque policy, stored separately.

Keeping them apart is deliberate. A congregation delay is not an astronomical correction; if it
were folded into `Δuser`, editing the jamaat time would silently move the azan (and the
reminder, and the seasonal projection). The engine computes the azan first, then resolves the
jamaat from its own rule.

### Three tracking modes (per prayer)

| Mode | Formula | Use case |
| --- | --- | --- |
| `dynamicOffset` (default) | `Tastro + Δuser` | Normal daily prayers |
| `steppedOffset` | `ceil((Tastro + Δuser) / S) × S`, `S ∈ {5,10,15}` | Mosque Iqamah boards that only move in clean steps |
| `fixedClock` | a stored `"HH:mm"` | Jumu'ah pinned at 13:30 all year |

`S` is stored per prayer; a calibrated time that drifts between 05:01 and 05:15 stays
displayed as 05:15 and jumps to 05:30 on the first day it would reach 05:16.

### Jamaat (congregation) modes

| Mode | Meaning | Where the time comes from |
| --- | --- | --- |
| `none` | the mosque publishes no jamaat | nothing is displayed or reminded |
| `delay` | constant "N minutes after the azan" | azan + N, moves with the sun all year |
| `clock` | same clock time daily, e.g. 13:30 | a stored `"HH:mm"` |
| `table` | dated seasonal entries from the mosque board | newest entry with `from ≤ date`; the earliest entry also covers dates before it |

A `table` row may carry either a clock time or a delay, so a mosque that says "jamaat +20 minutes
in Ramadan, 13:45 from April" can be described exactly. Rows are validated and sorted on write,
duplicates on the same effective date keep the last value the user entered, and a table with no
usable entries resolves to *nothing* rather than a guessed time.

**No inference from a single sample.** One entered jamaat time becomes a `clock` (or `delay`)
rule. The app never fits a seasonal curve to one data point; it says so in the editor and offers
the table for mosques whose board changes through the year.

### Scope of the annual schedule: jamaat only

This is deliberate and should stay that way unless real data arrives:

| | Azan (prayer begins) | Jamaat (congregation) |
| --- | --- | --- |
| Model | astronomy for the date + `Δuser` | mosque policy (none / delay / clock / dated table) |
| Dated seasonal rules | **none** | the `table` mode |
| Editable independently | yes | yes |
| Affects the other | no | no |

So the seasonal table introduced here applies to **jamaat**, not to the azan. The azan remains a
pure astronomical projection, because that is what it is: the sun's position, not a committee's
decision. Where a mosque's *azan* timetable also follows its own changing seasonal policy
(rather than the sun), that would need a separate dated azan rule type, and it must be driven by
evidence — a published board, an imported timetable, or dated user entries — not by a guessed
curve. **Open question, not implemented:** are dated azan rules actually needed for the mosques
this app targets? Until that is established, the app deliberately offers no such adjustment.


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
| `normalizeIqamah(raw)` | Validate/repair stored jamaat policy (JSON, legacy `null`, hand-edited rows) |
| `resolveIqamah(azan, rule, date)` | Jamaat minute for a date from the stored policy |
| `describeIqamah` / `describeScheduleItem` | Shared wording so web and Android explain a time identically |
| `HIGH_LATITUDE_CHOICES` | The five user-selectable conventions |
| `estimateLongitudeDegrees(tz, date)` | No-GPS meridian fallback `λ ≈ Zstd × 15°` |
| `zoneOffsetForDate(date, tz)` | Offset sampled at 12:00 UTC, so DST switch days are correct |
| `timezoneDrift(stored, detected)` | Travel detector for the UI prompt |

## Persistence

### Next.js app (PostgreSQL via Drizzle)

`prayer_prefs` gained six columns (see `docs/migrations/2026-11-15-prayer-calibration.sql`):

| Column | Type | Meaning |
| --- | --- | --- |
| `mode` | `text not null default 'dynamicOffset'` | tracking mode |
| `step_minutes` | `integer not null default 0` | `S`, 0 = off |
| `fixed_time` | `text` | `"HH:mm"` for `fixedClock` |
| `calibrated_at` | `text` | calibration date `d0` as `"YYYY-MM-DD"` |
| `iqamah` | `text` | validated JSON jamaat policy (separate from the azan rule) |
| `reminder_at` | `text not null default 'azan'` | remind at `azan` or `iqamah` |

`app_settings` gained `elevation_meters` (`double precision`, default 0) and
`high_latitude_rule` (`text`, default `'auto'`). Both are additive with defaults, so existing
rows — including every row written before this branch — are valid without a backfill.

`offset_minutes` keeps holding Δuser and `custom_time` is kept only as an audit trail of
the clock time the user typed — it never drives scheduling.

`src/db/ensure-schema.ts` runs the same `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
statements before the first settings/prayer read or write, so a deploy against a database
created before this feature keeps working without a separate migration step (this
repository has no migration runner on Vercel). The statements are idempotent; you can still
apply them explicitly with `npx drizzle-kit push` or the SQL file.

**Initialization contract** (`src/db/ensure-schema.ts` + `src/db/schema-gate.ts`):

* success is cached once per process;
* a failure is **never** cached — the next request retries, so a database blip does not
  leave a permanently degraded process;
* callers receive `{ ok: true } | { ok: false, error }` and must not read or write the new
  columns when it is `false` (API routes answer `503`; the page renders a warning banner and
  performs no migration);
* the loading order is fixed in `src/lib/app-store.ts`: **schema → settings → prayer
  preferences**. Only a settings row that was actually read from the database
  (`snapshot.fromDatabase`) may be used to derive legacy `Δuser` offsets. Fallback defaults
  are display-only, and nothing is written when the context is unavailable.

`PUT /api/prayers` accepts a partial rule:

```jsonc
// recalibrate to the masjid time the user typed (Δuser is measured server-side)
{ "prayerKey": "fajr", "customTime": "05:25", "recalibrate": true, "calibratedAt": "2026-11-15" }

// nudge Δuser by the offset the client already computed
{ "prayerKey": "fajr", "offsetMinutes": 24 }

// pin Jumu'ah
{ "prayerKey": "dhuhr", "mode": "fixedClock", "fixedTime": "13:30" }

// back to pure astronomy (the mosque policy is kept)
{ "prayerKey": "fajr", "mode": "dynamicOffset", "offsetMinutes": 0, "reset": true }

// mosque jamaat policy: a constant 15 minutes after the azan
{ "prayerKey": "fajr", "iqamah": { "mode": "delay", "delayMin": 15 }, "reminderAt": "iqamah" }

// mosque jamaat policy: dated seasonal board entries
{ "prayerKey": "dhuhr", "iqamah": { "mode": "table", "table": [
    { "from": "2026-01-01", "clock": "13:30" },
    { "from": "2026-04-01", "clock": "13:45" }
  ] } }

// forget the jamaat configuration for this prayer
{ "prayerKey": "dhuhr", "resetIqamah": true }
```

Anything not sent keeps its stored value. `recalibrate: true` is what distinguishes a
calibration event from the audit-only `customTime`.

### Android app (device storage)

`android/src/lib/storage.ts` is at `STORAGE_VERSION = 3`. Migration is additive and one-shot:

* **v1 → v3**: a static `customTime` becomes a real Δuser rule, measured against the
  astronomical baseline of the migration day; a pinned `fixedClock` row gets a configuration
  date. The payload is rewritten immediately, so the recovered offset is not re-derived on every
  launch (which would pin the time in place).
* **v2 → v3**: every stored calibration is preserved byte-for-byte; `iqamah` defaults to "no
  jamaat" and `reminderAt` to `"azan"`.
* **Unknown future version**: values are re-validated and kept, never wiped.
* Invalid prayer rows are dropped individually; the rest survive. Corrupt JSON falls back to
  defaults instead of crashing the app.

The same lazy backfill happens server-side in `getPrayerPrefs()`, because otherwise every read
would re-pin the old time to "today" and the drift would never happen.

## UI (`IslamicPanel.tsx`)

* **Calibration badge** per row — `auto · Δ+23m`, `steps of 10m`, `fixed 13:30`.
* **Row** — azan time large, jamaat time underneath when the mosque publishes one.
* **Editor, azan section** — mode chips, the masjid azan time field, a calibration chip showing
  the live rule, `−1`/`+1` nudges on Δuser, 5/10/15 minute step chips, and a "Sun today 04:55"
  hint so the entered time is always explainable.
* **Editor, jamaat section** — four policy chips (none / after azan / fixed clock / seasonal
  table), a live preview `azan 05:18 · +15m → jamaat 05:33`, a table editor with an editable date
  and time per row, and a per-prayer "remind me at Azan / Jamaat" choice.
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

`npm test` runs 231 assertions in `tests/` (Vitest):

| File | What it proves |
| --- | --- |
| `tests/prayer-math.test.ts` | ±2 min agreement with the independent `adhan` implementation for 7 cities × 4 dates × 5 authorities (max observed: sunrise 0, dhuhr 1, asr 1, maghrib 1 min), rule-for-rule high-latitude agreement, Asr shadow factors, Umm al-Qura Ramadan Isha, elevation dip, full-year ordering/finiteness, polar day |
| `tests/calibration.test.ts` | Δuser capture/wrap/clamp, seasonal projection, DST, step boundaries and midnight wrap, legacy row recovery, jamaat delay/clock/table resolution (including before the first entry and duplicate dates), azan↔jamaat independence, reminder targeting |
| `tests/prayer-write.test.ts` | The pure `PUT /api/prayers` decision: recalibrate vs nudge vs fixed clock vs reset, jamaat validation, partial updates, legacy upgrades, invalid input rejection |
| `tests/android-store.test.ts` | v1→v3 and v2→v3 device migrations against an in-memory Capacitor Preferences, unknown future versions, corrupt payloads, policy-preserving saves |
| `tests/parity.test.ts` | `prayer.ts`, `calibration.ts`, `timezones.ts`, `calendars.ts`, `islamicEvents.ts` are byte-identical in both apps, and `PrayerPref` has the same shape |
| `tests/home-load.test.ts` | The **real home-page sequence** against a fake old database: schema runs before any read, the user's real settings (not Dhaka) drive every legacy offset, settings are never rewritten, schema/settings/write failures never persist a migration and recover on retry |
| `tests/schema-gate.test.ts` | Schema initialization: success cached once, failure never cached, retries succeed, concurrent callers share one attempt, synchronous throws become statuses |

Worked values used as fixtures:

```
Dhaka 2026-11-15  Fajr 04:55  Sunrise 06:13  Dhuhr 11:44  Asr 14:51  Maghrib 17:13  Isha 18:31
Fajr entered 05:18 → Δuser +23 → 2026-12-15 05:35 (sun moved, offset did not)
London Dhuhr 28 Mar 12:07 → 29 Mar 13:06 (DST), Δuser unchanged
Tromsø 21 Jun: Fajr/Isha collapse onto sunrise/sunset (no night to divide)
Makkah Ramadan: Isha = Maghrib + 120 min instead of 90
steps S=15: 05:01→05:15, 05:15→05:15, 05:16→05:30
```

`npm run typecheck`, `npm run test` and `npm run build` pass for the root app; `npm run
typecheck` and `npm run build` pass in `android/`. `npm run lint` reports the same 14
pre-existing errors on `main` (React hook dependency style in panels that predate this work)
and none in the files added or changed here.

