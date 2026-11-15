# Neon bootstrap and Vercel environment safety

Status of this document: **instructions only**. Nothing in it has been executed against the
Neon project. No credentials were requested or used, no SQL was run against Neon, and no Vercel
environment variable was read, added or changed in this session.

---

## 1. What the inspection found

| Item | Finding |
| --- | --- |
| Neon project | `Multi-Track` |
| Default branch | `main` |
| Database inspected | `neondb` |
| Neon Auth | schema/tables present (e.g. `neon_auth`) |
| `public.app_settings` | **missing** |
| `public.prayer_prefs` | **missing** |
| `public.world_clocks` | **missing** |
| Vercel ↔ Neon mapping | `DATABASE_URL` is set for **Preview and Production** by the Vercel/Neon integration; the exact project/branch/database/role behind that value has **not** been independently confirmed |
| Neon preview branch | none visible |

Consequence: the application cannot work against this database yet. Every read fails with
`relation "app_settings" does not exist`, the settings API answers `503`, and the UI withholds
prayer times — which is the intended safe failure, but it is a one-time setup gap, not a bug.

---

## 2. What the application expects

`src/db/schema.ts` defines exactly three tables. They are created by
[`docs/sql/001_initial_schema.sql`](sql/001_initial_schema.sql) (idempotent, additive only):

| Table | Purpose | Key columns |
| --- | --- | --- |
| `app_settings` | one settings row per profile | `profile` (unique), `location_name`, `latitude`, `longitude`, `timezone`, `method`, `asr_juristic`, `elevation_meters`, `high_latitude_rule`, `use_24_hour`, `reminders_enabled`, `reminder_sound`, `updated_at` |
| `prayer_prefs` | per-prayer calibration | `prayer_key` (unique), `label`, `mode`, `custom_time`, `offset_minutes` (Δuser), `step_minutes`, `fixed_time`, `calibrated_at`, `reminder_enabled`, `iqamah` (jamaat policy JSON), `reminder_at`, `updated_at` |
| `world_clocks` | user clocks | `label`, `timezone`, `accent`, `sort_order`, `created_at` |

Indexes: `app_settings_profile_idx` (unique on `profile`), `prayer_prefs_key_idx` (unique on
`prayer_key`). The script's output was compared column-for-column against
`drizzle-kit generate` for the same schema file and matches exactly.

The schema includes the current prayer calibration model (Δuser offsets, stepped quantisation,
fixed clock), the Azan/jamaat split (`iqamah` policy JSON is mosque policy only), elevation,
high-latitude rule and the reminder target.

---

## 3. Apply the bootstrap through the Neon SQL Editor

1. Open the Neon console → project **Multi-Track**.
2. Select branch **main** (branch selector, top of the sidebar) and confirm the database is
   **neondb**.
3. Open **SQL Editor**.
4. Paste the whole of `docs/sql/001_initial_schema.sql`.
5. Run it once. Expected: 23 result sets; the two verification queries at the end return
   three rows with `created = true`, then a row count of `1, 0, 0`
   (`app_settings`, `world_clocks`, `prayer_prefs`).
6. Run it a second time. Expected: identical result, no errors — every statement is
   `IF NOT EXISTS` / `WHERE NOT EXISTS`, and the whole file is wrapped in one transaction.
7. Read the **notices/warnings** panel. A warning about duplicate `profile` or `prayer_key`
   values means the unique index was skipped; resolve the duplicates by hand and re-run. Nothing
   is deleted to satisfy an index.

Post-apply verification (read-only, safe to run any time):

```sql
SELECT table_name, count(*) AS columns
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;            -- app_settings 14, prayer_prefs 13, world_clocks 6

SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' ORDER BY indexname;
-- app_settings_pkey, app_settings_profile_idx,
-- prayer_prefs_key_idx, prayer_prefs_pkey, world_clocks_pkey

SELECT id, profile, location_name, latitude, longitude, timezone,
       elevation_meters, high_latitude_rule
FROM app_settings;              -- exactly one row, profile = 'default'
```

### What the script will never do

* No `DROP`, `TRUNCATE`, `DELETE` or `ALTER ... DROP COLUMN`.
* No table or column renames.
* No writes to existing rows: only the singleton `app_settings` row is inserted, and only when
  no `default` row exists.
* No changes outside the `public` schema — `neon_auth` (Neon Auth) is untouched.
* If any statement fails, the transaction rolls back and nothing is applied.

### After it is applied

No redeploy is needed. The self-healing gate (`src/db/ensure-schema.ts`) does not cache failures,
so the next request re-probes the catalog, finds the tables, applies the column additions with
`ADD COLUMN IF NOT EXISTS`, and starts serving normally.

