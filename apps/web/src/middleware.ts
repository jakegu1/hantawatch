import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge middleware — first line of defense for the admin surface.
 *
 * Routes gated:
 *   - `/admin` and everything under `/admin/*` (except `/admin/login`)
 *   - `/api/feedback/list`, `/api/alert/list` (admin-only read endpoints)
 *   - `/api/admin/*` (login is exempted; logout requires auth)
 *
 * On anonymous access:
 *   - HTML routes redirect to `/admin/login?next=<orig>`
 *   - JSON API routes return `401 Unauthorized`
 *
 * On unconfigured `ADMIN_KEY`:
 *   - Returns `503 Admin not configured` so a deployment without env vars
 *     is obviously broken instead of silently open. (See incident
 *     2026-05-13: hardcoded 'admin_key_2026' default leaked feedback.)
 */

const ADMIN_COOKIE = 'hw_admin';

const PROTECTED_HTML_PREFIXES = ['/admin'];
const PROTECTED_API_EXACT = new Set([
  '/api/feedback/list',
  '/api/alert/list',
]);
const PROTECTED_API_PREFIXES = ['/api/admin'];

// Routes that look protected but ARE public (login form, logout)
const EXEMPT_PATHS = new Set<string>([
  '/admin/login',
  '/api/admin/login',
]);

function isProtected(pathname: string): { html: boolean; api: boolean } | null {
  if (EXEMPT_PATHS.has(pathname)) return null;
  if (PROTECTED_API_EXACT.has(pathname)) return { html: false, api: true };
  for (const p of PROTECTED_API_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + '/')) return { html: false, api: true };
  }
  for (const p of PROTECTED_HTML_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + '/')) return { html: true, api: false };
  }
  return null;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const target = isProtected(pathname);
  if (!target) return NextResponse.next();

  const expected = process.env.ADMIN_KEY?.trim();
  if (!expected) {
    if (target.api) {
      return NextResponse.json(
        { error: 'Admin not configured. Set ADMIN_KEY env on the server.' },
        { status: 503 },
      );
    }
    return new NextResponse(
      '<!doctype html><meta charset="utf-8"><title>未配置</title>' +
        '<div style="font-family:sans-serif;padding:2rem;max-width:480px;margin:auto">' +
        '<h1>后台未配置</h1>' +
        '<p>服务端未设置 <code>ADMIN_KEY</code> 环境变量。请在 Vercel 控制台添加后重新部署。</p>' +
        '</div>',
      { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }

  // Read the session cookie. Edge middleware can read cookies directly.
  const cookieVal = req.cookies.get(ADMIN_COOKIE)?.value;
  const ok =
    typeof cookieVal === 'string' &&
    cookieVal.length === expected.length &&
    ((): boolean => {
      let diff = 0;
      for (let i = 0; i < expected.length; i++) {
        diff |= cookieVal.charCodeAt(i) ^ expected.charCodeAt(i);
      }
      return diff === 0;
    })();

  if (ok) return NextResponse.next();

  if (target.api) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // HTML: redirect to login, preserving the original destination
  const loginUrl = new URL('/admin/login', req.url);
  if (pathname && pathname !== '/admin') {
    loginUrl.searchParams.set('next', pathname + (req.nextUrl.search || ''));
  }
  return NextResponse.redirect(loginUrl);
}

// Run middleware on these paths only. The matcher needs to be a static array
// of pathname patterns (Next.js does NOT evaluate JS here).
export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/feedback/list',
    '/api/alert/list',
  ],
};
