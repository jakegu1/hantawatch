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

export function hpiFactorsToBreakdown(hpi: HpiResult) {
  return {
    distance: {
      raw: hpi.factors.distance.km,
      score: hpi.factors.distance.score,
      weight: hpi.factors.distance.weight,
      weighted: hpi.factors.distance.score * hpi.factors.distance.weight,
    },
    official: {
      raw: hpi.factors.officialAssessment.level,
      score: hpi.factors.officialAssessment.score,
      weight: hpi.factors.officialAssessment.weight,
      weighted: hpi.factors.officialAssessment.score * hpi.factors.officialAssessment.weight,
    },
    serotype: {
      raw: hpi.factors.serotypeRisk.serotypeId,
      score: hpi.factors.serotypeRisk.score,
      weight: hpi.factors.serotypeRisk.weight,
      weighted: hpi.factors.serotypeRisk.score * hpi.factors.serotypeRisk.weight,
    },
    travel: {
      raw: hpi.factors.travelConnectivity.level,
      score: hpi.factors.travelConnectivity.score,
      weight: hpi.factors.travelConnectivity.weight,
      weighted: hpi.factors.travelConnectivity.score * hpi.factors.travelConnectivity.weight,
    },
    baseline: {
      raw: hpi.factors.historicalBaseline.deviation,
      score: hpi.factors.historicalBaseline.score,
      weight: hpi.factors.historicalBaseline.weight,
      weighted: hpi.factors.historicalBaseline.score * hpi.factors.historicalBaseline.weight,
    },
  };
}
