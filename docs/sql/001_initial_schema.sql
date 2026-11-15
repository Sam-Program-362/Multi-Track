-- ===========================================================================
-- Multi-Track — 001_initial_schema.sql
-- Initial database bootstrap for a database that has no application tables.
--
-- Target : Neon project "Multi-Track", branch "main", database "neondb"
--          (any empty PostgreSQL 14+ database works the same way)
-- Source : src/db/schema.ts (drizzle-orm table definitions)
--
-- SAFETY
--   * This file never drops, truncates, renames or resets anything.
--   * Every statement is idempotent, so running it twice is a no-op.
--   * The whole file runs in one transaction: if any statement fails, nothing
--     is applied (COMMIT is never reached).
--   * It only creates tables that do not exist yet and adds columns that are
--     missing from tables that do exist.
--   * Columns are *never* redefined. Values already stored in existing columns
--     are never modified.
--   * A newly added column carries its DEFAULT: PostgreSQL stores that default
--     as the column definition, so pre-existing rows immediately *read* the
--     default value in the new column. That is additive by nature (the column
--     did not exist before), and it never overwrites a stored value.
--   * It is compatible with the app's self-healing mechanism
--     (src/db/ensure-schema.ts), which re-applies the same column additions
--     with ADD COLUMN IF NOT EXISTS on first prayer read/write.
--
-- APPLY
--   Neon SQL Editor: open the project -> branch "main" -> database "neondb"
--   -> SQL Editor -> paste this file -> Run.
--   CLI:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/sql/001_initial_schema.sql
--   See docs/neon-bootstrap.md for the full procedure and verification.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. app_settings — single-profile application settings
--    (location, calculation method, elevation, high-latitude rule, UI prefs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  id                  serial PRIMARY KEY,
  profile             text             NOT NULL DEFAULT 'default',
  location_name       text             NOT NULL DEFAULT 'Dhaka, Bangladesh',
  latitude            double precision NOT NULL DEFAULT 23.8103,
  longitude           double precision NOT NULL DEFAULT 90.4125,
  timezone            text             NOT NULL DEFAULT 'Asia/Dhaka',
  method              text             NOT NULL DEFAULT 'Karachi',
  asr_juristic        text             NOT NULL DEFAULT 'Standard',
  elevation_meters    double precision NOT NULL DEFAULT 0,
  high_latitude_rule  text             NOT NULL DEFAULT 'auto',
  use_24_hour         boolean          NOT NULL DEFAULT false,
  reminders_enabled   boolean          NOT NULL DEFAULT true,
  reminder_sound      text             NOT NULL DEFAULT 'chime',
  updated_at          timestamp without time zone NOT NULL DEFAULT now()
);

-- Upgrade path: a database created by an older build may already have this
-- table with fewer columns. Additive only.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS profile            text             NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS location_name      text             NOT NULL DEFAULT 'Dhaka, Bangladesh',
  ADD COLUMN IF NOT EXISTS latitude           double precision NOT NULL DEFAULT 23.8103,
  ADD COLUMN IF NOT EXISTS longitude          double precision NOT NULL DEFAULT 90.4125,
  ADD COLUMN IF NOT EXISTS timezone           text             NOT NULL DEFAULT 'Asia/Dhaka',
  ADD COLUMN IF NOT EXISTS method             text             NOT NULL DEFAULT 'Karachi',
  ADD COLUMN IF NOT EXISTS asr_juristic       text             NOT NULL DEFAULT 'Standard',
  ADD COLUMN IF NOT EXISTS elevation_meters   double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_latitude_rule text             NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS use_24_hour        boolean          NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminders_enabled  boolean          NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_sound     text             NOT NULL DEFAULT 'chime',
  ADD COLUMN IF NOT EXISTS updated_at         timestamp without time zone NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 2. world_clocks — user-added world clocks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.world_clocks (
  id          serial PRIMARY KEY,
  label       text             NOT NULL,
  timezone    text             NOT NULL,
  accent      text             NOT NULL DEFAULT 'cyan',
  sort_order  integer          NOT NULL DEFAULT 0,
  created_at  timestamp without time zone NOT NULL DEFAULT now()
);

-- `label` and `timezone` are deliberately absent here: in `src/db/schema.ts`
-- they are NOT NULL *without* a default, and a column like that can only be
-- added to an empty table. A fresh database gets them from CREATE TABLE above;
-- every database this app has ever shipped already has them. Inventing
-- defaults for them here would make an upgraded database differ from a freshly
-- created one, which is exactly the drift this file exists to prevent.
ALTER TABLE public.world_clocks
  ADD COLUMN IF NOT EXISTS accent     text             NOT NULL DEFAULT 'cyan',
  ADD COLUMN IF NOT EXISTS sort_order integer          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp without time zone NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 3. prayer_prefs — per-prayer calibration, azan Δuser, jamaat policy, reminders
