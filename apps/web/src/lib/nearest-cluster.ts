/**
 * Helpers for "nearest cluster of serotype X" computations.
 *
 * Why this matters
 * ----------------
 * The hero panel previously hard-coded `liveClusters[0]` for distance and
 * "X 例确诊" stats. That was fine when there was a single MV Hondius
 * outbreak, but the second a real second Andes cluster appears, "the first
 * one in the array" is meaningless. What matters to a China-resident user
 * is: of all currently active *Andes* clusters (the only human-to-human
 * serotype), which is geographically closest to me?
 *
 * This module centralises that computation so the hero, the count cards,
 * the path card and any future widget all agree on the same "currently
 * relevant" cluster.
 */

// NOTE: the main `@hantawatch/shared` barrel deliberately exports only
// runtime values (for Taro/webpack compatibility in the miniapp build).
// Types must come from the `/types` subpath. See packages/shared/src/index.ts.
import type { ActiveCluster, SerotypeId } from '@hantawatch/shared/types';

export interface NearestAndesResult {
  /** Closest Andes cluster, or null if none active. */
  nearest: ActiveCluster | null;
  /** Count of Andes clusters in the input (0..N). */
  count: number;
  /** Distance of nearest, in km. -1 sentinel when none. */
  km: number;
  /** All Andes clusters, sorted ascending by distance. Useful for lists. */
  all: ActiveCluster[];
  /** Aggregate confirmed cases across all Andes clusters. */
  totalConfirmed: number;
  /** Aggregate deaths across all Andes clusters. */
  totalDeaths: number;
}

/**
 * Filter to one serotype, sort by distance ascending, and return summary
 * stats. Stable: ignores clusters whose distance is 0 (means we couldn't
 * geocode them) so we don't accidentally surface "0 km" as an alarm.
 */
export function findNearestBySerotype(
  clusters: ActiveCluster[],
  serotypeId: SerotypeId,
): NearestAndesResult {
  const filtered = clusters.filter((c) => c.serotypeId === serotypeId);
  // Distances of exactly 0 typically mean "not geocoded yet". We keep the
  // cluster in `all` (the operator should still see it in lists), but the
  // `nearest` selection treats it as last-resort, so an ungeocoded entry
  // never displaces a real one.
  const sorted = [...filtered].sort((a, b) => {
    const da = a.distanceFromChinaKm <= 0 ? Number.MAX_SAFE_INTEGER : a.distanceFromChinaKm;
    const db = b.distanceFromChinaKm <= 0 ? Number.MAX_SAFE_INTEGER : b.distanceFromChinaKm;
    return da - db;
  });
  const nearest = sorted[0] ?? null;
  return {
    nearest,
    count: filtered.length,
    km: nearest && nearest.distanceFromChinaKm > 0 ? nearest.distanceFromChinaKm : -1,
    all: sorted,
    totalConfirmed: filtered.reduce((s, c) => s + (c.confirmedCases ?? 0), 0),
    totalDeaths: filtered.reduce((s, c) => s + (c.deaths ?? 0), 0),
  };
}

/** Convenience wrapper: just the Andes case (the most common usage). */
export function findNearestAndes(clusters: ActiveCluster[]): NearestAndesResult {
  return findNearestBySerotype(clusters, 'andes');
}

// ---------------------------------------------------------------------------
// Import proximity — surfaces confirmed imports on the NearestAndesCard
// so users see "⚠ 最近输入：🇦🇺 澳大利亚 ~7,500 km（隔离中）" alongside the
// outbreak-source distance. HPI weights are discounted by import status.
// ---------------------------------------------------------------------------

/** Approximate great-circle distance from Beijing to major country capitals.
 *  Only countries that plausibly receive hantavirus imports need entries;
 *  extend this table when new countries appear in mv-hondius-imports.json. */
