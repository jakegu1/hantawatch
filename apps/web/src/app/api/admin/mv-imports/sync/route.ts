/**
 * POST /api/admin/mv-imports/sync
 *
 * One-click "promote Supabase additions to committed JSON baseline."
 *
 * Why this exists:
 *   - The runtime overlay (Supabase additions merged at request time) is
 *     the *operational* state. It reflects edits made in /admin within
 *     seconds, but it's invisible to anyone reading the repo or to
 *     downstream collectors that scan mv-hondius-imports.json.
 *   - This endpoint flushes the overlay into the committed JSON, so the
 *     editor's work becomes part of the repo's history (and the addition
 *     rows then disappear from /admin's "pending" pile).
 *
 * Workflow:
 *   1. Editor adds events via /admin (Supabase grows).
 *   2. Editor clicks "同步到 JSON" → this endpoint runs.
 *   3. Server merges approved+non-deleted additions into baseline JSON
 *      (deduping on iso2+cityZh+date), writes the file via Node fs.
 *   4. Server soft-deletes the merged additions (decided_by='sync-script').
 *   5. Editor sees the local diff, commits + pushes → Vercel redeploys.
 *
 * Dev-only:
 *   - Vercel's serverless functions are READ-ONLY filesystem; fs.writeFile
 *     to a tracked file would either silently no-op or throw. We refuse to
 *     run in production (NODE_ENV==='production' AND VERCEL===1) to avoid
 *     surprises.
 *   - Local dev (`pnpm dev`) writes the file normally.
 *
 * Body (optional):
 *   { dryRun?: true }   // skip persistence; return diff preview only.
 *
 * 200 → { ok, written, softDeletedIds, jsonPath, additions, dryRun }
 * 503 → { error: 'sync only available in local dev' }
 * 401 / 503 / 500 as usual.
 */
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isAdminAuthed, isAdminConfigured } from '@/lib/admin-auth';
import { isSupabaseConfigured, getSupabase } from '@/lib/supabase';
import {
  fetchApprovedAdditions,
  additionToImport,
  type MvHondiusAddition,
} from '@/lib/mv-hondius-overrides';
import type { MvHondiusImport } from '@hantawatch/shared/types';

export const dynamic = 'force-dynamic';

const JSON_PATH = path.resolve(
  process.cwd(),
  'src',
  'data',
  'mv-hondius-imports.json',
);

/** Match the union key used by the runtime merger so dry-run + persist
 *  agree on what's a duplicate. */
function keyOf(r: { iso2: string; cityZh?: string | null; date: string }): string {
  return `${(r.iso2 ?? '').toUpperCase()}|${(r.cityZh ?? '').trim()}|${r.date}`;
}

/** Merge an addition into baseline. Returns:
 *   - updated baseline list
 *   - the action taken per addition ('inserted' vs 'replaced') for the UI. */
function mergeIntoBaseline(
  baseline: MvHondiusImport[],
  additions: MvHondiusAddition[],
): { merged: MvHondiusImport[]; actions: Array<{ id: string; key: string; action: 'inserted' | 'replaced' }> } {
  const dedup = new Map<string, MvHondiusImport>();
  for (const b of baseline) dedup.set(keyOf(b), b);

  const actions: Array<{ id: string; key: string; action: 'inserted' | 'replaced' }> = [];
  for (const a of additions) {
    const imp = additionToImport(a);
    const k = keyOf(imp);
    const had = dedup.has(k);
    dedup.set(k, imp);
    actions.push({ id: a.id, key: k, action: had ? 'replaced' : 'inserted' });
  }

  // Sort by date descending so the JSON file's "imports" array starts with
  // the most recent event — easier to eyeball changes in `git diff`.
  const merged = Array.from(dedup.values()).sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''));
  return { merged, actions };
}

