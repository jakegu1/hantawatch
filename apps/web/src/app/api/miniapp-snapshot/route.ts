import { NextResponse } from 'next/server';
import activeClusters from '@/data/active-clusters.json';
import recentCasesIntl from '@/data/recent-cases-intl.json';
import recentCasesChina from '@/data/recent-cases-china.json';
import chinaBaseline from '@/data/china-baseline.json';
import hpiHistory from '@/data/hpi-history.json';
import dailyBrief from '@/data/daily-brief.json';
import riskSnapshot from '@/data/risk-snapshot.json';
import meta from '@/data/meta.json';
import realtimeFeed from '@/data/realtime-feed.json';
import countryStatus from '@/data/country-status.json';
import mvHondiusImports from '@/data/mv-hondius-imports.json';
import countrySignals from '@/data/country-signals.json';
import countryRiskSnapshot from '@/data/country-risk-snapshot.json';
import arcgisAndvTracking from '@/data/arcgis-andv-tracking.json';
import outbreakStatus from '@/data/outbreak-status.json';
import officialAssessments from '@/data/official-assessments.json';
import realtimeSituation from '@/data/realtime-situation.json';

/**
 * GET /api/miniapp-snapshot
 *
 * Single consolidated payload of every collector-built JSON the WeChat
 * miniapp bundles at build time. The miniapp fetches this once on load (and
 * on pull-to-refresh) so its data tracks the daily collector updates without
 * needing a republish — mirroring how Vercel auto-redeploys the web app.
 *
 * This returns the COLLECTOR BASELINE only (no Supabase/editorial overrides),
 * so it stays available even when Supabase is down. The miniapp continues to
 * layer editorial overrides via the existing /api/clusters, /api/hondius-imports
 * and /api/news-entries endpoints.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    {
      activeClusters,
      recentCasesIntl,
      recentCasesChina,
      chinaBaseline,
      hpiHistory,
      dailyBrief,
      riskSnapshot,
      meta,
      realtimeFeed,
      countryStatus,
      mvHondiusImports,
      countrySignals,
      countryRiskSnapshot,
      arcgisAndvTracking,
      outbreakStatus,
      officialAssessments,
      realtimeSituation,
    },
    {
      headers: {
        'cache-control': 'no-store, max-age=0',
      },
    },
  );
}
