import { NextResponse } from 'next/server';
import { fetchNewsEntriesPayload } from '@/lib/news-entries';

/**
 * GET /api/news-entries
 *
 * Public endpoint. Returns the editorial overlay applied on top of the
 * static recent-cases timeline:
 *
 *   {
 *     "additions": [ { id, title, summary, scope, ... } ],
 *     "hiddenIds": [ "who-2026-don601", ... ],
 *     "generatedAt": "2026-05-15T18:00:00Z"
 *   }
 *
 * The homepage fetches this in a useEffect after first paint and merges
 * the result with the build-time `recentCases` list. Pattern mirrors
 * `/api/clusters` — graceful degradation if Supabase is unreachable.
 *
 * Caching: always fresh (no edge cache) because new entries must show
 * up within seconds of being posted. Payload is tiny (<2 kB).
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  let payload;
  try {
    payload = await fetchNewsEntriesPayload();
  } catch {
    payload = { additions: [], hiddenIds: [] };
  }

  return NextResponse.json(
    { ...payload, generatedAt: new Date().toISOString() },
    {
      headers: {
        'cache-control': 'no-store, max-age=0',
      },
    },
  );
}
