/**
 * /api/admin/mv-imports
 *
 * Admin-gated CRUD for the MV Hondius imports addition layer.
 *
 *   GET     — list baseline (from JSON) + all additions (any status)
 *   POST    — create a new addition (auto-geocode if lat/lon missing)
 *   PATCH   — partial update by ?id=<rowId>
 *   DELETE  — soft-delete by ?id=<rowId>
 *
 * All endpoints require ADMIN_KEY env + valid `hw_admin` cookie.
 *
 * Why we combine GET-list-with-baseline here: the admin UI wants ONE round
 * trip to render the full editing table (baseline rows greyed out, addition
 * rows interactive). Two endpoints would risk an inconsistent view.
 */
import { NextRequest, NextResponse } from 'next/server';
import mvHondiusImportsJson from '@/data/mv-hondius-imports.json';
import { isAdminAuthed, isAdminConfigured } from '@/lib/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  fetchAllAdditions,
  fetchAdditionById,
  insertAddition,
  updateAddition,
  softDeleteAddition,
  additionToImport,
  mergeAdditionsWithBaseline,
  type AdditionPatch,
  type MvHondiusAdditionInput,
} from '@/lib/mv-hondius-overrides';
import { geocodeCity, GeocodeNotFoundCached } from '@/lib/geocode';
import type { MvHondiusImport, MvHondiusStatus } from '@hantawatch/shared/types';
import { findNearestImport, type ImportRecord } from '@/lib/nearest-cluster';

export const dynamic = 'force-dynamic';

const ACTOR = 'admin';

const VALID_STATUSES: MvHondiusStatus[] = [
  'monitoring',
  'presumptive_positive',
  'quarantine_active',
  'imports_confirmed',
  'closed',
];

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

function ensureSupabase(): NextResponse | null {
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
  return null;
}

/** Compute current vs proposed "nearest import" given the in-flight new row,
 *  so the admin UI can show an impact preview before persisting. */
function computeImpact(
  baseline: MvHondiusImport[],
  additionsAsImports: MvHondiusImport[],
  proposed: MvHondiusImport | null,
) {
  const before = [...baseline, ...additionsAsImports];
  const after = proposed ? [...before, proposed] : before;
  const beforeNearest = findNearestImport(before as ImportRecord[]);
  const afterNearest = findNearestImport(after as ImportRecord[]);
  const nearestChanged =
    !!proposed &&
    (!beforeNearest ||
      !afterNearest ||
      beforeNearest.iso2 !== afterNearest.iso2 ||
      beforeNearest.cityZh !== afterNearest.cityZh ||
      beforeNearest.distanceKm !== afterNearest.distanceKm);
  return { beforeNearest, afterNearest, nearestChanged };
}

/** GET — baseline + additions + current nearest snapshot. */
export async function GET(req: NextRequest) {
  const blocked = ensureAuthed(req);
  if (blocked) return blocked;

  const baseline = (mvHondiusImportsJson.imports ?? []) as MvHondiusImport[];
  const supabaseReady = isSupabaseConfigured();
  const additions = supabaseReady ? await fetchAllAdditions() : [];

  const additionImports = additions
    .filter((a) => a.proposalStatus === 'approved' && !a.deletedAt)
    .map(additionToImport);

  const merged = mergeAdditionsWithBaseline(baseline, additions);
  const nearest = findNearestImport(merged as ImportRecord[]);

  return NextResponse.json({
    outbreakName: mvHondiusImportsJson.outbreakName,
    outbreakClusterId: mvHondiusImportsJson.outbreakClusterId,
    baseline,
    additions,
    additionImports, // approved additions, in the same shape as baseline rows
    nearest,
    supabaseReady,
    generatedAt: new Date().toISOString(),
  });
}

/**
 * POST — create a new addition.
 *
 * Body:
 *   {
 *     iso2: 'US',
 *     cityZh: '洛杉矶',           // optional but recommended
 *     cityEn: 'Los Angeles',      // optional
 *     lat?: 34.05, lon?: -118.25, // if absent, server geocodes via Nominatim
 *     status: 'monitoring',
 *     asOf: '2026-06-01',
 *     confirmedImports?: 1, monitoringCount?: 0, ...
 *     summaryZh: '...',
 *     sourceName?: '...', sourceUrl?: '...',
 *     proposalStatus?: 'approved',  // default 'approved' (admin-trusted)
 *     dryRun?: true,                // if true, only return impact preview
 *   }
 */
