import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const FEEDBACK_DIR = path.join(process.cwd(), 'data', 'feedback');
const FEEDBACK_FILE = path.join(FEEDBACK_DIR, 'feedback.json');

// Simple anti-spam: IP → last submission timestamp
const submissionMap = new Map<string, number>();

interface FeedbackEntry {
  id: string;
  category: string;
  content: string;
  contact?: string;
  page?: string;
  timestamp: string;
  ip: string;
  userAgent?: string;
}

// Spam keywords (naive filter)
const SPAM_PATTERNS = [
  /http[s]?:\/\//i,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  /(?:viagra|cialis|casino|poker|loan|bitcoin|crypto)/i,
];

/**
 * POST /api/feedback
 * Accepts anonymous feedback. Anti-spam: rate limit + keyword filter.
 */
export async function POST(request: NextRequest) {
  // --- Rate limiting (1 per 30 seconds per IP) ---
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? '127.0.0.1';
  const now = Date.now();
  const last = submissionMap.get(ip);
  if (last && now - last < 30_000) {
    return NextResponse.json(
      { error: '提交过于频繁，请30秒后再试' },
      { status: 429 },
    );
  }
  submissionMap.set(ip, now);

  // --- Parse ---
  let body: Partial<FeedbackEntry>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: '无效的JSON数据' },
      { status: 400 },
    );
  }

  if (!body.content || body.content.trim().length < 2) {
    return NextResponse.json(
      { error: '反馈内容不能为空（至少2个字符）' },
      { status: 400 },
    );
  }

  if (body.content.length > 5000) {
    return NextResponse.json(
      { error: '反馈内容不能超过5000个字符' },
      { status: 400 },
    );
  }

  // --- Anti-spam: keyword filter ---
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(body.content)) {
      return NextResponse.json(
        { error: '内容包含不允许的格式，请移除链接后重试' },
        { status: 400 },
      );
    }
  }

  const entry: FeedbackEntry = {
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category: body.category ?? 'general',
    content: body.content.trim(),
    contact: body.contact?.trim() || undefined,
    page: body.page ?? '/',
    timestamp: new Date().toISOString(),
    ip,
    userAgent: request.headers.get('user-agent') ?? '',
  };

  // --- Store ---
  try {
    if (!fs.existsSync(FEEDBACK_DIR)) {
      fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
    }

    let entries: FeedbackEntry[] = [];
    if (fs.existsSync(FEEDBACK_FILE)) {
      const raw = fs.readFileSync(FEEDBACK_FILE, 'utf-8');
      entries = JSON.parse(raw);
    }

    entries.push(entry);

    // Keep last 10,000 entries
    if (entries.length > 10_000) {
      entries = entries.slice(-10_000);
    }

    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(entries, null, 2), 'utf-8');
  } catch (err) {
    console.error('[feedback] write error:', err);
    return NextResponse.json(
      { error: '存储错误，请稍后重试' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, id: entry.id });
}
