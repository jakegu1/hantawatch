import { NextResponse } from 'next/server';
import { calculateHpi } from '@/lib/hpi';

/**
 * GET /api/hpi
 * Returns the current HPI calculation.
 */
export async function GET() {
  const hpi = calculateHpi({
    distanceKm: 18800,
    officialRiskLevel: 'low',
    serotypeId: 'andes',
    travelConnectivity: 'indirect',
    baselineDeviation: 'normal',
  });

  return NextResponse.json({
    total: hpi.total,
    grade: hpi.grade,
    gradeZh: hpi.gradeZh,
    color: hpi.color,
    breakdown: hpi.breakdown,
    updatedAt: new Date().toISOString(),
    methodology: 'https://bingduguancha.com/about#hpi',
  });
}
