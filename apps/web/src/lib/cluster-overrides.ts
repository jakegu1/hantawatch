/**
 * Cluster numeric-fields override layer.
 *
 * Why this exists:
 *   - WHO DON RSS (our primary auto-source) gives narrative text, NOT
 *     structured case counts. So fields like `confirmedCases`,
 *     `suspectedCases`, `deaths`, `lastUpdate`, `whoRiskLevel` come from
 *     editorial review.
 *   - Before this layer, editors had to hand-edit `active-clusters.json`
 *     and `git push` — a 90-second feedback loop. Now they can save from
 *     `/admin/审核队列` and the homepage updates on next page load.
 *
 * Data flow:
 *   active-clusters.json (baseline, written by collector)
 *      │
 *      ├──► merged with ──┐
 *      │                  │
 *   Supabase              ▼
 *   cluster_overrides ──► /api/clusters ──► homepage useEffect
 *                                ▲
 *   /admin/审核队列 ──► POST /api/admin/clusters
 *
 * Required Supabase table (run once in Supabase SQL editor):
 *   See `docs/supabase-schema.sql` for the exact DDL.
 */

import { getSupabase, isSupabaseConfigured } from './supabase';

/** Columns that an editor can override per cluster. All optional. */
export interface ClusterOverride {
  clusterId: string;
  confirmedCases: number | null;
  suspectedCases: number | null;
  deaths: number | null;
  /** Override the `lastUpdate` date that shows in the UI (ISO date 'YYYY-MM-DD'). */
  lastUpdate: string | null;
  /** Free-form WHO risk wording — overrides the registry value if set. */
  whoRiskLevel: string | null;
  /** Editor's internal note (not user-facing). */
  note: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

/** Map keys are cluster ids (e.g. "mv-hondius-2026"). Empty map when
 *  Supabase is not configured — callers should fall back to baseline JSON. */
export async function fetchClusterOverrides(): Promise<Map<string, ClusterOverride>> {
  const supabase = getSupabase();
  if (!supabase) return new Map();
  const { data, error } = await supabase
    .from('cluster_overrides')
    .select('*');
  if (error || !data) {
    if (error) {
      // Most common cause: the table hasn't been created yet. Log so the
      // user sees this in Vercel function logs, but don't throw — the
      // homepage should still render with baseline data.
      // eslint-disable-next-line no-console
      console.warn('[cluster-overrides] fetch failed:', error.message);
    }
    return new Map();
  }
  const map = new Map<string, ClusterOverride>();
  for (const row of data as Array<Record<string, unknown>>) {
    const id = row.cluster_id as string | undefined;
    if (!id) continue;
    map.set(id, {
      clusterId: id,
      confirmedCases: (row.confirmed_cases as number | null) ?? null,
      suspectedCases: (row.suspected_cases as number | null) ?? null,
      deaths: (row.deaths as number | null) ?? null,
      lastUpdate: (row.last_update as string | null) ?? null,
      whoRiskLevel: (row.who_risk_level as string | null) ?? null,
      note: (row.note as string | null) ?? null,
      updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
      updatedBy: (row.updated_by as string | null) ?? null,
    });
  }
  return map;
}

export interface OverridePatch {
  confirmedCases?: number | null;
  suspectedCases?: number | null;
  deaths?: number | null;
  lastUpdate?: string | null;
  whoRiskLevel?: string | null;
  note?: string | null;
}

/**
 * Upsert an override row. Returns the newly-stored override, or null on
 * failure (e.g. Supabase not configured).
 */
export async function upsertClusterOverride(
  clusterId: string,
  patch: OverridePatch,
  actor: string,
): Promise<ClusterOverride | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  // Translate camelCase patch into the snake_case columns Supabase uses.
  // Only include keys that were explicitly provided in the patch — passing
  // `undefined` to upsert would null out the existing column otherwise.
  const row: Record<string, unknown> = {
    cluster_id: clusterId,
    updated_at: new Date().toISOString(),
    updated_by: actor,
  };
  if ('confirmedCases' in patch) row.confirmed_cases = patch.confirmedCases;
  if ('suspectedCases' in patch) row.suspected_cases = patch.suspectedCases;
  if ('deaths' in patch) row.deaths = patch.deaths;
  if ('lastUpdate' in patch) row.last_update = patch.lastUpdate;
  if ('whoRiskLevel' in patch) row.who_risk_level = patch.whoRiskLevel;
  if ('note' in patch) row.note = patch.note;

  const { data, error } = await supabase
    .from('cluster_overrides')
    .upsert(row, { onConflict: 'cluster_id' })
    .select()
    .single();
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[cluster-overrides] upsert failed:', error?.message);
    return null;
  }
  const r = data as Record<string, unknown>;
  return {
    clusterId: r.cluster_id as string,
    confirmedCases: (r.confirmed_cases as number | null) ?? null,
    suspectedCases: (r.suspected_cases as number | null) ?? null,
    deaths: (r.deaths as number | null) ?? null,
    lastUpdate: (r.last_update as string | null) ?? null,
    whoRiskLevel: (r.who_risk_level as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
    updatedBy: (r.updated_by as string | null) ?? null,
  };
}

/**
 * Merge a baseline cluster object with an override. The override's
 * non-null fields win; null/missing fields keep the baseline value.
 */
export function applyClusterOverride<T extends {
  id: string;
  confirmedCases?: number;
  suspectedCases?: number;
  deaths?: number;
  lastUpdate?: string;
  whoRiskLevel?: string;
}>(cluster: T, override: ClusterOverride | undefined): T {
  if (!override) return cluster;
  const next = { ...cluster };
  if (override.confirmedCases !== null && override.confirmedCases !== undefined) {
    next.confirmedCases = override.confirmedCases;
  }
  if (override.suspectedCases !== null && override.suspectedCases !== undefined) {
    next.suspectedCases = override.suspectedCases;
  }
  if (override.deaths !== null && override.deaths !== undefined) {
    next.deaths = override.deaths;
  }
  if (override.lastUpdate) next.lastUpdate = override.lastUpdate;
  if (override.whoRiskLevel) next.whoRiskLevel = override.whoRiskLevel;
  return next;
}
