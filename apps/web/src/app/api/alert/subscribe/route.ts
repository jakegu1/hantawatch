import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * POST /api/alert/subscribe
 *
 * Persists the subscriber's contact (email OR phone) into Supabase if
 * configured, otherwise logs to the server console (dev mode). Sending is
 * intentionally deferred — we only collect contact info for now.
 *
 * Expected table (Supabase SQL):
 *
 *   create table public.alert_subscriptions (
 *     id uuid primary key default gen_random_uuid(),
 *     channel text not null check (channel in ('email','phone')),
 *     contact text not null,
 *     regions text[] default '{*}',
 *     serotypes text[] default '{*}',
 *     threshold text default 'crossing',
 *     source text,
 *     user_agent text,
 *     ip_hash text,
 *     confirmed boolean default false,
 *     created_at timestamptz default now(),
 *     unique (channel, contact)
 *   );
 *   alter table public.alert_subscriptions enable row level security;
 *   -- (No public policy: only the service-role key can write/read.)
 */

// Basic shape; reject anything else.
interface SubscribeBody {
  // New schema (preferred):
  channel?: 'email' | 'phone';
  contact?: string;
  // Back-compat: callers may still send `email`.
  email?: string;
  regions?: string[];
  serotypes?: string[];
  threshold?: string;
  source?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Chinese mainland mobile numbers — 11 digits starting with 1, second digit 3-9.
// Accepts optional +86 / 86 / spaces / dashes before normalisation.
const PHONE_RE = /^1[3-9]\d{9}$/;

function normalisePhone(raw: string): string {
  // Strip spaces, dashes, parens, leading +86 or 86 country code.
  const cleaned = raw.replace(/[\s\-()]/g, '').replace(/^\+?86/, '');
  return cleaned;
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  // Lightweight non-crypto hash; we only need de-duplication, not security.
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = ((h << 5) - h + ip.charCodeAt(i)) | 0;
  return `ip_${(h >>> 0).toString(36)}`;
}

export async function POST(request: Request) {
  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  // Resolve channel + contact, with back-compat for { email } payloads.
  let channel: 'email' | 'phone';
  let contact: string;
  if (body.channel === 'phone') {
    channel = 'phone';
    contact = normalisePhone((body.contact || '').trim());
    if (!PHONE_RE.test(contact)) {
      return NextResponse.json({ error: '手机号格式不正确（仅支持中国大陆 11 位手机号）' }, { status: 400 });
    }
  } else {
    // Default to email — accepts either `contact` (new) or `email` (legacy).
    channel = 'email';
    contact = ((body.channel === 'email' ? body.contact : body.email) || body.contact || body.email || '')
      .trim()
      .toLowerCase();
    if (!EMAIL_RE.test(contact)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
    }
    if (contact.length > 254) {
      return NextResponse.json({ error: '邮箱过长' }, { status: 400 });
    }
  }

  const regions = Array.isArray(body.regions) && body.regions.length > 0 ? body.regions.slice(0, 10) : ['*'];
  const serotypes = Array.isArray(body.serotypes) && body.serotypes.length > 0 ? body.serotypes.slice(0, 10) : ['*'];
  const threshold = typeof body.threshold === 'string' ? body.threshold.slice(0, 32) : 'crossing';
  const source = typeof body.source === 'string' ? body.source.slice(0, 64) : 'web';

  const userAgent = request.headers.get('user-agent')?.slice(0, 256) ?? null;
  const fwdFor = request.headers.get('x-forwarded-for');
  const ip = fwdFor ? fwdFor.split(',')[0].trim() : null;
  const ipHash = hashIp(ip);

  const successMsg =
    channel === 'phone'
      ? '订阅成功。我们暂未启用短信发送，将在功能上线后联系你。'
      : '订阅成功。我们暂未启用邮件发送，将在功能上线后联系你。';

  // ---- Path A: Supabase configured — persist ----
  if (isSupabaseConfigured()) {
    const supabase = getSupabase()!;
    const { error } = await supabase
      .from('alert_subscriptions')
      .upsert(
        {
          channel,
          contact,
          regions,
          serotypes,
          threshold,
          source,
          user_agent: userAgent,
          ip_hash: ipHash,
        },
        { onConflict: 'channel,contact' },
      );

    if (error) {
      console.error('[subscribe] supabase error', error);
      return NextResponse.json(
        { error: '订阅暂时不可用，请稍后再试' },
        { status: 503 },
      );
    }

    return NextResponse.json({ success: true, message: successMsg });
  }

  // ---- Path B: env not configured — log only (dev / pre-Supabase) ----
  console.log('[subscribe:dev]', { channel, contact, regions, serotypes, threshold, source });
  return NextResponse.json({
    success: true,
    message: '订阅成功（开发模式：暂存日志，未持久化）',
  });
}