const ISO2_DISTANCE_KM: Record<string, number> = {
  AR: 19_400, CL: 19_200, BR: 17_400,       // South America (source region)
  US: 11_000, CA: 10_500, MX: 12_600,        // North America
  ES:  9_200, FR:  8_400, DE:  7_800,        // Europe
  IT:  8_100, UK:  8_200, GB:  8_200,
  NL:  8_100, PT:  9_800, CH:  8_000,
  AU:  7_500, NZ:  9_700, JP:  2_100,        // Asia-Pacific
  KR:   950, TH:  3_300, IN:  3_800,
  ZA: 11_800,                                  // Africa
};

export type ImportStatus = 'monitoring' | 'quarantine_active' | 'imports_confirmed' | 'closed';

/** Discount factor applied to the distance-score when computing HPI.
 *  A quarantined import 7,500 km away is NOT the same risk as an active
 *  outbreak 7,500 km away.  The raw distance is still displayed in full;
 *  only the HPI contribution is discounted.
 *
 *  Formula:  effective_distance_score = distanceScore(km) × STATUS_WEIGHT */
const STATUS_WEIGHT: Record<ImportStatus, number> = {
  imports_confirmed: 0.5,
  quarantine_active: 0.3,
  monitoring: 0.1,
  closed: 0,
};

const STATUS_LABEL_ZH: Record<ImportStatus, string> = {
  imports_confirmed: '确诊输入',
  quarantine_active: '隔离中',
  monitoring: '监测中',
  closed: '已关闭',
};

const ISO2_FLAG: Record<string, string> = {
  AR: '🇦🇷', CL: '🇨🇱', BR: '🇧🇷', US: '🇺🇸', CA: '🇨🇦',
  ES: '🇪🇸', FR: '🇫🇷', DE: '🇩🇪', IT: '🇮🇹', GB: '🇬🇧', UK: '🇬🇧',
  NL: '🇳🇱', PT: '🇵🇹', CH: '🇨🇭', AU: '🇦🇺', NZ: '🇳🇿',
  JP: '🇯🇵', KR: '🇰🇷', TH: '🇹🇭', IN: '🇮🇳', ZA: '🇿🇦', MX: '🇲🇽',
};

const ISO2_NAME_ZH: Record<string, string> = {
  AR: '阿根廷', CL: '智利', BR: '巴西', US: '美国', CA: '加拿大',
  ES: '西班牙', FR: '法国', DE: '德国', IT: '意大利', GB: '英国', UK: '英国',
  NL: '荷兰', PT: '葡萄牙', CH: '瑞士', AU: '澳大利亚', NZ: '新西兰',
  JP: '日本', KR: '韩国', TH: '泰国', IN: '印度', ZA: '南非', MX: '墨西哥',
};

export interface ImportProximity {
  /** ISO-2 country code */
  iso2: string;
  flag: string;
  nameZh: string;
  /** Optional city name in Chinese — when present, the UI shows e.g.
   *  "🇫🇷 法国 尼斯" instead of just "🇫🇷 法国". Driven by the cityZh
   *  field on the import record. */
  cityZh?: string;
  distanceKm: number;
  /** Whether the displayed `distanceKm` was computed from precise lat/lon
   *  (true) or fell back to the country-capital lookup table (false). The
   *  hero card adds a tiny "(精确至城市)" hint when this is true so the
   *  user knows why the number changed from yesterday's country-level
   *  estimate. */
  distanceIsCityPrecise: boolean;
  status: ImportStatus;
  statusZh: string;
  /** HPI discount weight for this status */
  weight: number;
  /** distanceScore(km) × weight — ready to compare with source score */
  effectiveHpiScore: number;
  /** Best-effort travel connectivity from the import country to China. */
  travelConnectivity: 'none' | 'indirect' | 'direct';
  travelConnectivityZh: string;
  summary?: string;
}

/** Lightweight import record — matches the shape in mv-hondius-imports.json.
 *  We don't import the full MvHondiusImport type here to keep the module
 *  leaf-level (no Supabase / heavy type deps).
 *
 *  City-level fields (cityZh / lat / lon) are optional. When lat+lon are
 *  supplied, findNearestImport uses haversine for distance; otherwise it
 *  falls back to the country-capital lookup table. cityZh alone (no lat/lon)
 *  is still useful — it improves the display label without changing the
 *  distance number. */
