import { NextResponse } from 'next/server';
import realtimeSituationJson from '@/data/realtime-situation.json';

/**
 * GET /api/realtime-situation
 *
 * Returns the collector-built realtime situation payload. Marked force-dynamic
 * so clients can poll without relying on a static build-time bundle only.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(realtimeSituationJson, {
    headers: {
      'cache-control': 'no-store, max-age=0',
    },
  });
}
