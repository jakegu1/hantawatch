import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthed, isAdminConfigured } from '@/lib/admin-auth';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * GET /api/feedback/list
 *
 * Admin-only. Returns recent feedback from the Supabase `feedback` table.
 * Previous version read from an ephemeral JSON file — always returned []
 * on Vercel. Rewritten 2026-05-16 to use the same Supabase table as the
 * submit route.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Admin not configured (ADMIN_KEY env missing)' },
      { status: 503 },
    );
  }
  if (!isAdminAuthed(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json([]);
  }

  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[feedback/list] supabase error:', error.message);
    return NextResponse.json(
      { error: '读取反馈失败' },
      { status: 500 },
    );
  }

  return NextResponse.json(data ?? []);
}
