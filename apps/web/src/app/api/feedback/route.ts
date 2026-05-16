import { NextResponse } from 'next/server';

/**
 * POST /api/feedback  (DEPRECATED)
 *
 * This route was a duplicate of /api/feedback/submit with different field
 * names. The frontend has always called /api/feedback/submit. This route
 * now returns a redirect hint. Remove it entirely once confirmed no
 * external scripts depend on it.
 */
export async function POST() {
  return NextResponse.json(
    { error: '此端点已弃用。请使用 POST /api/feedback/submit。' },
    { status: 410 },
  );
}
