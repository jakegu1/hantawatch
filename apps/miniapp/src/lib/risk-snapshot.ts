/**
 * Mirror of apps/web/src/lib/risk-snapshot.ts — kept in sync by hand.
 *
 * Pure-data helper (no React, no DOM) so it ports to Taro unchanged.
 *
 * Why the miniapp also needs this:
 *   - Miniapp now fetches the merged baseline∪Supabase imports list from
 *     /api/hondius-imports (see utils/api.ts). If we just used the bundled
 *     `currentHpi`, editor-added rows would change the displayed *distance*
 *     but not the *HPI*. That's confusing — the cards must agree.
 *   - Passing `baseHpi` (cluster-source-only) avoids the double-bump bug
 *     where `currentHpi` already has the collector's import adjustment
 *     baked in.
 */

import type { HpiResult, MvHondiusImport } from '@hantawatch/shared/types';
import { findNearestImport, type ImportProximity, type ImportRecord } from './nearest-cluster';

const HPI_GRADES = [
  { id: 'low' as const, zh: '低关注', color: '#16a34a', max: 20 },
  { id: 'moderate' as const, zh: '一般关注', color: '#0891b2', max: 40 },
  { id: 'elevated' as const, zh: '中等关注', color: '#ca8a04', max: 60 },
  { id: 'high' as const, zh: '高度关注', color: '#ea580c', max: 80 },
  { id: 'severe' as const, zh: '严重关注', color: '#dc2626', max: 100 },
];

export interface RiskSnapshot {
  hpi: HpiResult;
  nearestImport: ImportProximity | null;
  displayedDistanceKm: number;
  hasImportDistance: boolean;
  sourceDistanceKm: number;
}

function gradeHpi(total: number) {
  return HPI_GRADES.find((g) => total <= g.max) ?? HPI_GRADES[HPI_GRADES.length - 1];
}

export function buildRiskSnapshot(
  baseHpi: HpiResult,
  imports: MvHondiusImport[] | ImportRecord[],
): RiskSnapshot {
  const nearestImport = findNearestImport(imports as ImportRecord[]);
  const sourceDistanceKm = baseHpi.referenceCluster?.distanceFromChinaKm ?? baseHpi.factors.distance.km;
  const hasImportDistance = nearestImport != null && nearestImport.distanceKm < sourceDistanceKm;
  const displayedDistanceKm = hasImportDistance ? nearestImport!.distanceKm : sourceDistanceKm;

  if (!nearestImport || nearestImport.effectiveHpiScore <= 0) {
    return { hpi: baseHpi, nearestImport, displayedDistanceKm, hasImportDistance, sourceDistanceKm };
  }

  const distanceWeight = baseHpi.factors.distance.weight;
  const travelWeight = baseHpi.factors.travelConnectivity.weight;
  const travelScore = nearestImport.travelConnectivity === 'direct'
    ? 40
    : nearestImport.travelConnectivity === 'indirect'
      ? 15
      : 5;
  const baseTravelScore = baseHpi.factors.travelConnectivity.score;
  const importDistanceBump = nearestImport.effectiveHpiScore * distanceWeight;
  const importTravelBump = Math.max(0, travelScore - baseTravelScore) * travelWeight;
  const total = Math.min(100, Math.round(baseHpi.total + importDistanceBump + importTravelBump));
  const grade = gradeHpi(total);

  const hpi: HpiResult = {
    ...baseHpi,
    total,
    grade: grade.id,
    gradeZh: grade.zh,
    color: grade.color,
    factors: {
      ...baseHpi.factors,
      distance: {
        ...baseHpi.factors.distance,
        km: nearestImport.distanceKm,
        score: Math.max(baseHpi.factors.distance.score, nearestImport.effectiveHpiScore),
      },
      travelConnectivity: {
        ...baseHpi.factors.travelConnectivity,
        level: nearestImport.travelConnectivityZh,
        score: Math.max(baseTravelScore, travelScore),
      },
    },
  };

  return { hpi, nearestImport, displayedDistanceKm, hasImportDistance, sourceDistanceKm };
}