export async function POST(req: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Admin not configured (ADMIN_KEY env missing)' },
      { status: 503 },
    );
  }
  if (!isAdminAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Block production. Read-only FS on Vercel; running this would corrupt
  // state silently. Force dev-only.
  const isVercelProd = process.env.NODE_ENV === 'production' && process.env.VERCEL === '1';
  if (isVercelProd) {
    return NextResponse.json(
      {
        error:
          '同步操作仅在本地开发环境可用。请在你的电脑上跑 `pnpm dev`，' +
          '然后在本地 /admin 页面执行同步，最后 git push 把更新后的 JSON 部署到线上。',
      },
      { status: 503 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase 未配置，无法读取待同步行。' },
      { status: 503 },
    );
  }

  let body: { dryRun?: boolean } = {};
  try {
    body = (await req.json()) as { dryRun?: boolean };
  } catch {
    // No body is fine.
  }
  const dryRun = body.dryRun === true;

  // ---- Read current JSON ------------------------------------------------
  let raw: string;
  try {
    raw = await fs.readFile(JSON_PATH, 'utf-8');
  } catch (err) {
    return NextResponse.json(
      { error: `读取 ${JSON_PATH} 失败: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
  let jsonDoc: {
    __generated_by?: string;
    __generated_at?: string;
    __deprecated_in_favor_of?: string;
    __notes?: string;
    outbreakName?: string;
    outbreakClusterId?: string;
    imports?: MvHondiusImport[];
  };
  try {
    jsonDoc = JSON.parse(raw);
  } catch (err) {
    return NextResponse.json(
      { error: `解析 mv-hondius-imports.json 失败: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
  const baseline = Array.isArray(jsonDoc.imports) ? jsonDoc.imports : [];

  // ---- Read additions ---------------------------------------------------
  const additions = await fetchApprovedAdditions();
  if (additions.length === 0) {
    return NextResponse.json({
      ok: true,
      written: 0,
      softDeletedIds: [],
      jsonPath: JSON_PATH,
      additions: [],
      actions: [],
      dryRun,
      message: '没有待同步的 addition 行。',
    });
  }

  // ---- Merge ------------------------------------------------------------
  const { merged, actions } = mergeIntoBaseline(baseline, additions);

  // ---- Dry-run short-circuit -------------------------------------------
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      jsonPath: JSON_PATH,
      written: 0,
      softDeletedIds: [],
      additions: additions.map((a) => ({ id: a.id, iso2: a.iso2, cityZh: a.cityZh, asOf: a.asOf })),
      actions,
      previewImports: merged,
    });
  }

  // ---- Write JSON ------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  const updatedDoc = {
    ...jsonDoc,
    __generated_by: 'hand-curated by editors + supabase sync',
    __generated_at: today,
    imports: merged,
  };
  // 2-space indent matches the existing file's style so git diff stays clean.
  const serialized = JSON.stringify(updatedDoc, null, 2) + '\n';
  try {
    await fs.writeFile(JSON_PATH, serialized, 'utf-8');
  } catch (err) {
    return NextResponse.json(
      {
        error:
          `写入 ${JSON_PATH} 失败: ${err instanceof Error ? err.message : String(err)}。` +
          ' 若运行环境为 Vercel/Edge，请改在本地执行。',
      },
      { status: 500 },
    );
  }

  // ---- Soft-delete merged additions ------------------------------------
  // We do this AFTER the JSON write succeeds, so a write failure leaves
  // Supabase intact (the editor can retry safely).
  const supabase = getSupabase();
  const softDeletedIds: string[] = [];
  if (supabase) {
    const now = new Date().toISOString();
    const ids = additions.map((a) => a.id);
    const { error } = await supabase
      .from('mv_hondius_imports_additions')
      .update({
        deleted_at: now,
        decided_by: 'sync-script',
        decided_at: now,
      })
      .in('id', ids);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[mv-imports/sync] soft-delete failed:', error.message);
      // Non-fatal: JSON is already updated. Surface the warning to the
      // editor so they know to clean up Supabase manually.
      return NextResponse.json({
        ok: true,
        partialFailure: true,
        warning: `JSON 已更新，但软删除 Supabase 行失败: ${error.message}`,
        written: merged.length,
        jsonPath: JSON_PATH,
        softDeletedIds: [],
        additions: additions.map((a) => ({ id: a.id, iso2: a.iso2, cityZh: a.cityZh })),
        actions,
        dryRun: false,
      });
    }
    softDeletedIds.push(...ids);
  }

  return NextResponse.json({
    ok: true,
    written: merged.length,
    softDeletedIds,
    jsonPath: JSON_PATH,
    additions: additions.map((a) => ({ id: a.id, iso2: a.iso2, cityZh: a.cityZh })),
    actions,
    dryRun: false,
  });
}
