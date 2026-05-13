import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'feedback');
const DATA_FILE = path.join(DATA_DIR, 'feedback.json');

interface FeedbackEntry {
  id: string;
  type: string;
  message: string;
  contact?: string;
  ip: string;
  userAgent: string;
  timestamp: string;
  honeypotTriggered: boolean;
}

// Rate limiter: max 3 per IP per hour
const rateMap = new Map<string, number[]>();

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]');
  }
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';

  // Rate limit check
  const now = Date.now();
  const timestamps = rateMap.get(ip) ?? [];
  const recent = timestamps.filter(t => now - t < 3600000); // last hour
  if (recent.length >= 3) {
    return NextResponse.json({ error: '提交过于频繁，请稍后再试' }, { status: 429 });
  }
  recent.push(now);
  rateMap.set(ip, recent);

  let body: { type?: string; message?: string; contact?: string; website?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '无效的请求数据' }, { status: 400 });
  }

  // Honeypot check
  const honeypotTriggered = !!body.website && body.website.length > 0;

  // Validation
  if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
    return NextResponse.json({ error: '反馈内容不能为空' }, { status: 400 });
  }
  if (body.message.length > 2000) {
    return NextResponse.json({ error: '反馈内容不能超过2000字' }, { status: 400 });
  }

  ensureDir();

  const entry: FeedbackEntry = {
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: body.type ?? 'other',
    message: body.message.trim(),
    contact: body.contact?.trim() || undefined,
    ip,
    userAgent: request.headers.get('user-agent') ?? '',
    timestamp: new Date().toISOString(),
    honeypotTriggered,
  };

  const entries: FeedbackEntry[] = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  entries.push(entry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2));

  return NextResponse.json({ success: true }, { status: 201 });
}
