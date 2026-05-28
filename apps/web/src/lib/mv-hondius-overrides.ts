/**
 * MV Hondius import additions layer — Supabase-backed editor-authored rows
 * merged at runtime with `apps/web/src/data/mv-hondius-imports.json`.
 *
 * Companion to `imports-overrides.ts`, but with a different shape:
 *   - imports_overrides keys by (outbreak_id, iso2) → one row per country
 *     (it edits aggregate counts).
 *   - mv_hondius_imports_additions has a row id → multiple events per country
 *     are OK (e.g. US-LA + US-NYC) and each row may carry city/lat/lon.
 *
 * Read path:
 *   GET /api/hondius-imports → mergeAdditionsWithBaseline()
 *
 * Write path:
 *   POST/PATCH/DELETE /api/admin/mv-imports (admin-gated)
 */

// NOTE: import from /types subpath — the main barrel only re-exports
// runtime values for Taro/webpack compatibility.
import type { DataSource, MvHondiusImport, MvHondiusStatus } from '@hantawatch/shared/types';
import { getSupabase, isSupabaseConfigured } from './supabase';

export type AdditionProposalStatus = 'proposed' | 'approved' | 'rejected';

export interface MvHondiusAddition {
  id: string;
  outbreakId: string;
  iso2: string;
  cityZh: string | null;
  cityEn: string | null;
  lat: number | null;
  lon: number | null;
  status: MvHondiusStatus;
  confirmedImports: number | null;
  monitoringCount: number | null;
  quarantineCount: number | null;
  deaths: number | null;
  asOf: string;                       // YYYY-MM-DD
  summaryZh: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceConfidence: 'official' | 'news';
  proposalStatus: AdditionProposalStatus;
  proposedBy: string | null;
  proposedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  deletedAt: string | null;
}

export interface MvHondiusAdditionInput {
  outbreakId: string;
  iso2: string;
  cityZh?: string | null;
  cityEn?: string | null;
  lat?: number | null;
  lon?: number | null;
  status: MvHondiusStatus;
  confirmedImports?: number | null;
  monitoringCount?: number | null;
  quarantineCount?: number | null;
  deaths?: number | null;
  asOf: string;
  summaryZh?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourceConfidence?: 'official' | 'news';
  proposalStatus?: AdditionProposalStatus;
  proposedBy?: string;
}

function rowToAddition(row: Record<string, unknown>): MvHondiusAddition {
  return {
    id: String(row.id ?? ''),
    outbreakId: String(row.outbreak_id ?? ''),
    iso2: String(row.iso2 ?? '').toUpperCase(),
    cityZh: (row.city_zh as string | null) ?? null,
    cityEn: (row.city_en as string | null) ?? null,
    lat: typeof row.lat === 'number' ? row.lat : null,
    lon: typeof row.lon === 'number' ? row.lon : null,
    status: (row.status as MvHondiusStatus) ?? 'monitoring',
    confirmedImports: (row.confirmed_imports as number | null) ?? null,
    monitoringCount: (row.monitoring_count as number | null) ?? null,
    quarantineCount: (row.quarantine_count as number | null) ?? null,
    deaths: (row.deaths as number | null) ?? null,
    asOf: row.as_of ? String(row.as_of).slice(0, 10) : '',
    summaryZh: (row.summary_zh as string | null) ?? null,
    sourceName: (row.source_name as string | null) ?? null,
    sourceUrl: (row.source_url as string | null) ?? null,
    sourceConfidence: (row.source_confidence as 'official' | 'news') ?? 'official',
    proposalStatus: (row.proposal_status as AdditionProposalStatus) ?? 'approved',
    proposedBy: (row.proposed_by as string | null) ?? null,
    proposedAt: String(row.proposed_at ?? ''),
    decidedBy: (row.decided_by as string | null) ?? null,
    decidedAt: (row.decided_at as string | null) ?? null,
    deletedAt: (row.deleted_at as string | null) ?? null,
  };
}

