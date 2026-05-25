import { NextResponse } from 'next/server';
import outbreakStatusJson from '@/data/outbreak-status.json';

/**
 * GET /api/outbreak-status
 *
 * Public endpoint. Returns the normalized outbreak-status ledger.
 * Until P2 lands, Supabase overrides are not applied (baseline only).
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const outbreaks = (outbreakStatusJson as { outbreaks?: unknown[] }).outbreaks ?? [];
  return NextResponse.json({
    outbreaks,
    generatedAt: (outbreakStatusJson as { __generated_at?: string }).__generated_at ?? new Date().toISOString(),
  });
}
