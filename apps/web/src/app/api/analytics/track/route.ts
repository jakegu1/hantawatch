import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'analytics');
const DATA_FILE = path.join(DATA_DIR, 'events.json');

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

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]');
  }
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

  ensureDataDir();

  const event: PageViewEvent = {
    page: body.page,
    referrer: body.referrer ?? '',
    timestamp: body.timestamp ?? new Date().toISOString(),
    userAgent: body.userAgent ?? request.headers.get('user-agent') ?? '',
    ip,
  };

  // Append to JSON file
  const events: PageViewEvent[] = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  events.push(event);

  // Keep only last 10000 events to prevent file growth
  const trimmed = events.slice(-10000);
  fs.writeFileSync(DATA_FILE, JSON.stringify(trimmed, null, 2));

  return new NextResponse(null, { status: 204 });
}
