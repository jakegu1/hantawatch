/**
 * GET /api/hondius-imports — public merged list endpoint.
 *
 * Returns the baseline mv-hondius-imports.json union the approved Supabase
 * additions. The homepage fetches this in a useEffect after initial render
 * so SSR remains static and the addition layer applies progressively.
 *
 * No auth required (this is the same data that's already in the static
 * JSON, plus editor-added rows that the editor explicitly approved).
 *
 * Cache:
 *   - Forced dynamic so Vercel's edge cache doesn't pin yesterday's
 *     additions. Volume is tiny (a few rows / day) — no perf concern.
 */
import { NextResponse } from 'next/server';
import mvHondiusImportsJson from '@/data/mv-hondius-imports.json';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  fetchApprovedAdditions,
  mergeAdditionsWithBaseline,
} from '@/lib/mv-hondius-overrides';
import type { MvHondiusImport } from '@hantawatch/shared/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const baseline = (mvHondiusImportsJson.imports ?? []) as MvHondiusImport[];

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      outbreakName: mvHondiusImportsJson.outbreakName,
      outbreakClusterId: mvHondiusImportsJson.outbreakClusterId,
      imports: baseline,
      additionsCount: 0,
      supabaseReady: false,
    });
  }

  const additions = await fetchApprovedAdditions();
  const merged = mergeAdditionsWithBaseline(baseline, additions);

  return NextResponse.json({
    outbreakName: mvHondiusImportsJson.outbreakName,
    outbreakClusterId: mvHondiusImportsJson.outbreakClusterId,
    imports: merged,
    additionsCount: additions.length,
    supabaseReady: true,
  });
}
