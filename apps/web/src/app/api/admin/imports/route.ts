import { NextRequest, NextResponse } from 'next/server';
import outbreakStatusJson from '@/data/outbreak-status.json';
import {
  applyImportsOverridesToOutbreaks,
  fetchAllImportsOverrides,
  fetchImportProposals,
  upsertImportsOverride,
  type ImportOverridePatch,
} from '@/lib/imports-overrides';
import { isAdminAuthed, isAdminConfigured } from '@/lib/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

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

/** GET — proposals queue + baseline/effective outbreak preview. */
export async function GET(req: NextRequest) {
  const blocked = ensureAuthed(req);
  if (blocked) return blocked;

  const supabaseReady = isSupabaseConfigured();
  const baseline = (outbreakStatusJson as { outbreaks?: unknown[] }).outbreaks ?? [];
  const allOverrides = supabaseReady ? await fetchAllImportsOverrides() : [];
  const proposals = supabaseReady ? await fetchImportProposals() : [];
  const approved = allOverrides.filter((o) => o.status === 'approved');
  const effective = applyImportsOverridesToOutbreaks(
    baseline as Parameters<typeof applyImportsOverridesToOutbreaks>[0],
    approved,
  );

  return NextResponse.json({
    proposals,
    outbreaks: { baseline, effective },
    supabaseReady,
    generatedAt: new Date().toISOString(),
  });
}

/**
 * POST — approve or reject a proposal (or patch an approved row).
 * Body: { outbreakId, iso2, action: 'approve' | 'reject', patch?: ImportOverridePatch }
 */
export async function POST(req: NextRequest) {
  const blocked = ensureAuthed(req);
  if (blocked) return blocked;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          'Supabase 未配置。请设置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，' +
          '并在 Supabase SQL 编辑器执行 docs/supabase-schema.sql。',
      },
      { status: 503 },
    );
  }

  let body: {
    outbreakId?: unknown;
    iso2?: unknown;
    action?: unknown;
    patch?: unknown;
    suppressDays?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  const outbreakId = typeof body.outbreakId === 'string' ? body.outbreakId.trim() : '';
  const iso2 = typeof body.iso2 === 'string' ? body.iso2.trim().toUpperCase() : '';
  const action = body.action;

  if (!outbreakId || !iso2) {
    return NextResponse.json({ error: 'outbreakId and iso2 required' }, { status: 400 });
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  }

  const rawPatch = (body.patch && typeof body.patch === 'object'
    ? body.patch
    : {}) as Record<string, unknown>;

  const patch: ImportOverridePatch = { status: action === 'approve' ? 'approved' : 'rejected' };
  patch.decidedBy = 'admin';

  if (action === 'reject') {
    const days = typeof body.suppressDays === 'number' ? body.suppressDays : 30;
    const until = new Date();
    until.setUTCDate(until.getUTCDate() + Math.max(1, Math.floor(days)));
    patch.suppressUntilAt = until.toISOString();
  }

  if ('confirmed' in rawPatch) patch.confirmed = sanitizeInt(rawPatch.confirmed);
  if ('monitoring' in rawPatch) patch.monitoring = sanitizeInt(rawPatch.monitoring);
  if ('deaths' in rawPatch) patch.deaths = sanitizeInt(rawPatch.deaths);
  if ('summaryZh' in rawPatch && typeof rawPatch.summaryZh === 'string') {
    patch.summaryZh = rawPatch.summaryZh.slice(0, 200);
  }
  if ('note' in rawPatch && typeof rawPatch.note === 'string') {
    patch.note = rawPatch.note.slice(0, 500);
  }

  const saved = await upsertImportsOverride(outbreakId, iso2, patch, 'admin');
  if (!saved) {
    return NextResponse.json({ error: '写入 Supabase 失败' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, override: saved });
}

function sanitizeInt(v: unknown): number | null | undefined {
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}
