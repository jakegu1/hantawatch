import { NextResponse } from 'next/server';
import outbreakStatusJson from '@/data/outbreak-status.json';
import {
  applyImportsOverridesToOutbreaks,
  fetchImportsOverrides,
} from '@/lib/imports-overrides';

/**
 * GET /api/outbreak-status
 *
 * Public endpoint. Baseline from outbreak-status.json with approved
 * Supabase imports_overrides merged at request time (P2).
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const baseline = (outbreakStatusJson as { outbreaks?: unknown[] }).outbreaks ?? [];
  let outbreaks = baseline;
  let overrideCount = 0;

  try {
    const overrides = await fetchImportsOverrides();
    overrideCount = overrides.length;
    if (overrides.length) {
      outbreaks = applyImportsOverridesToOutbreaks(
        baseline as Parameters<typeof applyImportsOverridesToOutbreaks>[0],
        overrides,
      );
    }
  } catch {
    // Fall back to baseline when Supabase is down.
  }

  return NextResponse.json({
    outbreaks,
    overrideCount,
    generatedAt:
      (outbreakStatusJson as { __generated_at?: string }).__generated_at ??
      new Date().toISOString(),
  }, {
    headers: { 'cache-control': 'no-store, max-age=0' },
  });
}