export interface ImportRecord {
  iso2: string;
  status: string;
  summary_zh?: string;
  confirmedImports?: number;
  quarantineCount?: number;
  monitoringCount?: number;
  cityZh?: string;
  city?: string;
  lat?: number;
  lon?: number;
}

/** Simple distance-ring scoring matching lib/hpi.ts#distanceScore. */
function distScore(km: number): number {
  if (km > 10_000) return 0;
  if (km > 3_000) return 20;
  if (km > 500) return 50;
  return 100;
}

/** Beijing reference point (city centre, Tiananmen) for haversine
 *  computations against event lat/lon. Picked because:
 *    1. It's the political/transit capital — the most "available" target
 *       for "how far is this from China?" framing.
 *    2. The earlier ISO2_DISTANCE_KM table is also Beijing-centric
 *       (e.g. Paris → Beijing = 8,400 km, which we keep as the FR fallback).
 *    3. Switching reference would create a step-jump in displayed numbers
 *       between events with vs. without lat/lon. Stay consistent. */
const BEIJING_LAT = 39.9042;
const BEIJING_LON = 116.4074;

/** Great-circle distance via haversine, rounded to nearest 10 km so casual
 *  drift in source coordinates (e.g. switching from city centroid to
 *  airport) doesn't produce visible churn. */
function haversineKmToBeijing(lat: number, lon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // earth radius in km
  const dLat = toRad(lat - BEIJING_LAT);
  const dLon = toRad(lon - BEIJING_LON);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(BEIJING_LAT)) * Math.cos(toRad(lat)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = R * c;
  return Math.round(km / 10) * 10;
}

const DIRECT_FLIGHT_TO_CHINA = new Set([
  'FR', 'ES', 'US', 'AU', 'DE', 'IT', 'GB', 'UK', 'NL', 'CH', 'JP', 'KR', 'TH',
]);

function importTravelConnectivity(iso2: string): ImportProximity['travelConnectivity'] {
  return DIRECT_FLIGHT_TO_CHINA.has(iso2) ? 'direct' : 'indirect';
}

function travelConnectivityZh(level: ImportProximity['travelConnectivity']): string {
  if (level === 'direct') return '有直飞中国';
  if (level === 'indirect') return '需中转';
  return '无直飞中国';
}

/** Find the nearest import with the highest effective HPI contribution.
 *  Returns null when there are no active imports, or all have status=closed.
 *
 *  Distance source priority (highest to lowest):
 *    1. haversine(lat, lon) — when both lat & lon are present on the record.
 *       Sets distanceIsCityPrecise = true, populates cityZh for display.
 *    2. ISO2_DISTANCE_KM[iso2] — country-capital fallback. Older / less-
 *       detailed records hit this path and look exactly like before. */
export function findNearestImport(imports: ImportRecord[]): ImportProximity | null {
  let best: ImportProximity | null = null;

  for (const imp of imports) {
    const iso = imp.iso2.toUpperCase();

    // Distance: prefer per-event lat/lon when both present, else fall back
    // to the country-capital lookup table.
    let km: number;
    let cityPrecise = false;
    if (typeof imp.lat === 'number' && typeof imp.lon === 'number') {
      km = haversineKmToBeijing(imp.lat, imp.lon);
      cityPrecise = true;
    } else {
      const lookup = ISO2_DISTANCE_KM[iso];
      if (!lookup) continue; // country not in distance table — skip
      km = lookup;
    }

    const status = (imp.status as ImportStatus) ?? 'monitoring';
    const w = STATUS_WEIGHT[status] ?? 0;
    if (w === 0) continue; // closed — not relevant

    const eff = distScore(km) * w;
    const travel = importTravelConnectivity(iso);
    const entry: ImportProximity = {
      iso2: iso,
      flag: ISO2_FLAG[iso] ?? '🌐',
      nameZh: ISO2_NAME_ZH[iso] ?? iso,
      cityZh: imp.cityZh,
      distanceKm: km,
      distanceIsCityPrecise: cityPrecise,
      status,
      statusZh: STATUS_LABEL_ZH[status] ?? status,
      weight: w,
      effectiveHpiScore: eff,
      travelConnectivity: travel,
      travelConnectivityZh: travelConnectivityZh(travel),
      summary: imp.summary_zh,
    };

    // Pick the one with the highest effective score (most impactful on HPI);
    // break ties by raw distance (closer wins).
    if (!best || eff > best.effectiveHpiScore || (eff === best.effectiveHpiScore && km < best.distanceKm)) {
      best = entry;
    }
  }
  return best;
}

