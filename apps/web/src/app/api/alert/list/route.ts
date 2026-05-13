import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { isAdminAuthed, isAdminConfigured } from '@/lib/admin-auth';

/**
 * GET /api/alert/list
 *
 * Lists subscribers (newest first, capped at 500). Auth is checked by
 * middleware AND by this handler — see `lib/admin-auth`. Returns 503 when
 * either ADMIN_KEY env is missing OR Supabase is not configured.
 */

export async function GET(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Admin not configured (ADMIN_KEY env missing)', subscribers: [] },
      { status: 503 },
    );
  }
  if (!isAdminAuthed(request)) {
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
