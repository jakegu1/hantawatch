import { NextResponse } from 'next/server';
import activeClustersJson from '@/data/active-clusters.json';
import { fetchClusterOverrides, applyClusterOverride } from '@/lib/cluster-overrides';

/**
 * GET /api/clusters
 *
 * Public endpoint. Returns the active-clusters list with the latest
 * editorial overrides applied. Used by the homepage to live-refresh case
 * counts and other manually-curated fields without waiting for a redeploy.
 *
 * Caching:
 *   - We mark this route as `force-dynamic` and `revalidate = 0` so each
 *     request hits Supabase. The payload is ~1 kB so this is cheap.
 *   - Edge clients (the homepage) further fetch with `cache: 'no-store'`.
 *
 * Failure mode:
 *   - If Supabase is misconfigured / down, we fall back silently to the
 *     baseline JSON. Better to show slightly stale numbers than to break
 *     the homepage entirely.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface BaselineCluster {
  id: string;
  confirmedCases?: number;
  suspectedCases?: number;
  deaths?: number;
  lastUpdate?: string;
  whoRiskLevel?: string;
  [k: string]: unknown;
}

export async function GET() {
  const baseline = (activeClustersJson.clusters as BaselineCluster[]) ?? [];

  let overrides;
  try {
    overrides = await fetchClusterOverrides();
  } catch {
    overrides = new Map();
  }

  const merged = baseline.map((c) => applyClusterOverride(c, overrides.get(c.id)));

  return NextResponse.json(
    {
      clusters: merged,
      currentHpi: activeClustersJson.currentHpi,
      overrideCount: overrides.size,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        // Belt-and-braces: instruct any intermediate CDN not to cache.
        // Vercel respects this for API routes.
        'cache-control': 'no-store, max-age=0',
      },
    },
  );
}
