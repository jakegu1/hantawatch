/**
 * Runtime data adapter for the miniapp.
 *
 * The build-time-bundled JSON (apps/web/src/data/*.json via the `@web-data`
 * webpack alias) is the OFFLINE-SAFE FALLBACK and instant-first-paint source.
 * The actual derivation lives in ./app-data (`deriveAppData`) so the exact
 * same logic can run AGAIN at runtime on the freshly-fetched
 * `/api/miniapp-snapshot` payload — see ./data-provider. That is what keeps a
 * published miniapp's data current without a republish (the web app gets this
 * for free because Vercel redeploys on every collector commit).
 *
 * The named exports below are the BUNDLED snapshot, kept for backward
 * compatibility (fallbacks, non-React modules). React pages should prefer
 * `useAppData()` from ./data-provider to read the live-refreshed values.
 *
 * Mirrors apps/web/src/lib/data.ts. Keep the two in sync.
 */

import type { SerotypeId } from '@hantawatch/shared/types';
import { deriveAppData } from './app-data';

import activeClustersJson from '@web-data/active-clusters.json';
import recentCasesIntlJson from '@web-data/recent-cases-intl.json';
import recentCasesChinaJson from '@web-data/recent-cases-china.json';
import chinaBaselineJson from '@web-data/china-baseline.json';
import hpiHistoryJson from '@web-data/hpi-history.json';
import dailyBriefJson from '@web-data/daily-brief.json';
import riskSnapshotJson from '@web-data/risk-snapshot.json';
import metaJson from '@web-data/meta.json';
import realtimeFeedJson from '@web-data/realtime-feed.json';
import countryStatusJson from '@web-data/country-status.json';
import mvHondiusImportsJson from '@web-data/mv-hondius-imports.json';
import countrySignalsJson from '@web-data/country-signals.json';
import countryRiskSnapshotJson from '@web-data/country-risk-snapshot.json';
import arcgisAndvTrackingJson from '@web-data/arcgis-andv-tracking.json';
import outbreakStatusJson from '@web-data/outbreak-status.json';
import officialAssessmentsJson from '@web-data/official-assessments.json';
import realtimeSituationJson from '@web-data/realtime-situation.json';

/** The raw collector JSON bundle, keyed exactly like `/api/miniapp-snapshot`. */
export const BUNDLED_RAW = {
  activeClusters: activeClustersJson,
  recentCasesIntl: recentCasesIntlJson,
  recentCasesChina: recentCasesChinaJson,
  chinaBaseline: chinaBaselineJson,
  hpiHistory: hpiHistoryJson,
  dailyBrief: dailyBriefJson,
  riskSnapshot: riskSnapshotJson,
  meta: metaJson,
  realtimeFeed: realtimeFeedJson,
  countryStatus: countryStatusJson,
  mvHondiusImports: mvHondiusImportsJson,
  countrySignals: countrySignalsJson,
  countryRiskSnapshot: countryRiskSnapshotJson,
  arcgisAndvTracking: arcgisAndvTrackingJson,
  outbreakStatus: outbreakStatusJson,
  officialAssessments: officialAssessmentsJson,
  realtimeSituation: realtimeSituationJson,
};

export type RawBundle = typeof BUNDLED_RAW;

/** Derived view-model from the build-time bundle (fallback / first paint). */
export const bundledAppData = deriveAppData(BUNDLED_RAW);

export const {
  activeClusters,
  riskSnapshot,
  currentHpi,
  baseHpi,
  hpi7DayHistory,
  todayBrief,
  chinaHfrsHistory,
  chinaHfrsMonthly2026,
  chinaProvinceCases,
  recentCases,
  dataMeta,
  realtimeFeed,
  hondiusImports,
  hondiusImportSummaries,
  hondiusOutbreakName,
  officialAssessments,
  outbreakStatus,
  arcgisCases,
  countryRiskSnapshot,
  countryViews,
  countryViewsByContinent,
  searchCountries,
  realtimeSituation,
} = bundledAppData;

export { CONTINENT_ORDER, CONTINENT_LABEL_ZH } from './app-data';

export type {
  AppData,
  DailyBrief,
  RecentCase,
  NewsLeadsDiagnostic,
  DataMeta,
  RealtimeUpdate,
  RealtimeFeed,
  OfficialAssessment,
} from './app-data';

export type { SerotypeId };