/** Map ISO country / location name to a flag emoji. Best-effort; falls
 *  back to a globe when unknown. Keeps the homepage offline-friendly. */
const FLAG_MAP: Record<string, string> = {
  阿根廷: '🇦🇷',
  智利: '🇨🇱',
  玻利维亚: '🇧🇴',
  巴拉圭: '🇵🇾',
  乌拉圭: '🇺🇾',
  巴西: '🇧🇷',
  秘鲁: '🇵🇪',
  厄瓜多尔: '🇪🇨',
  哥伦比亚: '🇨🇴',
  委内瑞拉: '🇻🇪',
  巴拿马: '🇵🇦',
  美国: '🇺🇸',
  加拿大: '🇨🇦',
  墨西哥: '🇲🇽',
  韩国: '🇰🇷',
  日本: '🇯🇵',
  台湾省: '🇹🇼',
  香港特别行政区: '🇭🇰',
  中国大陆: '🇨🇳',
  泰国: '🇹🇭',
  越南: '🇻🇳',
  菲律宾: '🇵🇭',
  印度尼西亚: '🇮🇩',
  新加坡: '🇸🇬',
  澳大利亚: '🇦🇺',
  新西兰: '🇳🇿',
  南非: '🇿🇦',
  德国: '🇩🇪',
  法国: '🇫🇷',
  芬兰: '🇫🇮',
  瑞典: '🇸🇪',
  挪威: '🇳🇴',
  俄罗斯: '🇷🇺',
  瑞士: '🇨🇭',
  英国: '🇬🇧',
};

export function flagForLocation(locationName: string | undefined): string {
  if (!locationName) return '🌐';
  // Try exact match first, then substring (handles "南美洲海域（始发乌斯怀亚）"
  // → match "阿根廷" not present, fall back to globe).
  if (FLAG_MAP[locationName]) return FLAG_MAP[locationName];
  for (const [key, flag] of Object.entries(FLAG_MAP)) {
    if (locationName.includes(key)) return flag;
  }
  return '🌐';
}

/** Render an "ago" string for a YYYY-MM-DD date, in Chinese.
 *  "2026-05-12" → "1天前" / "今天" / "5天前" etc. Returns the raw date for
 *  anything older than 30 days. */
export function relativeDateZh(isoDate: string | undefined, today: Date = new Date()): string {
  if (!isoDate) return '—';
  const d = new Date(`${isoDate}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diffDays < 0) return isoDate;
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 30) return `${diffDays}天前`;
  return isoDate;
}

/** Render an "ago" string for a full ISO timestamp, in Chinese, with
 *  minute granularity. Used for collector-run timestamps where day-level
 *  ("今天") is too coarse — we want users to see "5 分钟前" so the tool
 *  feels live.
 *
 *  "2026-05-15T02:51:26Z" → "刚刚" / "5 分钟前" / "3 小时前" / "2 天前".
 *  Falls back to a YYYY-MM-DD slice for anything older than a week. */
export function relativeTimeZh(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso.slice(0, 10);
  const diffMs = now.getTime() - t;
  if (diffMs < 0) return '刚刚';
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return iso.slice(0, 10);
}