--    * offset_minutes  = Δuser(p), measured on calibrated_at
--    * mode            = dynamicOffset | steppedOffset | fixedClock
--    * iqamah          = JSON jamaat policy {mode:none|delay|clock|table,...}
--                        (mosque policy only — never applied to the azan)
--    * custom_time     = legacy audit trail of a typed clock time; never used
--                        for scheduling
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prayer_prefs (
  id                serial PRIMARY KEY,
  prayer_key        text    NOT NULL,
  label             text    NOT NULL DEFAULT '',
  mode              text    NOT NULL DEFAULT 'dynamicOffset',
  custom_time       text,
  offset_minutes    integer NOT NULL DEFAULT 0,
  step_minutes      integer NOT NULL DEFAULT 0,
  fixed_time        text,
  calibrated_at     text,
  reminder_enabled  boolean NOT NULL DEFAULT true,
  iqamah            text,
  reminder_at       text    NOT NULL DEFAULT 'azan',
  updated_at        timestamp without time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.prayer_prefs
  ADD COLUMN IF NOT EXISTS label            text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mode             text    NOT NULL DEFAULT 'dynamicOffset',
  ADD COLUMN IF NOT EXISTS custom_time      text,
  ADD COLUMN IF NOT EXISTS offset_minutes   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS step_minutes     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixed_time       text,
  ADD COLUMN IF NOT EXISTS calibrated_at    text,
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS iqamah           text,
  ADD COLUMN IF NOT EXISTS reminder_at      text    NOT NULL DEFAULT 'azan',
  ADD COLUMN IF NOT EXISTS updated_at       timestamp without time zone NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 4. Unique indexes the application relies on
--    app_settings.profile   — the singleton settings row (INSERT ... ON CONFLICT)
--    prayer_prefs.prayer_key — one row per prayer (UPDATE ... WHERE prayer_key)
--
--    Wrapped in DO blocks so a database that already contains duplicate rows is
--    reported with a warning instead of aborting the whole bootstrap. Nothing
--    is deleted to satisfy the index.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS app_settings_profile_idx
    ON public.app_settings (profile);
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'app_settings contains duplicate profile values; unique index app_settings_profile_idx was NOT created. Resolve the duplicates manually, then re-run this file.';
END
$$;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS prayer_prefs_key_idx
    ON public.prayer_prefs (prayer_key);
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'prayer_prefs contains duplicate prayer_key values; unique index prayer_prefs_key_idx was NOT created. Resolve the duplicates manually, then re-run this file.';
END
$$;

-- ---------------------------------------------------------------------------
-- 5. Seed the singleton settings row (no-op when it already exists)
--    Index-independent, so it also works on a database where the unique index
--    could not be created above. Existing values are never overwritten.
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (profile)
SELECT 'default'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings WHERE profile = 'default'
);

-- ---------------------------------------------------------------------------
-- 6. Column documentation (idempotent)
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.app_settings.elevation_meters IS
  'Observer height above sea level in metres, used for the apparent-horizon dip';
COMMENT ON COLUMN public.app_settings.high_latitude_rule IS
  'auto | angle | seventh | middleOfNight | none — twilight fallback when the angle is unreachable';
COMMENT ON COLUMN public.prayer_prefs.offset_minutes IS
  'Δuser(p) in minutes, measured on calibrated_at';
COMMENT ON COLUMN public.prayer_prefs.mode IS
  'dynamicOffset | steppedOffset | fixedClock';
COMMENT ON COLUMN public.prayer_prefs.step_minutes IS
  'Quantisation step S in minutes (5/10/15), 0 = off';
COMMENT ON COLUMN public.prayer_prefs.fixed_time IS
  'HH:mm used when mode = fixedClock';
COMMENT ON COLUMN public.prayer_prefs.calibrated_at IS
  'Calibration date d0 as YYYY-MM-DD';
COMMENT ON COLUMN public.prayer_prefs.custom_time IS
  'Audit trail only — the clock time the user typed, never used for scheduling';
COMMENT ON COLUMN public.prayer_prefs.iqamah IS
  'Validated JSON jamaat policy {mode:none|delay|clock|table, delayMin, clock, table[]}; mosque policy, never applied to the azan';
COMMENT ON COLUMN public.prayer_prefs.reminder_at IS
  'azan | iqamah — which time the reminder follows';

-- ---------------------------------------------------------------------------
-- 7. Verification (read-only)
--    Expected: three rows, all created = true; then the settings row.
-- ---------------------------------------------------------------------------
SELECT
  t.name AS table_name,
  to_regclass('public.' || t.name) IS NOT NULL AS created
FROM (VALUES ('app_settings'), ('world_clocks'), ('prayer_prefs')) AS t(name);

SELECT
  (SELECT count(*) FROM public.app_settings)  AS app_settings_rows,
  (SELECT count(*) FROM public.world_clocks)  AS world_clocks_rows,
  (SELECT count(*) FROM public.prayer_prefs)  AS prayer_prefs_rows;

COMMIT;