---

## 4. Confirm which database Vercel's `DATABASE_URL` actually points at

Do this before applying anything to a second environment, so you never bootstrap the wrong branch.

1. **Vercel** → project **Multi-Track** → Settings → Environment Variables → `DATABASE_URL`.
   Note which *targets* it covers (Production / Preview / Development) and which integration owns
   it (the Neon integration usually sets it for all three).
2. **Neon console** → project **Multi-Track** → Branches → the branch whose connection details
   are shown. Copy the host: the pooled host looks like
   `ep-<endpoint>-pooler.<region>.aws.neon.tech`; the branch name is stored in the Neon UI, not in
   the hostname, so hostname alone does not prove the branch.
3. **Runtime proof (no secrets needed)** — hit the deployed app and read the public failure text:

   ```bash
   curl -s https://<deployment>/api/settings
   ```

   * `503 {"error":"Database schema is not ready","detail":"Database is not initialised: public.app_settings, ... "}`
     → the mapped database is the unbootstrapped one (this is the message added in `src/db/bootstrap.ts`).
   * `503 {"error":"Database schema is not ready","detail":"... (Connection terminated unexpectedly)"}`
     or `(getaddrinfo ...)` → the app cannot reach the database at all; fix connectivity first.
   * `200 {...}` → mapped to a bootstrapped database that already has a settings row.
4. **Write-marker proof** (only on a preview deployment): `PUT` a distinctive
   `locationName` (e.g. `Mapping probe`) to `/api/settings`, then look for it with
   `SELECT location_name FROM app_settings;` in each candidate branch's SQL Editor. The branch
   that shows it is the one Vercel is using. Change the value back afterwards.

---

## 5. Give Preview its own Neon branch

Two supported ways. Both keep **Production on its intended database**.

### Option A — integration-managed branch per preview (preferred)

1. Neon console → project **Multi-Track** → **Integrations** → the Vercel integration.
2. Enable the preview-deployment behaviour ("create a branch for each preview deployment" /
   per-environment branch mapping — wording depends on the integration version).
3. Confirm the mapping afterwards in Neon → Branches: preview deployments should create/use
   branches that are copies of `main`.
4. Bootstrap each preview branch once, the same way as §3 (they are separate databases; a branch
   created after the bootstrap inherits the tables, an older one does not).

### Option B — manual preview branch + Preview-only `DATABASE_URL`

1. Neon console → Branches → **New branch** → name `preview`, parent `main`,
   "include data" enabled (this copies the bootstrapped schema and the settings row).
2. Copy that branch's pooled connection string (`...-pooler...`, keep `sslmode=require`).
3. Vercel → Settings → Environment Variables → `DATABASE_URL`:
   * if the integration owns the value for **all** environments, remove the **Preview** target
     from it first (Vercel rejects two values of the same key for the same target);
   * then add `DATABASE_URL` with the preview branch string, target **Preview** only.
4. Redeploy the preview (env changes need a new deployment).
5. Verify: `GET /api/settings` on the preview returns `200` with the seeded row, the page shows
   prayer times, and writes made in preview appear in the `preview` branch — not in `main`.
6. Leave the **Production** variable untouched: it keeps pointing at the branch it uses today.

Notes and cautions:

* Never point Preview at the Production branch "just for a quick test": the app writes a settings
  row and prayer preferences, and those writes would land in live data.
* Production deploys and the Neon `main` branch are out of scope for this change; do not edit the
  Production environment variable as part of the preview setup.
* The Android build does not use `DATABASE_URL`; it stores preferences on the device.

---

## 6. Failure behaviour you should expect before the bootstrap

| Surface | Behaviour while the tables are missing |
| --- | --- |
| `GET /` | `200`, page renders, prayer schedule withheld, amber alert "Prayer schedule unavailable" |
| `GET /api/settings`, `PUT /api/settings` | `503` with the table names and the path to this script |
| Server log | `[prayer-schema] initialization failed: Database is not initialised: public.app_settings, public.world_clocks, public.prayer_prefs are missing. ...` |
| Retry | The failure is not cached: the app starts working on the first request after the script is applied |

Driver-level failures now include the cause (for example
`Failed query: ... (Connection terminated unexpectedly)`), so a wrong host and a missing table are
distinguishable without reading server logs.

---

## 7. Not done in this session

* No connection to the Neon project, no credentials requested, no SQL executed against Neon.
* No Vercel environment variable read, added, edited or removed.
* No merge of PR #5, no production deployment, no APK.
* The script was validated locally against a disposable PostgreSQL 18 instance (PGlite): applied
  three times, on an empty database and on a legacy schema that already held user data, and
  compared column-for-column with `drizzle-kit generate` output.
