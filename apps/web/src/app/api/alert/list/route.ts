import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * GET /api/alert/list?key=<ADMIN_KEY>
 *
 * Lists subscribers (newest first, capped at 500). Only the owner of ADMIN_KEY
 * can read. Returns 503 when Supabase is not configured.
 */
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin_key_2026';

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (key !== ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase not configured', subscribers: [] },
      { status: 503 },
    );
  }

  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from('alert_subscriptions')
    .select('email, regions, serotypes, threshold, source, confirmed, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    count: data?.length ?? 0,
    subscribers: data ?? [],
  });
}