export async function POST(req: NextRequest) {
  const blocked = ensureAuthed(req);
  if (blocked) return blocked;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  // ---- Field validation -------------------------------------------------
  const iso2 = typeof body.iso2 === 'string' ? body.iso2.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(iso2)) {
    return NextResponse.json({ error: 'iso2 required (2-letter)' }, { status: 400 });
  }

  const status = body.status as MvHondiusStatus;
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  const asOf = typeof body.asOf === 'string' ? body.asOf : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return NextResponse.json({ error: 'asOf required (YYYY-MM-DD)' }, { status: 400 });
  }

  const cityZh = typeof body.cityZh === 'string' && body.cityZh.trim() ? body.cityZh.trim() : null;
  const cityEn = typeof body.cityEn === 'string' && body.cityEn.trim() ? body.cityEn.trim() : null;

  // ---- Geocoding (skip when client supplied lat+lon explicitly) ---------
  let lat = typeof body.lat === 'number' ? body.lat : null;
  let lon = typeof body.lon === 'number' ? body.lon : null;
  let geocodeNote: string | null = null;

  if ((lat == null || lon == null) && (cityZh || cityEn)) {
    try {
      const result = await geocodeCity(iso2, cityZh ?? cityEn ?? '');
      if (result) {
        lat = result.lat;
        lon = result.lon;
        geocodeNote = result.fromCache
          ? `Cached: ${result.displayName}`
          : `Resolved: ${result.displayName}`;
      } else {
        geocodeNote = 'Geocoder returned no match; saved without lat/lon.';
      }
    } catch (err) {
      if (err instanceof GeocodeNotFoundCached) {
        geocodeNote = 'Geocoder cached miss; saved without lat/lon.';
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn('[mv-imports POST] geocode failed:', msg);
        geocodeNote = `Geocoder upstream: ${msg}`;
      }
    }
  }

  // ---- Impact preview ---------------------------------------------------
  const baseline = (mvHondiusImportsJson.imports ?? []) as MvHondiusImport[];
  const supabaseReady = isSupabaseConfigured();
  const existingAdditions = supabaseReady ? await fetchAllAdditions() : [];
  const existingApprovedImports = existingAdditions
    .filter((a) => a.proposalStatus === 'approved' && !a.deletedAt)
    .map(additionToImport);

  const proposed: MvHondiusImport = {
    iso2,
    date: asOf,
    status,
    summary_zh: typeof body.summaryZh === 'string' ? body.summaryZh : '',
    source: {
      name: typeof body.sourceName === 'string' ? body.sourceName : 'Editor-added',
      url: typeof body.sourceUrl === 'string' ? body.sourceUrl : '',
      retrievedAt: new Date().toISOString(),
      confidence: body.sourceConfidence === 'news' ? 'news' : 'official',
    },
  };
  if (cityZh) proposed.cityZh = cityZh;
  if (cityEn) proposed.city = cityEn;
  if (lat != null) proposed.lat = lat;
  if (lon != null) proposed.lon = lon;
  if (typeof body.confirmedImports === 'number') proposed.confirmedImports = body.confirmedImports;
  if (typeof body.monitoringCount === 'number') proposed.monitoringCount = body.monitoringCount;
  if (typeof body.quarantineCount === 'number') proposed.quarantineCount = body.quarantineCount;
  if (typeof body.deaths === 'number') proposed.deaths = body.deaths;

  const impact = computeImpact(baseline, existingApprovedImports, proposed);

  // ---- Dry-run short-circuit -------------------------------------------
  if (body.dryRun === true) {
    return NextResponse.json({
      dryRun: true,
      proposed,
      geocode: { lat, lon, note: geocodeNote },
      impact,
    });
  }

  // ---- Persist ---------------------------------------------------------
  const blocked2 = ensureSupabase();
  if (blocked2) return blocked2;

  const proposalStatus =
    body.proposalStatus === 'proposed' || body.proposalStatus === 'rejected'
      ? body.proposalStatus
      : 'approved';

  const input: MvHondiusAdditionInput = {
    outbreakId: mvHondiusImportsJson.outbreakClusterId ?? 'mv-hondius-2026',
    iso2,
    cityZh,
    cityEn,
    lat,
    lon,
    status,
    confirmedImports: typeof body.confirmedImports === 'number' ? body.confirmedImports : null,
    monitoringCount: typeof body.monitoringCount === 'number' ? body.monitoringCount : null,
    quarantineCount: typeof body.quarantineCount === 'number' ? body.quarantineCount : null,
    deaths: typeof body.deaths === 'number' ? body.deaths : null,
    asOf,
    summaryZh: typeof body.summaryZh === 'string' ? body.summaryZh : null,
    sourceName: typeof body.sourceName === 'string' ? body.sourceName : null,
    sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : null,
    sourceConfidence: body.sourceConfidence === 'news' ? 'news' : 'official',
    proposalStatus,
    proposedBy: ACTOR,
  };

  const saved = await insertAddition(input, ACTOR);
  if (!saved) {
    return NextResponse.json({ error: '写入 Supabase 失败' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    addition: saved,
    geocode: { lat, lon, note: geocodeNote },
    impact,
  });
}

