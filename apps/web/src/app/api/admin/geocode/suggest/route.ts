/**
 * GET /api/admin/geocode/suggest?iso2=FR&q=ni
 *
 * Admin-gated autocomplete endpoint. Returns up to 6 Nominatim matches for
 * (iso2, query). Caller MUST debounce ≥500ms — Nominatim's policy limits
 * us to 1 req/sec per IP.
 *
 * 200 OK → { suggestions: GeocodeSuggestion[] }
 * 401     → { error: 'Unauthorized' }
 * 502     → { error: 'Nominatim ...' }
 *
 * Why GET, not POST: queries are idempotent and we want browser dev-tools
 * "Replay" + Cache-Control to behave sensibly. Auth is via the same cookie
 * the other admin endpoints use.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthed, isAdminConfigured } from '@/lib/admin-auth';
import { suggestCities } from '@/lib/geocode';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Admin not configured (ADMIN_KEY env missing)' },
      { status: 503 },
    );
  }
  if (!isAdminAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const iso2 = (url.searchParams.get('iso2') ?? '').trim().toUpperCase();
  const query = (url.searchParams.get('q') ?? '').trim();

  if (!/^[A-Z]{2}$/.test(iso2)) {
    return NextResponse.json(
      { error: 'iso2 query param required (2-letter)' },
      { status: 400 },
    );
  }
  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const suggestions = await suggestCities(iso2, query);
    return NextResponse.json({ suggestions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn('[api/admin/geocode/suggest] error:', msg);
    return NextResponse.json({ error: `Geocoder upstream: ${msg}` }, { status: 502 });
  }
}
