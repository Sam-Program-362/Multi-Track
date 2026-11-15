-- Prayer time calibration & auto-adjustment
-- Adds the stateful offset model to `prayer_prefs`.
--
-- Apply with your usual flow (`npx drizzle-kit push` picks this up from
-- src/db/schema.ts) or run this file directly against the database.
--
-- The statements below are also executed on demand by
-- src/db/ensure-schema.ts, so a deployed instance upgrades itself on first
-- prayer read/write instead of failing with "column does not exist".
--
-- Existing rows keep working immediately:
--   * offset_minutes already holds a minute nudge and is read as Δuser(p);
--   * custom_time is kept as an audit trail of the clock time the user typed.
-- Legacy static overrides are converted lazily by `getPrayerPrefs()`, which
-- derives Δuser against that day's astronomical baseline and writes it back.

ALTER TABLE prayer_prefs
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'dynamicOffset',
  ADD COLUMN IF NOT EXISTS step_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixed_time text,
  ADD COLUMN IF NOT EXISTS calibrated_at text;

COMMENT ON COLUMN prayer_prefs.mode IS 'dynamicOffset | steppedOffset | fixedClock';
COMMENT ON COLUMN prayer_prefs.offset_minutes IS 'Δuser(p) in minutes, measured on calibrated_at';
COMMENT ON COLUMN prayer_prefs.step_minutes IS 'Quantisation step S in minutes (5/10/15), 0 = off';
COMMENT ON COLUMN prayer_prefs.fixed_time IS 'HH:mm used when mode = fixedClock';
COMMENT ON COLUMN prayer_prefs.calibrated_at IS 'Calibration date d0 as YYYY-MM-DD';
COMMENT ON COLUMN prayer_prefs.custom_time IS 'Audit trail only - the clock time the user typed, never used for scheduling';

-- Optional: how many rows were written before the calibration model existed.
-- (Leave them alone; the app upgrades them on first read.)
-- SELECT count(*) FROM prayer_prefs WHERE custom_time IS NOT NULL AND calibrated_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2026-11-15 (second pass): mosque jamaat policy, reminder target, settings
-- ---------------------------------------------------------------------------
-- All statements are additive with defaults. Nothing is dropped, renamed or
-- rewritten, so a rolling deploy (old code + new schema, or new code + old
-- schema) keeps working and existing preferences stay intact.

ALTER TABLE prayer_prefs
  ADD COLUMN IF NOT EXISTS iqamah text,
  ADD COLUMN IF NOT EXISTS reminder_at text NOT NULL DEFAULT 'azan';

COMMENT ON COLUMN prayer_prefs.iqamah IS
  'Validated JSON jamaat policy: {mode:none|delay|clock|table, delayMin, clock, table[]}. Mosque policy, never applied to the azan.';
COMMENT ON COLUMN prayer_prefs.reminder_at IS
  'azan | iqamah — which time the reminder follows';

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS elevation_meters double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_latitude_rule text NOT NULL DEFAULT 'auto';

COMMENT ON COLUMN app_settings.elevation_meters IS
  'Observer height above sea level, used for the apparent-horizon dip';
COMMENT ON COLUMN app_settings.high_latitude_rule IS
  'auto | angle | seventh | middleOfNight | none — twilight fallback when the angle is unreachable';

-- Rows written before this migration are valid as-is:
--   * iqamah is NULL  -> normalised to "no jamaat" on read;
--   * reminder_at defaults to 'azan';
--   * elevation 0 / high-latitude 'auto' reproduce the previous behaviour exactly.
--
-- How existing rows are affected: the new columns are added WITH their defaults,
-- so PostgreSQL stores the default in the column definition and pre-existing rows
-- read it there (mode 'dynamicOffset', step 0, reminder_at 'azan', elevation 0,
-- high_latitude_rule 'auto'). That is the intended starting state, and it is
-- additive: no value in an existing column is read back, rewritten or dropped.