/** PATCH /api/admin/mv-imports?id=<id> — partial update an addition row. */
export async function PATCH(req: NextRequest) {
  const blocked = ensureAuthed(req);
  if (blocked) return blocked;
  const blocked2 = ensureSupabase();
  if (blocked2) return blocked2;

  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'id query param required' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  const patch: AdditionPatch = {};
  if ('cityZh' in body) patch.cityZh = body.cityZh === '' ? null : (body.cityZh as string | null);
  if ('cityEn' in body) patch.cityEn = body.cityEn === '' ? null : (body.cityEn as string | null);
  if ('lat' in body) patch.lat = typeof body.lat === 'number' ? body.lat : null;
  if ('lon' in body) patch.lon = typeof body.lon === 'number' ? body.lon : null;
  if ('status' in body && VALID_STATUSES.includes(body.status as MvHondiusStatus)) {
    patch.status = body.status as MvHondiusStatus;
  }
  if ('confirmedImports' in body)
    patch.confirmedImports = typeof body.confirmedImports === 'number' ? body.confirmedImports : null;
  if ('monitoringCount' in body)
    patch.monitoringCount = typeof body.monitoringCount === 'number' ? body.monitoringCount : null;
  if ('quarantineCount' in body)
    patch.quarantineCount = typeof body.quarantineCount === 'number' ? body.quarantineCount : null;
  if ('deaths' in body) patch.deaths = typeof body.deaths === 'number' ? body.deaths : null;
  if ('asOf' in body && typeof body.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.asOf)) {
    patch.asOf = body.asOf;
  }
  if ('summaryZh' in body) patch.summaryZh = typeof body.summaryZh === 'string' ? body.summaryZh : null;
  if ('sourceName' in body) patch.sourceName = typeof body.sourceName === 'string' ? body.sourceName : null;
  if ('sourceUrl' in body) patch.sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : null;
  if ('sourceConfidence' in body && (body.sourceConfidence === 'news' || body.sourceConfidence === 'official')) {
    patch.sourceConfidence = body.sourceConfidence;
  }
  if (
    'proposalStatus' in body &&
    (body.proposalStatus === 'approved' ||
      body.proposalStatus === 'proposed' ||
      body.proposalStatus === 'rejected')
  ) {
    patch.proposalStatus = body.proposalStatus;
  }

  const updated = await updateAddition(id, patch, ACTOR);
  if (!updated) {
    return NextResponse.json({ error: 'Update failed (id not found or Supabase write error)' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, addition: updated });
}

/** DELETE /api/admin/mv-imports?id=<id> — soft-delete an addition row. */
export async function DELETE(req: NextRequest) {
  const blocked = ensureAuthed(req);
  if (blocked) return blocked;
  const blocked2 = ensureSupabase();
  if (blocked2) return blocked2;

  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'id query param required' }, { status: 400 });

  // Make sure it exists first — softDeleteAddition silently succeeds on
  // missing ids, but the admin UI deserves a clearer error.
  const existing = await fetchAdditionById(id);
  if (!existing) {
    return NextResponse.json({ error: 'addition not found' }, { status: 404 });
  }

  const ok = await softDeleteAddition(id, ACTOR);
  if (!ok) {
    return NextResponse.json({ error: 'Soft-delete failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
