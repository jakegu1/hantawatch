import { NextResponse } from 'next/server';
import { currentHpi, riskSnapshot } from '@/lib/data';
import { hpiFactorsToBreakdown } from '@/lib/risk-snapshot';

/**
 * GET /api/hpi
 * Returns the current HPI snapshot using the same import-distance adjustment
 * that the homepage applies.
 */
export async function GET() {
  const hpi = currentHpi;

  return NextResponse.json({
    total: hpi.total,
    grade: hpi.grade,
    gradeZh: hpi.gradeZh,
    color: hpi.color,
    factors: hpi.factors,
    breakdown: hpiFactorsToBreakdown(hpi),
    referenceCluster: hpi.referenceCluster,
    nearestImport: riskSnapshot.nearestImport,
    displayedDistanceKm: riskSnapshot.displayedDistanceKm,
    sourceDistanceKm: riskSnapshot.sourceDistanceKm,
    hasImportDistance: riskSnapshot.hasImportDistance,
    updatedAt: new Date().toISOString(),
    methodology: 'https://bingduguancha.com/about#hpi',
  });
}
