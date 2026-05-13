import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isAdminAuthed, isAdminConfigured } from '@/lib/admin-auth';

const DATA_FILE = path.join(process.cwd(), 'data', 'feedback', 'feedback.json');

export async function GET(request: NextRequest) {
  // Defense in depth: middleware also gates this route, but never trust a
  // single layer. If `ADMIN_KEY` is missing, fail closed (NOT fall through
  // to a default — see incident 2026-05-13).
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Admin not configured (ADMIN_KEY env missing)' },
      { status: 503 },
    );
  }
  if (!isAdminAuthed(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!fs.existsSync(DATA_FILE)) {
    return NextResponse.json([]);
  }

  const entries = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  // Sort newest first
  entries.sort((a: { timestamp: string }, b: { timestamp: string }) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return NextResponse.json(entries);
}