/** Generate a stable-but-unique id for new additions. Format:
 *    mvh:<iso2>:<yyyymmdd>:<rand6>
 *  Sortable by date prefix, debuggable from the row itself. */
export function generateAdditionId(iso2: string, asOf: string): string {
  const datePart = asOf.replace(/-/g, '').slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 8);
  return `mvh:${iso2.toLowerCase()}:${datePart}:${rand}`;
}

/** Fetch every non-deleted addition row (any proposal_status). */
export async function fetchAllAdditions(): Promise<MvHondiusAddition[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('mv_hondius_imports_additions')
    .select('*')
    .is('deleted_at', null)
    .order('as_of', { ascending: false });
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.warn('[mv-hondius-overrides] fetch failed:', error?.message);
    return [];
  }
  return (data as Array<Record<string, unknown>>).map(rowToAddition);
}

/** Approved-only additions — what the homepage merges into its dataset. */
export async function fetchApprovedAdditions(): Promise<MvHondiusAddition[]> {
  const all = await fetchAllAdditions();
  return all.filter((a) => a.proposalStatus === 'approved');
}

export async function fetchAdditionById(id: string): Promise<MvHondiusAddition | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('mv_hondius_imports_additions')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return null;
  return rowToAddition(data as Record<string, unknown>);
}

/** Insert a new addition row. Auto-generates an id if not provided. */
export async function insertAddition(
  input: MvHondiusAdditionInput,
  actor: string,
  idOverride?: string,
): Promise<MvHondiusAddition | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const id = idOverride ?? generateAdditionId(input.iso2, input.asOf);
  const now = new Date().toISOString();

  const row: Record<string, unknown> = {
    id,
    outbreak_id: input.outbreakId,
    iso2: input.iso2.toUpperCase(),
    city_zh: input.cityZh ?? null,
    city_en: input.cityEn ?? null,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
    status: input.status,
    confirmed_imports: input.confirmedImports ?? null,
    monitoring_count: input.monitoringCount ?? null,
    quarantine_count: input.quarantineCount ?? null,
    deaths: input.deaths ?? 0,
    as_of: input.asOf,
    summary_zh: input.summaryZh ?? null,
    source_name: input.sourceName ?? null,
    source_url: input.sourceUrl ?? null,
    source_confidence: input.sourceConfidence ?? 'official',
    proposal_status: input.proposalStatus ?? 'approved',
    proposed_by: input.proposedBy ?? actor,
    proposed_at: now,
  };
  // Admin-added rows default to approved + decided by the same actor.
  if (row.proposal_status === 'approved') {
    row.decided_by = actor;
    row.decided_at = now;
  }

  const { data, error } = await supabase
    .from('mv_hondius_imports_additions')
    .insert(row)
    .select()
    .single();
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[mv-hondius-overrides] insert failed:', error?.message);
    return null;
  }
  return rowToAddition(data as Record<string, unknown>);
}

export interface AdditionPatch {
  cityZh?: string | null;
  cityEn?: string | null;
  lat?: number | null;
  lon?: number | null;
  status?: MvHondiusStatus;
  confirmedImports?: number | null;
  monitoringCount?: number | null;
  quarantineCount?: number | null;
  deaths?: number | null;
  asOf?: string;
  summaryZh?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourceConfidence?: 'official' | 'news';
  proposalStatus?: AdditionProposalStatus;
}

