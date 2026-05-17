import { NextRequest, NextResponse } from 'next/server';
import recentCasesIntlJson from '@/data/recent-cases-intl.json';
import recentCasesChinaJson from '@/data/recent-cases-china.json';
import {
  fetchManualNewsEntries,
  insertManualNewsAddition,
  insertManualNewsHide,
  softDeleteManualNewsEntry,
  type EntryConfidence,
  type EntryScope,
  type InsertEntryInput,
} from '@/lib/news-entries';
import { isAdminAuthed, isAdminConfigured } from '@/lib/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Admin endpoints for managing the recent-cases timeline overlay.
 *
 *   GET    /api/admin/news-entries
 *     Returns:
 *       {
 *         rows: ManualNewsRow[],     // all current admin rows (live + active)
 *         baselineForHide: [...],    // simplified baseline entries the editor
 *                                    // can choose to hide
 *         supabaseReady: boolean,
 *       }
 *
 *   POST   /api/admin/news-entries
 *     Body (add new entry):
 *       { kind: 'insert', payload: { title, summary, scope, ... } }
 *     Body (hide existing baseline entry):
 *       { kind: 'hide', baselineId: 'who-2026-don601' }
 *     Returns the saved row.
 *
 *   DELETE /api/admin/news-entries?id=admin-...
 *     Soft-deletes a manual row (works for both insert and hide rows).
 *     For 'hide' rows this effectively un-hides the baseline entry.
 *
 * Auth: middleware gates the path; every handler additionally calls
 * isAdminAuthed for defense-in-depth.
 */
export const dynamic = 'force-dynamic';

interface BaselineRow {
  id: string;
  title?: string;
  date: string;
  scope: 'china' | 'international';
  serotypeId?: string;
  source?: { name?: string; confidence?: string };
}

function ensureAuthed(req: NextRequest): NextResponse | null {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Admin not configured (ADMIN_KEY env missing)' },
      { status: 503 },
    );
  }
  if (!isAdminAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/** Light projection of baseline rows for the "hide existing" dropdown.
 *  We deliberately don't ship the full body — the editor only needs to
 *  identify which row to suppress. */
function collectBaselineForHide(): BaselineRow[] {
  const intl = ((recentCasesIntlJson.cases ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: (c.id as string) ?? '',
    title: (c.title as string) ?? '',
    date: (c.date as string) ?? '',
    scope: 'international' as const,
    serotypeId: (c.serotypeId as string) ?? undefined,
    source: c.source as { name?: string; confidence?: string } | undefined,
  }));
  const china = ((recentCasesChinaJson.cases ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: (c.id as string) ?? '',
    title: (c.title as string) ?? '',
    date: (c.date as string) ?? '',
    scope: 'china' as const,
    serotypeId: (c.serotypeId as string) ?? undefined,
    source: c.source as { name?: string; confidence?: string } | undefined,
  }));
  return [...intl, ...china]
    .filter((r) => r.id.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 50); // 50 is enough — older entries scroll out of the homepage anyway
}

export async function GET(req: NextRequest) {
  const blocked = ensureAuthed(req);
  if (blocked) return blocked;

  const supabaseReady = isSupabaseConfigured();
  const rows = supabaseReady ? await fetchManualNewsEntries() : [];
  const baselineForHide = collectBaselineForHide();

  return NextResponse.json({
    rows,
    baselineForHide,
    supabaseReady,
    generatedAt: new Date().toISOString(),
  });
}

// ---- Helpers -----------------------------------------------------------

const VALID_SCOPE = new Set(['china', 'international']);
const VALID_CONFIDENCE = new Set(['official', 'surveillance', 'news']);
// Mirrors packages/shared/src/types/index.ts → SerotypeId. Keep in sync.
const VALID_SEROTYPE = new Set([
  'hantaan', 'seoul', 'puumala', 'andes', 'sin_nombre', 'other',
]);

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t.length === 0) return null;
  return t.slice(0, max);
}

function requireStr(v: unknown, max: number): string | null {
  return clampStr(v, max);
}

function sanitizeInsertPayload(raw: unknown): InsertEntryInput | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'payload must be an object' };
  const p = raw as Record<string, unknown>;

  const title = requireStr(p.title, 240);
  if (!title) return { error: 'title required' };

  const scope = clampStr(p.scope, 32) as EntryScope | null;
  if (!scope || !VALID_SCOPE.has(scope)) return { error: "scope must be 'china' or 'international'" };

  const confidence = clampStr(p.confidence, 32) as EntryConfidence | null;
  if (!confidence || !VALID_CONFIDENCE.has(confidence)) return { error: "confidence must be 'official', 'surveillance', or 'news'" };

  const date = clampStr(p.date, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date must be YYYY-MM-DD' };

  const serotypeId = clampStr(p.serotypeId, 32) ?? 'other';
  if (!VALID_SEROTYPE.has(serotypeId)) return { error: `serotypeId must be one of ${[...VALID_SEROTYPE].join(', ')}` };

  const sourceName = requireStr(p.sourceName, 120);
  if (!sourceName) return { error: 'sourceName required' };

  return {
    title,
    summary: clampStr(p.summary, 2000),
    scope,
    confidence,
    serotypeId,
    date,
    caseType: clampStr(p.caseType, 32) ?? 'confirmed',
    count: Number.isFinite(Number(p.count)) ? Math.max(0, Math.floor(Number(p.count))) : 0,
    sourceName,
    sourceUrl: clampStr(p.sourceUrl, 500),
    regionCode: clampStr(p.regionCode, 16),
    notes: clampStr(p.notes, 500),
  };
}

// ---- POST: add or hide ------------------------------------------------

export async function POST(req: NextRequest) {
  const blocked = ensureAuthed(req);
  if (blocked) return blocked;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          'Supabase 未配置 — 请在 Vercel 添加 SUPABASE_URL/SERVICE_ROLE_KEY 并在 SQL 编辑器执行 docs/supabase-schema.sql。',
      },
      { status: 503 },
    );
  }

  let body: { kind?: unknown; payload?: unknown; baselineId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  if (body.kind === 'insert') {
    const sanitized = sanitizeInsertPayload(body.payload);
    if ('error' in sanitized) {
      return NextResponse.json({ error: sanitized.error }, { status: 400 });
    }
    const saved = await insertManualNewsAddition(sanitized, 'admin');
    if (!saved) {
      return NextResponse.json(
        { error: '写入失败。确认 Supabase 已建表（docs/supabase-schema.sql）。' },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, row: saved });
  }

  if (body.kind === 'hide') {
    const baselineId = clampStr(body.baselineId, 240);
    if (!baselineId) {
      return NextResponse.json({ error: 'baselineId required' }, { status: 400 });
    }
    const saved = await insertManualNewsHide(baselineId, 'admin');
    if (!saved) {
      return NextResponse.json(
        { error: '写入失败。确认 Supabase 已建表。' },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, row: saved });
  }

  return NextResponse.json({ error: "kind must be 'insert' or 'hide'" }, { status: 400 });
}

// ---- DELETE: soft-delete a manual row --------------------------------

export async function DELETE(req: NextRequest) {
  const blocked = ensureAuthed(req);
  if (blocked) return blocked;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase 未配置 — 请先按 docs/supabase-schema.sql 建表。' },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 });
  }

  const ok = await softDeleteManualNewsEntry(id, 'admin');
  if (!ok) {
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
