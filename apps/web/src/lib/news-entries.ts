/**
 * Editor-managed "最新通报" timeline entries.
 *
 * Architecture
 * ------------
 * The recent-cases timeline on the homepage is normally built from:
 *
 *   recent-cases-intl.json   (auto, collector output, every 6h)
 *   recent-cases-china.json  (manual file, edited via git)
 *
 * This module adds a **third layer**: live entries stored in Supabase
 * and merged at runtime. It supports two row kinds:
 *
 *   kind = 'insert'
 *     Adds a new entry to the timeline. All content columns are
 *     populated (title, summary, source, etc.). Used when an editor sees
 *     a fresh report that hasn't shown up in the auto-pipeline yet.
 *
 *   kind = 'hide'
 *     Soft-deletes a baseline entry by id. `hide_target_id` holds the
 *     baseline row's `id` (e.g. "who-2026-don601" or "case-2026-05-11-01").
 *     Used when an editor needs to remove a duplicate / wrong / outdated
 *     entry from the live view without waiting for a redeploy.
 *
 * Why not just edit the JSON files?
 *   - JSON edits go through git → CI → Vercel rebuild (~3 min). For
 *     time-sensitive removals (e.g. retracted report) we want sub-second
 *     latency.
 *   - The CMS gives non-engineer editors a UI without teaching them git.
 *
 * Why soft-delete (deleted_at) and not hard delete?
 *   - Audit trail. We want to be able to answer "who removed entry X and
 *     when?" for compliance / dispute resolution.
 *   - Cheap. Storage is irrelevant at our scale.
 */

import { getSupabase, isSupabaseConfigured } from './supabase';
import type { SerotypeId } from '@hantawatch/shared/types';

export type EntryKind = 'insert' | 'hide';
export type EntryScope = 'china' | 'international';
export type EntryConfidence = 'official' | 'news';

/** A row from `manual_news_entries` after light normalization. */
export interface ManualNewsRow {
  id: string;
  kind: EntryKind;
  /** Populated only when kind === 'insert'. */
  insert: ManualNewsInsert | null;
  /** Populated only when kind === 'hide'. */
  hideTargetId: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface ManualNewsInsert {
  title: string;
  summary: string | null;
  scope: EntryScope;
  confidence: EntryConfidence;
  serotypeId: SerotypeId | string;
  date: string; // YYYY-MM-DD
  caseType: string;
  count: number;
  sourceName: string;
  sourceUrl: string | null;
  regionCode: string | null;
  notes: string | null;
}

/** Public-facing merged-result. Used by both the homepage useEffect and
 *  the admin panel "review" tab. */
export interface NewsEntriesPayload {
  additions: Array<ManualNewsInsert & { id: string; createdAt: string }>;
  /** Baseline ids to suppress from the rendered timeline. */
  hiddenIds: string[];
}

// ---------------------------------------------------------------------------
// Read path
// ---------------------------------------------------------------------------

export async function fetchManualNewsEntries(): Promise<ManualNewsRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('manual_news_entries')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error || !data) {
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[news-entries] fetch failed:', error.message);
    }
    return [];
  }

  return (data as Array<Record<string, unknown>>).map(rowToManualNewsRow);
}

/** Public projection: just additions + hidden ids, with no internal columns. */
export async function fetchNewsEntriesPayload(): Promise<NewsEntriesPayload> {
  const rows = await fetchManualNewsEntries();
  const additions: NewsEntriesPayload['additions'] = [];
  const hiddenIds: string[] = [];
  for (const r of rows) {
    if (r.kind === 'insert' && r.insert) {
      additions.push({ id: r.id, createdAt: r.createdAt, ...r.insert });
    } else if (r.kind === 'hide' && r.hideTargetId) {
      hiddenIds.push(r.hideTargetId);
    }
  }
  return { additions, hiddenIds };
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

export interface InsertEntryInput extends ManualNewsInsert {
  /** Optional explicit id. If omitted, we generate one. */
  id?: string;
}

/** Generate a human-friendly id like "admin-2026-05-15-abc12345". */
function generateInsertId(date: string): string {
  // 8 hex chars from a v4 uuid is plenty unique for our scale.
  const rand = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    : Math.random().toString(16).slice(2, 10);
  return `admin-${date}-${rand}`;
}

export async function insertManualNewsAddition(
  input: InsertEntryInput,
  actor: string,
): Promise<ManualNewsRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const id = input.id || generateInsertId(input.date);
  const row: Record<string, unknown> = {
    id,
    kind: 'insert',
    title: input.title,
    summary: input.summary,
    scope: input.scope,
    confidence: input.confidence,
    serotype_id: input.serotypeId,
    date: input.date,
    case_type: input.caseType,
    count: input.count,
    source_name: input.sourceName,
    source_url: input.sourceUrl,
    region_code: input.regionCode,
    notes: input.notes,
    created_by: actor,
  };

  const { data, error } = await supabase
    .from('manual_news_entries')
    .insert(row)
    .select()
    .single();
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[news-entries] insert failed:', error?.message);
    return null;
  }
  return rowToManualNewsRow(data as Record<string, unknown>);
}

export async function insertManualNewsHide(
  baselineId: string,
  actor: string,
): Promise<ManualNewsRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const id = `hide-${baselineId.slice(0, 40)}`;
  const row: Record<string, unknown> = {
    id,
    kind: 'hide',
    hide_target_id: baselineId,
    created_by: actor,
    // Reset deleted_at if a row already exists (re-hide after un-hide).
    deleted_at: null,
  };

  // Upsert because the same baseline may be hidden, un-hidden, re-hidden.
  const { data, error } = await supabase
    .from('manual_news_entries')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[news-entries] hide upsert failed:', error?.message);
    return null;
  }
  return rowToManualNewsRow(data as Record<string, unknown>);
}

/** Soft-delete a manual_news_entries row by id (admin "undo"). */
export async function softDeleteManualNewsEntry(
  id: string,
  actor: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase
    .from('manual_news_entries')
    .update({ deleted_at: new Date().toISOString(), created_by: actor })
    .eq('id', id);
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[news-entries] soft-delete failed:', error.message);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Internal mapping
// ---------------------------------------------------------------------------

function rowToManualNewsRow(r: Record<string, unknown>): ManualNewsRow {
  const kind = (r.kind as EntryKind) ?? 'insert';
  const insert: ManualNewsInsert | null = kind === 'insert' ? {
    title: (r.title as string) ?? '',
    summary: (r.summary as string | null) ?? null,
    scope: ((r.scope as EntryScope) ?? 'china'),
    confidence: ((r.confidence as EntryConfidence) ?? 'official'),
    serotypeId: (r.serotype_id as string) ?? 'other',
    date: (r.date as string) ?? '',
    caseType: (r.case_type as string) ?? 'confirmed',
    count: Number(r.count ?? 0),
    sourceName: (r.source_name as string) ?? '',
    sourceUrl: (r.source_url as string | null) ?? null,
    regionCode: (r.region_code as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  } : null;
  return {
    id: (r.id as string) ?? '',
    kind,
    insert,
    hideTargetId: (r.hide_target_id as string | null) ?? null,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    createdBy: (r.created_by as string | null) ?? null,
  };
}
