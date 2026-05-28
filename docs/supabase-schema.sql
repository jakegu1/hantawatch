-- =====================================================================
-- HantaWatch Supabase schema
-- =====================================================================
-- Run this once in Supabase → SQL Editor → "New query" → Run.
-- Idempotent: rerunning is safe; it uses `IF NOT EXISTS` clauses where
-- appropriate, and `CREATE OR REPLACE` for functions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Table 1: alert_subscriptions
--   Source of truth for email / phone alert opt-ins from the /subscribe form.
--   Used by /api/alert/subscribe (write) and /api/alert/list (read).
-- ---------------------------------------------------------------------
create table if not exists alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email','phone')),
  contact text not null,
  regions text[] not null default '{*}',
  serotypes text[] not null default '{*}',
  threshold text not null default 'crossing',
  source text,
  user_agent text,
  ip_hash text,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_alert_subscriptions_created_at
  on alert_subscriptions (created_at desc);

create unique index if not exists idx_alert_subscriptions_channel_contact_unique
  on alert_subscriptions (channel, contact);

-- ---------------------------------------------------------------------
-- Table 2: cluster_overrides
--   Editorial override layer for fields that WHO DON RSS does NOT expose
--   in a structured way (case counts, deaths, etc.). Read by
--   /api/clusters and written from /admin/审核队列 via
--   POST /api/admin/clusters.
--
--   Rows are merged on top of `apps/web/src/data/active-clusters.json`
--   on every homepage load. If Supabase is unreachable, the homepage
--   falls back gracefully to the JSON baseline.
-- ---------------------------------------------------------------------
create table if not exists cluster_overrides (
  cluster_id     text primary key,
  confirmed_cases int,
  suspected_cases int,
  deaths         int,
  -- ISO date string (YYYY-MM-DD) shown next to the cluster as "最近更新"
  last_update    text,
  who_risk_level text,
  note           text,
  updated_at     timestamptz not null default now(),
  updated_by     text
);

-- ---------------------------------------------------------------------
-- Table 3: manual_news_entries
--   Editor-managed timeline entries for the "最新通报" homepage block.
--   Two row kinds:
--     * 'insert' — adds a new entry (title/summary/source/etc.)
--     * 'hide'   — soft-deletes a baseline entry from
--                  recent-cases-intl.json / recent-cases-china.json by
--                  setting hide_target_id to that row's id
--   Read by /api/news-entries (public) and /api/admin/news-entries.
--
--   See apps/web/src/lib/news-entries.ts for the full rationale.
-- ---------------------------------------------------------------------
create table if not exists manual_news_entries (
  id              text primary key,
  kind            text not null check (kind in ('insert', 'hide')),
  -- Columns used when kind='insert' (nullable so 'hide' rows can omit them).
  title           text,
  summary         text,
  scope           text check (scope in ('china', 'international')),
  confidence      text check (confidence in ('official', 'news')),
  serotype_id     text,
  date            date,
  case_type       text default 'confirmed',
  count           int not null default 0,
  source_name     text,
  source_url      text,
  region_code     text,
  notes           text,
  -- Column used when kind='hide'.
  hide_target_id  text,
  -- Audit fields.
  created_at      timestamptz not null default now(),
  created_by      text,
  -- Soft delete (instead of DELETE) so we keep an audit trail.
  deleted_at      timestamptz
);

create index if not exists idx_manual_news_entries_kind_active
  on manual_news_entries (kind)
  where deleted_at is null;

create index if not exists idx_manual_news_entries_date_desc
  on manual_news_entries (date desc nulls last)
  where deleted_at is null and kind = 'insert';

