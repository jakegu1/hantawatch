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
