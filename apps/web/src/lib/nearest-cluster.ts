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
