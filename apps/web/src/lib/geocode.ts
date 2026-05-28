/**
 * Geocoding helper — turns "(国家ISO2, 城市中文/英文)" into (lat, lon).
 *
 * Backend: Nominatim (OpenStreetMap). Free, no API key, but with a strict
 * 1 req/sec rate limit and a "real User-Agent required" policy.
 *   https://operations.osmfoundation.org/policies/nominatim/
 *
 * Caching:
 *   - Supabase `geocode_cache` is the source of truth.
 *   - Hits (lat/lon resolved) are cached forever — city centroids don't move.
 *   - Misses (`not_found = true`) are cached for 90 days to prevent retry
 *     storms when the admin types a misspelling.
 *
 * This module is server-side only. Never import from a client component.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export interface GeocodeResult {
  lat: number;
  lon: number;
  /** Nominatim's human-readable "Nice, Alpes-Maritimes, France" string */
  displayName: string;
  /** True when the row came from the cache (vs a fresh Nominatim hit). */
  fromCache: boolean;
}

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
/** Per Nominatim usage policy — needs to identify the application + contact. */
const USER_AGENT = 'HantaWatch/1.0 (https://hantawatch.com; admin geocoder)';
const NOT_FOUND_TTL_MS = 90 * 24 * 3600 * 1000; // 90 days

function normalizeKey(iso2: string, city: string): string {
  return `${iso2.toLowerCase()}:${city.trim().toLowerCase()}`;
}

/** Lookup cache. Returns null on miss (incl. expired not-found row). */
async function readCache(iso2: string, city: string): Promise<GeocodeResult | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const key = normalizeKey(iso2, city);
  const { data, error } = await supabase
    .from('geocode_cache')
    .select('*')
    .eq('cache_key', key)
    .maybeSingle();
  if (error || !data) return null;

  if (data.not_found === true) {
    // Treat expired not-found rows as misses → caller will retry Nominatim.
    const resolvedAt = new Date(String(data.resolved_at)).getTime();
    if (Date.now() - resolvedAt > NOT_FOUND_TTL_MS) return null;
    // Still within TTL → throw a typed sentinel so the API can return 404
    // without re-querying Nominatim.
    throw new GeocodeNotFoundCached(city, iso2);
  }

  if (typeof data.lat !== 'number' || typeof data.lon !== 'number') return null;
  return {
    lat: data.lat,
    lon: data.lon,
    displayName: String(data.display_name ?? city),
    fromCache: true,
  };
}

async function writeCache(
  iso2: string,
  city: string,
  result: GeocodeResult | { notFound: true },
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const key = normalizeKey(iso2, city);
  const row: Record<string, unknown> = {
    cache_key: key,
    city_input: city,
    iso2: iso2.toUpperCase(),
    resolved_at: new Date().toISOString(),
  };
  if ('notFound' in result) {
    row.not_found = true;
    row.lat = null;
    row.lon = null;
    row.display_name = null;
  } else {
    row.not_found = false;
    row.lat = result.lat;
    row.lon = result.lon;
    row.display_name = result.displayName;
  }
  const { error } = await supabase
    .from('geocode_cache')
    .upsert(row, { onConflict: 'cache_key' });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[geocode] cache upsert failed:', error.message);
  }
}

/** Typed exception so callers can distinguish "we tried and failed
 *  recently, don't retry" from "real error talking to Nominatim". */
export class GeocodeNotFoundCached extends Error {
  constructor(city: string, iso2: string) {
    super(`geocode: cached miss for ${city} (${iso2})`);
    this.name = 'GeocodeNotFoundCached';
  }
}

/** Fetch from Nominatim. Returns null on "not found" (with a cache write). */
async function fetchNominatim(iso2: string, city: string): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    q: city,
    countrycodes: iso2.toLowerCase(),
    format: 'jsonv2',
    limit: '1',
    'accept-language': 'zh-CN,en',
  });
  const url = `${NOMINATIM_ENDPOINT}?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      // Nominatim's rate limit is per-IP. A short cache disables the Next.js
      // fetch dedupe, which would conflate parallel requests.
      cache: 'no-store',
    });
  } catch (err) {
    throw new Error(
      `Nominatim unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }

  const data = (await res.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
  }>;

  if (!Array.isArray(data) || data.length === 0) {
    await writeCache(iso2, city, { notFound: true });
    return null;
  }

  const top = data[0];
  const lat = Number(top.lat);
  const lon = Number(top.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    await writeCache(iso2, city, { notFound: true });
    return null;
  }

  const result: GeocodeResult = {
    lat,
    lon,
    displayName: String(top.display_name ?? city),
    fromCache: false,
  };
  await writeCache(iso2, city, result);
  return result;
}

