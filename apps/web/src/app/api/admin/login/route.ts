import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, getAdminKey } from '@/lib/admin-auth';

/**
 * POST /api/admin/login
 * Body: { key: string }
 *
 * Validates against `ADMIN_KEY` env var. On success, sets an HttpOnly cookie
 * (`hw_admin`) carrying the key value so subsequent admin requests pass
 * through middleware automatically. Cookie lifetime: 7 days.
 *
 * Rate-limit: not built-in. We rely on a) the obscure admin key, b) edge
 * deployments having very low per-IP request budgets, c) the page being
 * uncrawlable (login form is small and uninteresting to bots).
 */

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const expected = getAdminKey();
  if (!expected) {
    return NextResponse.json(
      { error: 'Admin not configured on server (ADMIN_KEY missing).' },
      { status: 503 },
    );
  }

  let body: { key?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const presented = typeof body.key === 'string' ? body.key : '';
  if (presented.length !== expected.length) {
    return NextResponse.json({ error: '密钥错误' }, { status: 401 });
  }
  // Constant-time compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) {
    return NextResponse.json({ error: '密钥错误' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: expected,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}
