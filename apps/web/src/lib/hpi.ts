/**
 * HPI (Hanta Proximity Index) calculation engine.
 *
 * HPI = W₁×D + W₂×O + W₃×S + W₄×T + W₅×H
 *
 * All factor inputs and weight mappings are transparent and documented.
 */

export interface HpiInput {
  /** Distance from nearest active cluster to China border (km) */
  distanceKm: number;
  /** WHO/CDC/ChinaCDC official risk assessment level */
  officialRiskLevel: 'low' | 'moderate' | 'high' | 'very_high';
  /** Active serotype ID */
  serotypeId: string;
  /** Travel connectivity level from cluster region to China */
  travelConnectivity: 'none' | 'indirect' | 'direct';
  /** Deviation of China HFRS cases vs historical baseline */
  baselineDeviation: 'below' | 'normal' | 'elevated';
}

export interface HpiOutput {
  total: number;
  grade: 'low' | 'moderate' | 'elevated' | 'high' | 'severe';
  gradeZh: string;
  color: string;
  breakdown: {
    distance: { raw: number; score: number; weight: number; weighted: number };
    official: { raw: string; score: number; weight: number; weighted: number };
    serotype: { raw: string; score: number; weight: number; weighted: number };
    travel: { raw: string; score: number; weight: number; weighted: number };
    baseline: { raw: string; score: number; weight: number; weighted: number };
  };
}

// ---- Factor mappers (transparent, auditable) ----

/** Distance ring → score mapping */
function distanceScore(km: number): number {
  if (km > 10000) return 0;
  if (km > 3000) return 20;
  if (km > 500) return 50;
  return 100;
}

/** Official risk level → score mapping */
function officialScore(level: HpiInput['officialRiskLevel']): number {
  const map: Record<string, number> = {
    low: 0,
    moderate: 40,
    high: 70,
    very_high: 100,
  };
  return map[level] ?? 0;
}

/** Serotype intrinsic risk → score */
function serotypeScore(id: string): number {
  const map: Record<string, number> = {
    andes: 100,
    sin_nombre: 85,
    hantaan: 30,
    seoul: 20,
    puumala: 5,
    other: 15,
  };
  return map[id] ?? 15;
}

/** Travel connectivity → score */
function travelScore(level: HpiInput['travelConnectivity']): number {
  const map: Record<string, number> = {
    none: 5,
    indirect: 15,
    direct: 40,
  };
  return map[level] ?? 5;
}

/** Baseline deviation → score */
function baselineScore(dev: HpiInput['baselineDeviation']): number {
  const map: Record<string, number> = {
    below: 0,
    normal: 20,
    elevated: 90,
  };
  return map[dev] ?? 20;
}

// ---- Grade thresholds ----

interface Grade {
  id: HpiOutput['grade'];
  zh: string;
  color: string;
  min: number;
  max: number;
}

const GRADES: Grade[] = [
  { id: 'low', zh: '低关注', color: '#16a34a', min: 0, max: 20 },
  { id: 'moderate', zh: '一般关注', color: '#0891b2', min: 21, max: 40 },
  { id: 'elevated', zh: '中等关注', color: '#ca8a04', min: 41, max: 60 },
  { id: 'high', zh: '高度关注', color: '#ea580c', min: 61, max: 80 },
  { id: 'severe', zh: '严重关注', color: '#dc2626', min: 81, max: 100 },
];

// Weights
const W = {
  distance: 0.30,
  official: 0.25,
  serotype: 0.20,
  travel: 0.15,
  baseline: 0.10,
};

// ---- Public API ----

export function calculateHpi(input: HpiInput): HpiOutput {
  const dScore = distanceScore(input.distanceKm);
  const oScore = officialScore(input.officialRiskLevel);
  const sScore = serotypeScore(input.serotypeId);
  const tScore = travelScore(input.travelConnectivity);
  const hScore = baselineScore(input.baselineDeviation);

  const dWeighted = dScore * W.distance;
  const oWeighted = oScore * W.official;
  const sWeighted = sScore * W.serotype;
  const tWeighted = tScore * W.travel;
  const hWeighted = hScore * W.baseline;

  const total = Math.round(dWeighted + oWeighted + sWeighted + tWeighted + hWeighted);
  const clampedTotal = Math.max(0, Math.min(100, total));

  const grade = GRADES.find(g => clampedTotal >= g.min && clampedTotal <= g.max) ?? GRADES[0];

  return {
    total: clampedTotal,
    grade: grade.id,
    gradeZh: grade.zh,
    color: grade.color,
    breakdown: {
      distance: { raw: input.distanceKm, score: dScore, weight: W.distance, weighted: dWeighted },
      official: { raw: input.officialRiskLevel, score: oScore, weight: W.official, weighted: oWeighted },
      serotype: { raw: input.serotypeId, score: sScore, weight: W.serotype, weighted: sWeighted },
      travel: { raw: input.travelConnectivity, score: tScore, weight: W.travel, weighted: tWeighted },
      baseline: { raw: input.baselineDeviation, score: hScore, weight: W.baseline, weighted: hWeighted },
    },
  };
}

export { GRADES, W as HPI_WEIGHTS };
export { distanceScore, officialScore, serotypeScore, travelScore, baselineScore };