/** Suggestion result — like GeocodeResult but representing one of several
 *  candidates. Used by the autocomplete dropdown. The `name` field is the
 *  *short* name (e.g. "Nice"), while `displayName` is the long form
 *  ("Nice, Alpes-Maritimes, France"). The frontend shows `displayName` in
 *  the dropdown for disambiguation and uses `name` to autofill `cityEn`. */
export interface GeocodeSuggestion {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  iso2: string;
  /** Nominatim's place type — useful for showing icons (city / town / village). */
  category: string;
}

/** Fetch multiple matches from Nominatim. NOT cached (suggestions vary by
 *  query prefix, caching them would blow up storage). Caller is expected to
 *  debounce ≥500ms client-side. */
export async function suggestCities(
  iso2: string,
  query: string,
  limit = 6,
): Promise<GeocodeSuggestion[]> {
  const trimmed = query.trim();
  const upperIso2 = iso2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upperIso2)) {
    throw new Error(`suggestCities: invalid iso2 "${iso2}"`);
  }
  if (trimmed.length < 2) return [];

  const params = new URLSearchParams({
    q: trimmed,
    countrycodes: upperIso2.toLowerCase(),
    format: 'jsonv2',
    limit: String(Math.max(1, Math.min(limit, 10))),
    'accept-language': 'zh-CN,en',
    addressdetails: '1',
  });
  const url = `${NOMINATIM_ENDPOINT}?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (err) {
    throw new Error(
      `Nominatim unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }

  const data = (await res.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
    name?: string;
    category?: string;
    type?: string;
    address?: { city?: string; town?: string; village?: string; municipality?: string };
  }>;
  if (!Array.isArray(data)) return [];

  const out: GeocodeSuggestion[] = [];
  for (const item of data) {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // Prefer the human-readable "city/town/village" name from address details
    // over Nominatim's `name` field (which sometimes returns a postcode or
    // bare road for fuzzy matches).
    const shortName =
      item.address?.city ??
      item.address?.town ??
      item.address?.village ??
      item.address?.municipality ??
      item.name ??
      trimmed;
    out.push({
      name: shortName,
      displayName: String(item.display_name ?? shortName),
      lat,
      lon,
      iso2: upperIso2,
      category: item.category ?? item.type ?? 'place',
    });
  }
  return out;
}

/**
 * Public API — resolve (iso2, city) → (lat, lon). Throws on transport
 * errors; returns null on definitive "not found".
 *
 * Order of operations:
 *   1. Read Supabase cache (cheap).
 *   2. Cache hit + not-found-within-TTL → throw GeocodeNotFoundCached.
 *      Cache hit + lat/lon present → return immediately.
 *   3. Cache miss → call Nominatim, then write back.
 *
 * If Supabase is not configured, cache layer is skipped entirely and every
 * call hits Nominatim. Good enough for local dev.
 */
export async function geocodeCity(
  iso2: string,
  city: string,
): Promise<GeocodeResult | null> {
  const trimmedCity = city.trim();
  const upperIso2 = iso2.trim().toUpperCase();

  if (!trimmedCity) {
    throw new Error('geocodeCity: city required');
  }
  if (!/^[A-Z]{2}$/.test(upperIso2)) {
    throw new Error(`geocodeCity: invalid iso2 "${iso2}" — must be 2 letters`);
  }

  // 1. Cache lookup (skipped when Supabase not configured)
  if (isSupabaseConfigured()) {
    try {
      const cached = await readCache(upperIso2, trimmedCity);
      if (cached) return cached;
    } catch (err) {
      if (err instanceof GeocodeNotFoundCached) {
        // Re-throw so caller can treat as a 404 without hitting Nominatim.
        throw err;
      }
      throw err;
    }
  }

  // 2. Fresh Nominatim fetch
  return fetchNominatim(upperIso2, trimmedCity);
}
