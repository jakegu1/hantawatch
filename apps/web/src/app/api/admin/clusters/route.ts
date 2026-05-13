import { NextRequest, NextResponse } from 'next/server';
import activeClustersJson from '@/data/active-clusters.json';
import {
  fetchClusterOverrides,
  upsertClusterOverride,
  applyClusterOverride,
  type OverridePatch,
} from '@/lib/cluster-overrides';
import { isAdminAuthed, isAdminConfigured } from '@/lib/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Admin-only cluster override endpoints.
 *
 *   GET  /api/admin/clusters
 *     Returns the merged cluster list AND the raw overrides keyed by id.
 *     This lets the review-queue UI show "current effective value" plus
 *     a clear marker of which fields were manually overridden.
 *
 *   POST /api/admin/clusters
 *     Body: { clusterId: string, patch: OverridePatch }
 *     Upserts the override for one cluster. Returns the updated effective
 *     cluster object.
 *
 * Auth: middleware gates this path, and every handler additionally calls
 * `isAdminAuthed` (defense in depth — same pattern as /api/alert/list).
 */
export const dynamic = 'force-dynamic';

interface BaselineCluster {
  id: string;
  confirmedCases?: number;
  suspectedCases?: number;
  deaths?: number;
  lastUpdate?: string;
  whoRiskLevel?: string;
  [k: string]: unknown;
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

export async function GET(req: NextRequest) {
  const blocked = ensureAuthed(req);
  if (blocked) return blocked;

  const supabaseReady = isSupabaseConfigured();
  const baseline = (activeClustersJson.clusters as BaselineCluster[]) ?? [];
  const overrides = supabaseReady ? await fetchClusterOverrides() : new Map();

  // For each baseline cluster, return both the *effective* (merged) values
  // and the raw override (or null if none). The UI uses both: the inputs
  // pre-fill with effective values; an "已覆盖" badge shows where the
  // editor previously customized the data.
  const items = baseline.map((c) => {
    const ov = overrides.get(c.id);
    return {
      baseline: c,
      effective: applyClusterOverride(c, ov),
      override: ov ?? null,
    };
  });

  return NextResponse.json({
    clusters: items,
    supabaseReady,
    generatedAt: new Date().toISOString(),
  });
}

function sanitizeIntOrNull(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined; // ignore invalid
  return Math.floor(n);
}

export async function POST(req: NextRequest) {
  const blocked = ensureAuthed(req);
  if (blocked) return blocked;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          'Supabase 未配置 — 请在 Vercel 环境变量中添加 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY，' +
          '并在 Supabase SQL 编辑器中执行 docs/supabase-schema.sql 中的 cluster_overrides 建表语句。',
      },
      { status: 503 },
    );
  }

  let body: { clusterId?: unknown; patch?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  const clusterId = typeof body.clusterId === 'string' ? body.clusterId.trim() : '';
  if (!clusterId) {
    return NextResponse.json({ error: 'clusterId required' }, { status: 400 });
  }

  // Validate against baseline — we don't let the editor invent cluster IDs.
  const baseline = (activeClustersJson.clusters as BaselineCluster[]) ?? [];
  const target = baseline.find((c) => c.id === clusterId);
  if (!target) {
    return NextResponse.json(
      { error: `Unknown clusterId: ${clusterId}` },
      { status: 404 },
    );
  }

  const rawPatch = (body.patch && typeof body.patch === 'object'
    ? body.patch
    : {}) as Record<string, unknown>;

  // Normalise and validate each field. We intentionally keep this verbose
  // (per field) rather than a generic loop, so the type contract is
  // obvious in code review.
  const patch: OverridePatch = {};
  if ('confirmedCases' in rawPatch) {
    const v = sanitizeIntOrNull(rawPatch.confirmedCases);
    if (v !== undefined) patch.confirmedCases = v;
  }
  if ('suspectedCases' in rawPatch) {
    const v = sanitizeIntOrNull(rawPatch.suspectedCases);
    if (v !== undefined) patch.suspectedCases = v;
  }
  if ('deaths' in rawPatch) {
    const v = sanitizeIntOrNull(rawPatch.deaths);
    if (v !== undefined) patch.deaths = v;
  }
  if ('lastUpdate' in rawPatch) {
    const v = rawPatch.lastUpdate;
    if (v === null) patch.lastUpdate = null;
    else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      patch.lastUpdate = v;
    } else if (typeof v === 'string' && v === '') {
      patch.lastUpdate = null;
    }
  }
  if ('whoRiskLevel' in rawPatch) {
    const v = rawPatch.whoRiskLevel;
    if (v === null || v === '') patch.whoRiskLevel = null;
    else if (typeof v === 'string') patch.whoRiskLevel = v.slice(0, 100);
  }
  if ('note' in rawPatch) {
    const v = rawPatch.note;
    if (v === null || v === '') patch.note = null;
    else if (typeof v === 'string') patch.note = v.slice(0, 500);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'patch is empty after validation' }, { status: 400 });
  }

  const saved = await upsertClusterOverride(clusterId, patch, 'admin');
  if (!saved) {
    return NextResponse.json(
      {
        error:
          '写入失败。可能是 Supabase 未建表（运行 docs/supabase-schema.sql）或 service_role 权限不足。',
      },
      { status: 500 },
    );
  }

  const effective = applyClusterOverride(target, saved);
  return NextResponse.json({ ok: true, effective, override: saved });
}
