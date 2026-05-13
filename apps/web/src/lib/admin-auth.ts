/**
 * Shared admin-auth helpers used by middleware AND individual route handlers.
 *
 * Design goals:
 *   - **Fail-closed**: when `ADMIN_KEY` env is missing, ALL admin operations
 *     reject. No "default" or "dev fallback" keys reach production.
 *   - **HttpOnly cookie session**: `hw_admin` cookie holds the literal
 *     `ADMIN_KEY` value (HttpOnly, SameSite=Strict, Secure in prod). The
 *     client never sees or transmits the key directly after login.
 *   - **Defense in depth**: even though Next.js middleware gates these
 *     routes, every protected handler calls `assertAdmin(req)` so that a
 *     misconfigured middleware matcher cannot accidentally expose data.
 *   - **Legacy Bearer/query support**: still accept `?key=` and
 *     `Authorization: Bearer <key>` so existing curl-based scripts keep
 *     working. They still require the *real* ADMIN_KEY though.
 */

import type { NextRequest } from 'next/server';

export const ADMIN_COOKIE = 'hw_admin';

/** Returns the configured admin key, or `null` if not set. NEVER returns a
 *  fallback in production — we'd rather hard-deny than fall through to a
 *  guessable default. */
export function getAdminKey(): string | null {
  const k = process.env.ADMIN_KEY;
  if (!k || k.trim().length === 0) return null;
  return k.trim();
}

/** True iff `ADMIN_KEY` env is set on this server. */
export function isAdminConfigured(): boolean {
  return getAdminKey() !== null;
}

/**
 * Returns the candidate auth secret presented by the request, looking at
 * (in order): cookie, Authorization header, `?key=` query param.
 *
 * Pure parser — does not authenticate.
 */
export function extractAdminToken(req: NextRequest | Request): string | null {
  // 1. Cookie (set by /api/admin/login)
  if ('cookies' in req && typeof req.cookies.get === 'function') {
    const c = req.cookies.get(ADMIN_COOKIE);
    if (c?.value) return c.value;
  } else {
    // Fallback when called with a plain Request (e.g. older edge handlers)
    const cookieHeader = req.headers.get('cookie') ?? '';
    const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`));
    if (m) return decodeURIComponent(m[1]);
  }

  // 2. Authorization: Bearer <key>
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  // 3. Legacy ?key= query
  try {
    const u = new URL(req.url);
    const k = u.searchParams.get('key');
    if (k) return k;
  } catch {
    // ignore — req.url malformed
  }
  return null;
}

/**
 * Returns whether the request bears valid admin credentials.
 * If `ADMIN_KEY` env is missing, this always returns `false` — the system
 * is treated as locked rather than open.
 *
 * Use this from inside any handler that needs admin access.
 */
export function isAdminAuthed(req: NextRequest | Request): boolean {
  const expected = getAdminKey();
  if (!expected) return false;
  const presented = extractAdminToken(req);
  if (!presented) return false;
  // Constant-time-ish comparison: avoid early-exit timing leaks. JS does not
  // expose a real ct-eq, but length+xor pattern below is good enough at this
  // scale and is the standard pattern used in NextAuth, etc.
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