/** Patch an addition row. Caller controls audit fields via `actor`. */
export async function updateAddition(
  id: string,
  patch: AdditionPatch,
  actor: string,
): Promise<MvHondiusAddition | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const row: Record<string, unknown> = {};
  if ('cityZh' in patch) row.city_zh = patch.cityZh;
  if ('cityEn' in patch) row.city_en = patch.cityEn;
  if ('lat' in patch) row.lat = patch.lat;
  if ('lon' in patch) row.lon = patch.lon;
  if ('status' in patch) row.status = patch.status;
  if ('confirmedImports' in patch) row.confirmed_imports = patch.confirmedImports;
  if ('monitoringCount' in patch) row.monitoring_count = patch.monitoringCount;
  if ('quarantineCount' in patch) row.quarantine_count = patch.quarantineCount;
  if ('deaths' in patch) row.deaths = patch.deaths;
  if ('asOf' in patch) row.as_of = patch.asOf;
  if ('summaryZh' in patch) row.summary_zh = patch.summaryZh;
  if ('sourceName' in patch) row.source_name = patch.sourceName;
  if ('sourceUrl' in patch) row.source_url = patch.sourceUrl;
  if ('sourceConfidence' in patch) row.source_confidence = patch.sourceConfidence;
  if ('proposalStatus' in patch) {
    row.proposal_status = patch.proposalStatus;
    row.decided_by = actor;
    row.decided_at = new Date().toISOString();
  }

  if (Object.keys(row).length === 0) {
    return fetchAdditionById(id);
  }

  const { data, error } = await supabase
    .from('mv_hondius_imports_additions')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[mv-hondius-overrides] update failed:', error?.message);
    return null;
  }
  return rowToAddition(data as Record<string, unknown>);
}

/** Soft-delete (sets deleted_at). Hard deletes are intentionally not exposed
 *  — we keep an audit trail of what the editor removed. */
export async function softDeleteAddition(
  id: string,
  actor: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase
    .from('mv_hondius_imports_additions')
    .update({
      deleted_at: new Date().toISOString(),
      decided_by: actor,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[mv-hondius-overrides] soft-delete failed:', error?.message);
    return false;
  }
  return true;
}

/** Convert a Supabase addition row into the shape that the homepage's
 *  `findNearestImport` expects. Returns the MvHondiusImport variant of the
 *  shared type, keeping all optional fields (cityZh, lat, lon) populated. */
export function additionToImport(a: MvHondiusAddition): MvHondiusImport {
  const source: DataSource = {
    name: a.sourceName ?? 'Editor-added',
    url: a.sourceUrl ?? '',
    retrievedAt: a.proposedAt,
    confidence: a.sourceConfidence,
  };
  const imp: MvHondiusImport = {
    iso2: a.iso2,
    date: a.asOf,
    status: a.status,
    summary_zh: a.summaryZh ?? '',
    source,
  };
  if (a.cityZh) imp.cityZh = a.cityZh;
  if (a.cityEn) imp.city = a.cityEn;
  if (typeof a.lat === 'number') imp.lat = a.lat;
  if (typeof a.lon === 'number') imp.lon = a.lon;
  if (a.confirmedImports !== null) imp.confirmedImports = a.confirmedImports;
  if (a.monitoringCount !== null) imp.monitoringCount = a.monitoringCount;
  if (a.quarantineCount !== null) imp.quarantineCount = a.quarantineCount;
  if (a.deaths !== null) imp.deaths = a.deaths;
  return imp;
}

/** Merge approved additions with the committed baseline list.
 *  Strategy: append additions after the baseline. Duplicates (same iso2 +
 *  same city + same date) are deduped, with the addition winning so that
 *  edits applied via admin always reflect the latest state. */
export function mergeAdditionsWithBaseline(
  baseline: MvHondiusImport[],
  additions: MvHondiusAddition[],
): MvHondiusImport[] {
  const additionImports = additions
    .filter((a) => a.proposalStatus === 'approved' && !a.deletedAt)
    .map(additionToImport);

  if (additionImports.length === 0) return baseline;

  const keyOf = (r: MvHondiusImport) =>
    `${r.iso2.toUpperCase()}|${(r.cityZh ?? '').trim()}|${r.date}`;

  const dedup = new Map<string, MvHondiusImport>();
  for (const b of baseline) dedup.set(keyOf(b), b);
  for (const a of additionImports) dedup.set(keyOf(a), a); // addition wins

  return Array.from(dedup.values());
}
