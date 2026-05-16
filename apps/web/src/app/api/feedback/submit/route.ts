import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * POST /api/feedback/submit
 *
 * Persists anonymous user feedback to the `feedback` table in Supabase.
 *
 * Previous implementation wrote to `data/feedback/feedback.json` on disk,
 * which silently lost every entry on Vercel serverless (ephemeral FS).
 * The in-memory Map rate-limiter was equally useless (fresh Map per cold
 * start). Both issues are documented in the 2026-05-16 audit.
 *
 * When Supabase is not configured, falls back to console.log so dev-mode
 * feedback is at least visible in `pnpm dev` terminal output.
 */

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  let h = 0;
  for (let i = 0; i < ip.length; i++) {
    h = (Math.imul(31, h) + ip.charCodeAt(i)) | 0;
  }
  return `ip_${(h >>> 0).toString(36)}`;
}

export async function POST(request: NextRequest) {
  let body: { type?: string; message?: string; contact?: string; website?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '无效的请求数据' }, { status: 400 });
  }

  // Honeypot check — hidden field filled by bots
  const honeypot = !!body.website && body.website.length > 0;

  // Validation
  if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
    return NextResponse.json({ error: '反馈内容不能为空' }, { status: 400 });
  }
  if (body.message.length > 2000) {
    return NextResponse.json({ error: '反馈内容不能超过2000字' }, { status: 400 });
  }

  const fwdFor = request.headers.get('x-forwarded-for');
  const ip = fwdFor ? fwdFor.split(',')[0].trim() : null;

  const entry = {
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category: body.type ?? 'other',
    content: body.message.trim(),
    contact: body.contact?.trim() || null,
    page: '/',
    ip_hash: hashIp(ip),
    user_agent: (request.headers.get('user-agent') ?? '').slice(0, 256),
    honeypot,
  };

  // ---- Path A: Supabase configured — persist ----
  if (isSupabaseConfigured()) {
    const supabase = getSupabase()!;
    const { error } = await supabase.from('feedback').insert(entry);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[feedback] supabase insert error:', error.message);
      return NextResponse.json({ error: '存储错误，请稍后重试' }, { status: 500 });
    }
    return NextResponse.json({ success: true }, { status: 201 });
  }

  // ---- Path B: dev fallback — log only ----
  // eslint-disable-next-line no-console
  console.log('[feedback:dev]', entry);
  return NextResponse.json(
    { success: true, message: '反馈已记录（开发模式：仅输出日志）' },
    { status: 201 },
  );
}
