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
  const primary = await supabase
    .from('alert_subscriptions')
    .select('channel, contact, regions, serotypes, threshold, source, confirmed, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  let data: any[] | null = primary.data;
  let error = primary.error;

  if (error && /column .*alert_subscriptions\.(channel|contact).* does not exist/i.test(error.message)) {
    const fallback = await supabase
      .from('alert_subscriptions')
      .select('email, regions, serotypes, threshold, source, confirmed, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const subscribers = (data ?? []).map((row: any) => {
    const channel = row.channel === 'phone' ? 'phone' : 'email';
    const contact = String(row.contact ?? row.email ?? '');
    return {
      channel,
      contact,
      email: channel === 'email' ? contact : '',
      regions: row.regions ?? [],
      serotypes: row.serotypes ?? [],
      threshold: row.threshold ?? null,
      source: row.source ?? null,
      confirmed: Boolean(row.confirmed),
      created_at: row.created_at,
    };
  });

  return NextResponse.json({
    count: subscribers.length,
    subscribers,
  });
}
