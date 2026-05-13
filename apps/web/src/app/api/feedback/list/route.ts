import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'feedback', 'feedback.json');

export async function GET(request: NextRequest) {
  // Simple auth
  const key = request.nextUrl.searchParams.get('key');
  if (key !== 'admin_key_2026') {
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
