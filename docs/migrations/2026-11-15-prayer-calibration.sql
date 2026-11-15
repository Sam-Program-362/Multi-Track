-- Prayer time calibration & auto-adjustment
-- Adds the stateful offset model to `prayer_prefs`.
--
-- Apply with your usual flow (`npx drizzle-kit push` picks this up from
-- src/db/schema.ts) or run this file directly against the database.
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