-- ---------------------------------------------------------------------
-- Table 4: feedback
--   Replaces the old filesystem-based feedback.json which was silently
--   lost on every Vercel cold start. Simple append-only table.
-- ---------------------------------------------------------------------
create table if not exists feedback (
  id              text primary key,
  category        text not null default 'general',
  content         text not null,
  contact         text,
  page            text,
  ip_hash         text,
  user_agent      text,
  honeypot        boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_feedback_created_at
  on feedback (created_at desc);

-- ---------------------------------------------------------------------
-- Table 5: imports_overrides
--   Per-outbreak per-country override + proposal layer. Read by
--   /api/outbreak-status and written from /admin/审核队列 ("imports" tab).
--   Mirrors cluster_overrides but keyed by (outbreak_id, iso2).
--
--   `status` of a row:
--     'proposed' — collector auto-detected a new country/number; awaits admin
--     'approved' — admin clicked approve; merged into live ledger
--     'rejected' — admin clicked reject; suppressed for `suppress_until_at`
-- ---------------------------------------------------------------------
create table if not exists imports_overrides (
  outbreak_id        text not null,
  iso2               text not null,
  status             text not null check (status in ('proposed','approved','rejected')),
  confirmed          int,
  monitoring         int,
  quarantine         int,
  deaths             int,
  country_status     text,
  as_of              date,
  summary_zh         text,
  evidence_json      jsonb,
  proposed_by        text,
  proposed_at        timestamptz not null default now(),
  decided_by         text,
  decided_at         timestamptz,
  suppress_until_at  timestamptz,
  note               text,
  primary key (outbreak_id, iso2)
);

create index if not exists idx_imports_overrides_status
  on imports_overrides (status, proposed_at desc);

-- ---------------------------------------------------------------------
-- Table 6: mv_hondius_imports_additions
--   Editor-driven NEW import events for the MV Hondius outbreak, added
--   from the /admin "🛬 输入事件" tab without touching
--   apps/web/src/data/mv-hondius-imports.json.
--
--   Why a new table instead of reusing imports_overrides?
--   - imports_overrides is keyed by (outbreak_id, iso2) — one row per
--     country. It models "merge counts into the WHO ledger for country X."
--   - This table is for *individual* events with optional city precision:
--     "France → Nice → 1 case confirmed", "USA → LA → monitoring",
--     "USA → NYC → quarantine" (two separate rows, same country).
--   - Each row therefore needs its own `id`.
--
--   Geocoding pipeline:
--   - On insert, the API geocodes (iso2, city_zh) via Nominatim and
--     stores lat/lon directly here. No re-geocoding on read.
--   - geocode_cache (Table 7) is the cross-row dedupe layer.
--
--   Merge at runtime (apps/web/src/lib/mv-hondius-overrides.ts):
--   - GET /api/hondius-imports returns baseline JSON ∪ approved additions.
--   - Homepage useMemo on the merged list recomputes nearest import.
--
--   Workflow:
--   - 'proposed' — saved but not visible on the homepage
--   - 'approved' — visible on the homepage (default for admin-added rows)
--   - 'rejected' — explicit dismiss; hidden indefinitely
-- ---------------------------------------------------------------------
create table if not exists mv_hondius_imports_additions (
  id                  text primary key,
  outbreak_id         text not null,
  iso2                text not null,
  city_zh             text,
  city_en             text,
  -- WGS84 coords from geocoder (Nominatim) or manual override.
  lat                 double precision,
  lon                 double precision,
  status              text not null check (status in (
                        'monitoring',
                        'presumptive_positive',
                        'quarantine_active',
                        'imports_confirmed',
                        'closed'
                      )),
  confirmed_imports   int,
  monitoring_count    int,
  quarantine_count    int,
  deaths              int default 0,
  as_of               date not null,
  summary_zh          text,
  source_name         text,
  source_url          text,
  source_confidence   text default 'official' check (source_confidence in ('official','news')),
  -- Workflow & audit
  proposal_status     text not null default 'approved' check (proposal_status in ('proposed','approved','rejected')),
  proposed_by         text,
  proposed_at         timestamptz not null default now(),
  decided_by          text,
  decided_at          timestamptz,
  deleted_at          timestamptz
);

create index if not exists idx_mv_hondius_additions_active
  on mv_hondius_imports_additions (proposal_status, as_of desc)
  where deleted_at is null;

create index if not exists idx_mv_hondius_additions_outbreak_iso
  on mv_hondius_imports_additions (outbreak_id, iso2)
  where deleted_at is null;

-- ---------------------------------------------------------------------
-- Table 7: geocode_cache
--   Caches Nominatim (OpenStreetMap) responses so we don't re-query for
--   the same (city, country) pair. Nominatim's free tier requires
--   <=1 req/sec and a real User-Agent — this table is the rate-limit
--   safety net.
--
--   Cache key normalization:
--     cache_key = lower(iso2) || ':' || lower(trim(city_input))
--   so "Nice", "nice", "  Nice  " all hit the same row.
--
--   `not_found = true` rows are *also* cached (90-day TTL via app logic)
--   to prevent retry storms when admin types a misspelling.
-- ---------------------------------------------------------------------
create table if not exists geocode_cache (
  cache_key       text primary key,
  city_input      text not null,
  iso2            text not null,
  lat             double precision,
  lon             double precision,
  display_name    text,
  not_found       boolean not null default false,
  resolved_at     timestamptz not null default now()
);

create index if not exists idx_geocode_cache_resolved_at
  on geocode_cache (resolved_at desc);

-- ---------------------------------------------------------------------
-- Row-Level Security:
--   We access these tables ONLY from the Next.js server side, using the
--   service_role key. RLS therefore doesn't matter for our app, but
--   leaving RLS *enabled* protects against accidental anon-key exposure
--   in client bundles.
-- ---------------------------------------------------------------------
alter table alert_subscriptions   enable row level security;
alter table cluster_overrides     enable row level security;
alter table manual_news_entries   enable row level security;
alter table feedback              enable row level security;
alter table imports_overrides     enable row level security;
alter table mv_hondius_imports_additions enable row level security;
alter table geocode_cache         enable row level security;

-- No policies created → all anon/auth requests blocked. Service-role
-- bypasses RLS automatically.

-- ---------------------------------------------------------------------
-- Verification (paste into SQL editor after running the above):
--   select count(*) from alert_subscriptions;            -- should work
--   select * from cluster_overrides limit 5;             -- empty initially
--   select * from manual_news_entries limit 5;           -- empty initially
--   select * from imports_overrides limit 5;             -- empty initially
--   select * from mv_hondius_imports_additions limit 5;  -- empty initially
--   select * from geocode_cache limit 5;                 -- empty initially
-- ---------------------------------------------------------------------
