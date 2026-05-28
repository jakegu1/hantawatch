/**
 * POST /api/admin/geocode
 *
 * Admin-gated geocoding endpoint. Resolves (iso2, city) → (lat, lon) via
 * Nominatim (OpenStreetMap), cached in Supabase `geocode_cache`.
 *
 * Body:
 *   { iso2: 'FR', city: '尼斯' }   // city accepts Chinese or English
 *
 * 200 OK → { lat, lon, displayName, fromCache }
 * 404     → { error: 'not_found', city, iso2 }   (cached miss OR live miss)
 * 401     → { error: 'Unauthorized' }
 * 503     → { error: '...config missing' }
 * 502     → { error: 'Nominatim ...' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthed, isAdminConfigured } from '@/lib/admin-auth';
import { geocodeCity, GeocodeNotFoundCached } from '@/lib/geocode';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Admin not configured (ADMIN_KEY env missing)' },
      { status: 503 },
    );
  }
  if (!isAdminAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { iso2?: unknown; city?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  const iso2 = typeof body.iso2 === 'string' ? body.iso2.trim().toUpperCase() : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';

  if (!/^[A-Z]{2}$/.test(iso2)) {
    return NextResponse.json(
      { error: 'iso2 required (2-letter country code)' },
      { status: 400 },
    );
  }
  if (!city) {
    return NextResponse.json({ error: 'city required' }, { status: 400 });
  }

  try {
    const result = await geocodeCity(iso2, city);
    if (!result) {
      return NextResponse.json(
        { error: 'not_found', city, iso2 },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GeocodeNotFoundCached) {
      return NextResponse.json(
        { error: 'not_found_cached', city, iso2, hint: 'Recently failed — wait 90d or use different spelling.' },
        { status: 404 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn('[api/admin/geocode] error:', msg);
    return NextResponse.json({ error: `Geocoder upstream: ${msg}` }, { status: 502 });
  }
}
