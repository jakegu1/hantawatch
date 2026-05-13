import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// On Vercel / most serverless platforms the working directory is read-only
// except for `/tmp` (which is per-invocation ephemeral but still useful for
// hourly bucket stats). Local `next dev` has a writable cwd, so we prefer
// that path when it works. The route MUST NEVER 500 — analytics is purely
// nice-to-have and should not surface a Sentry-grade red banner in the
// browser console.
const PRIMARY_DIR = path.join(process.cwd(), 'data', 'analytics');
const PRIMARY_FILE = path.join(PRIMARY_DIR, 'events.json');
const FALLBACK_DIR = path.join('/tmp', 'hantawatch-analytics');
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'events.json');

interface PageViewEvent {
  page: string;
  referrer: string;
  timestamp: string;
  userAgent: string;
  ip: string;
}

// Simple in-memory rate limiter. 250 ms is enough to absorb React StrictMode
// double-fires and rapid client-side navigations while still blocking abuse.
// (Client also dedupes per session — see lib/analytics-client.ts.)
const RATE_LIMIT_MS = 250;
const lastRequest = new Map<string, number>();

/**
 * Pick the first directory we can actually write to.
 *
 * Returns null if both candidates fail. Callers should treat null as
 * "analytics is disabled this session" and silently drop the event —
 * NEVER return 500 to the client.
 */
function pickWritableFile(): string | null {
  for (const [dir, file] of [
    [PRIMARY_DIR, PRIMARY_FILE],
    [FALLBACK_DIR, FALLBACK_FILE],
  ] as const) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
      // Probe: open the file for append. If this throws (EROFS / EACCES),
      // skip to the next candidate.
      fs.accessSync(file, fs.constants.W_OK);
      return file;
    } catch {
      // try next candidate
    }
  }
  return null;
}

// Memoise the chosen path across requests so we don't probe the FS on
// every page view. `null` means we already confirmed neither dir works
// this process — keep dropping events silently.
let cachedFile: string | null | undefined;
function resolveSink(): string | null {
  if (cachedFile !== undefined) return cachedFile;
  cachedFile = pickWritableFile();
  if (cachedFile === null) {
    // eslint-disable-next-line no-console
    console.warn('[analytics] no writable sink found — events will be dropped');
  }
  return cachedFile;
}

export async function POST(request: NextRequest) {
  // Rate limit
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
  const now = Date.now();
  const last = lastRequest.get(ip) ?? 0;
  if (now - last < RATE_LIMIT_MS) {
    return new NextResponse(null, { status: 429 });
  }
  lastRequest.set(ip, now);

  // Parse body
  let body: { page?: string; referrer?: string; timestamp?: string; userAgent?: string };
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (!body.page) {
    return new NextResponse(null, { status: 400 });
  }

  const sink = resolveSink();
  if (!sink) {
    // No persistent storage available. Accept the event and drop it so the
    // browser sees a clean 204 instead of a console-noise 500. Analytics
    // worth fixing properly should migrate to Supabase (which the rest of
    // the app already uses) — tracked in TODO.md.
    return new NextResponse(null, { status: 204 });
  }

  const event: PageViewEvent = {
    page: body.page,
    referrer: body.referrer ?? '',
    timestamp: body.timestamp ?? new Date().toISOString(),
    userAgent: body.userAgent ?? request.headers.get('user-agent') ?? '',
    ip,
  };

  // Append to JSON file, fail-safe. ANY FS-level error must be swallowed:
  // returning 500 here would surface a red error in every visitor's
  // console (Vercel's filesystem is read-only outside /tmp, and even /tmp
  // can hit ENOSPC).
  try {
    const events: PageViewEvent[] = JSON.parse(fs.readFileSync(sink, 'utf-8'));
    events.push(event);
    // Keep only last 10000 events to prevent file growth
    const trimmed = events.slice(-10000);
    fs.writeFileSync(sink, JSON.stringify(trimmed, null, 2));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[analytics] write failed, dropping event:', (e as Error).message);
    // Force a re-probe on the next request — maybe FALLBACK_FILE got reset
    // when the lambda was recycled.
    cachedFile = undefined;
  }

  return new NextResponse(null, { status: 204 });
}
