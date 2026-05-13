-- =====================================================================
-- HantaWatch Supabase schema
-- =====================================================================
-- Run this once in Supabase → SQL Editor → "New query" → Run.
-- Idempotent: rerunning is safe; it uses `IF NOT EXISTS` clauses where
-- appropriate, and `CREATE OR REPLACE` for functions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Table 1: alert_subscriptions
--   Source of truth for email alert opt-ins from the /subscribe form.
--   Used by /api/alert/subscribe (write) and /api/alert/list (read).
-- ---------------------------------------------------------------------
create table if not exists alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  regions text[] not null default '{}',
  serotypes text[] not null default '{}',
  threshold int,
  source text,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_alert_subscriptions_created_at
  on alert_subscriptions (created_at desc);

create unique index if not exists idx_alert_subscriptions_email_unique
  on alert_subscriptions (lower(email));

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
-- Row-Level Security:
--   We access these tables ONLY from the Next.js server side, using the
--   service_role key. RLS therefore doesn't matter for our app, but
--   leaving RLS *enabled* protects against accidental anon-key exposure
--   in client bundles.
-- ---------------------------------------------------------------------
alter table alert_subscriptions enable row level security;
alter table cluster_overrides   enable row level security;

-- No policies created → all anon/auth requests blocked. Service-role
-- bypasses RLS automatically.

-- ---------------------------------------------------------------------
-- Verification (paste into SQL editor after running the above):
--   select count(*) from alert_subscriptions;   -- should work
--   select * from cluster_overrides limit 5;    -- empty initially
-- ---------------------------------------------------------------------
