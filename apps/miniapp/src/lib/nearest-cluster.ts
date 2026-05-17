/**
 * Mirror of apps/web/src/lib/nearest-cluster.ts — kept in sync by hand.
 *
 * Pure-data helpers (no React, no DOM) so they port to Taro miniapp
 * unchanged.
 */

import type { ActiveCluster, SerotypeId } from '@hantawatch/shared/types';

export interface NearestAndesResult {
  nearest: ActiveCluster | null;
  count: number;
  km: number;
  all: ActiveCluster[];
  totalConfirmed: number;
  totalDeaths: number;
}

export function findNearestBySerotype(
  clusters: ActiveCluster[],
  serotypeId: SerotypeId,
): NearestAndesResult {
  const filtered = clusters.filter((c) => c.serotypeId === serotypeId);
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

export function findNearestAndes(clusters: ActiveCluster[]): NearestAndesResult {
  return findNearestBySerotype(clusters, 'andes');
}

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
  if (FLAG_MAP[locationName]) return FLAG_MAP[locationName];
  for (const [key, flag] of Object.entries(FLAG_MAP)) {
    if (locationName.includes(key)) return flag;
  }
  return '🌐';
}

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

/** Minute-granularity relative-time helper. Mirrors the web app's version
 *  in apps/web/src/lib/nearest-cluster.ts. Used to render the "系统核查
 *  N 分钟前" chip on the NearestAndesCard so the user can see we're
 *  actively checking even when WHO hasn't published anything new. */
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

// ---------------------------------------------------------------------------
// Import proximity — mirrors apps/web/src/lib/nearest-cluster.ts
// Surfaces confirmed imports alongside outbreak-source distance and adjusts HPI.
// ---------------------------------------------------------------------------

const ISO2_DISTANCE_KM: Record<string, number> = {
  AR: 19_400, CL: 19_200, BR: 17_400,
  US: 11_000, CA: 10_500, MX: 12_600,
  ES:  9_200, FR:  8_400, DE:  7_800,
  IT:  8_100, UK:  8_200, GB:  8_200,
  NL:  8_100, PT:  9_800, CH:  8_000,
  AU:  7_500, NZ:  9_700, JP:  2_100,
  KR:   950, TH:  3_300, IN:  3_800,
  ZA: 11_800,
};

export type ImportStatus = 'monitoring' | 'quarantine_active' | 'imports_confirmed' | 'closed';

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
  iso2: string;
  flag: string;
  nameZh: string;
  distanceKm: number;
  status: ImportStatus;
  statusZh: string;
  weight: number;
  effectiveHpiScore: number;
  travelConnectivity: 'none' | 'indirect' | 'direct';
  travelConnectivityZh: string;
  summary?: string;
}

export interface ImportRecord {
  iso2: string;
  status: string;
  summary_zh?: string;
  confirmedImports?: number;
  quarantineCount?: number;
  monitoringCount?: number;
}

function distScore(km: number): number {
  if (km > 10_000) return 0;
  if (km > 3_000) return 20;
  if (km > 500) return 50;
  return 100;
}

const DIRECT_FLIGHT_TO_CHINA = new Set([
  'FR', 'ES', 'US', 'AU', 'DE', 'IT', 'GB', 'UK', 'NL', 'CH', 'JP', 'KR', 'TH',
]);

function importTravelConnectivity(iso2: string): ImportProximity['travelConnectivity'] {
  return DIRECT_FLIGHT_TO_CHINA.has(iso2) ? 'direct' : 'indirect';
}

function travelConnectivityZhFn(level: ImportProximity['travelConnectivity']): string {
  if (level === 'direct') return '有直飞中国';
  if (level === 'indirect') return '需中转';
  return '无直飞中国';
}

export function findNearestImport(imports: ImportRecord[]): ImportProximity | null {
  let best: ImportProximity | null = null;

  for (const imp of imports) {
    const iso = imp.iso2.toUpperCase();
    const km = ISO2_DISTANCE_KM[iso];
    if (!km) continue;
    const status = (imp.status as ImportStatus) ?? 'monitoring';
    const w = STATUS_WEIGHT[status] ?? 0;
    if (w === 0) continue;

    const eff = distScore(km) * w;
    const travel = importTravelConnectivity(iso);
    const entry: ImportProximity = {
      iso2: iso,
      flag: ISO2_FLAG[iso] ?? '🌐',
      nameZh: ISO2_NAME_ZH[iso] ?? iso,
      distanceKm: km,
      status,
      statusZh: STATUS_LABEL_ZH[status] ?? status,
      weight: w,
      effectiveHpiScore: eff,
      travelConnectivity: travel,
      travelConnectivityZh: travelConnectivityZhFn(travel),
      summary: imp.summary_zh,
    };

    if (!best || eff > best.effectiveHpiScore || (eff === best.effectiveHpiScore && km < best.distanceKm)) {
      best = entry;
    }
  }

  return best;
}
