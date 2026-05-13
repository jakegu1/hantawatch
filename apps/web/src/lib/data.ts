/**
 * Runtime data adapter. Reads JSON artifacts produced by the data pipeline
 * (services/collector — see docs/DATA_OPS.md) and exposes typed exports.
 *
 * Why a thin adapter and not raw JSON imports?
 *   - Keeps the JSON file shape free to evolve without breaking page code.
 *   - Lets us add a few derived/computed values (e.g. provincial-as-CaseRecord
 *     synthesis) in one place.
 *   - Single point where we attach types — JSON imports are otherwise `any`.
 *
 * Source files:
 *   - active-clusters.json      (auto / by collector)
 *   - recent-cases-intl.json    (auto / by collector)
 *   - hpi-history.json          (auto / by collector)
 *   - daily-brief.json          (auto / by collector)
 *   - meta.json                 (auto / by collector)
 *   - china-baseline.json       (MANUAL — yearly/monthly/by-province totals)
 *   - recent-cases-china.json   (MANUAL — domestic case bulletins)
 */

import type { ActiveCluster, CaseRecord, HpiResult, SerotypeId } from '@hantawatch/shared';

import activeClustersJson from '@/data/active-clusters.json';
import recentCasesIntlJson from '@/data/recent-cases-intl.json';
import recentCasesChinaJson from '@/data/recent-cases-china.json';
import chinaBaselineJson from '@/data/china-baseline.json';
import hpiHistoryJson from '@/data/hpi-history.json';
import dailyBriefJson from '@/data/daily-brief.json';
import metaJson from '@/data/meta.json';

// ---- Active clusters & current HPI ---------------------------------------

export const activeClusters: ActiveCluster[] = activeClustersJson.clusters as ActiveCluster[];
export const currentHpi: HpiResult = activeClustersJson.currentHpi as HpiResult;

// ---- HPI history (7-day sparkline) ---------------------------------------

export const hpi7DayHistory: { date: string; value: number }[] = hpiHistoryJson.series.slice(-7);

// ---- Daily brief ----------------------------------------------------------

export interface DailyBrief {
  date: string;
  distanceDeltaKm: number;
  hpiDelta: number;
  globalNewCases: number;
  domesticBaselineStatus: 'normal' | 'elevated' | 'below';
  oneLine: string;
  daysSinceLastIntlAlert: number;
}

export const todayBrief: DailyBrief = {
  date: dailyBriefJson.date,
  distanceDeltaKm: dailyBriefJson.distanceDeltaKm,
  hpiDelta: dailyBriefJson.hpiDelta,
  globalNewCases: dailyBriefJson.globalNewCases,
  domesticBaselineStatus: dailyBriefJson.domesticBaselineStatus as DailyBrief['domesticBaselineStatus'],
  oneLine: dailyBriefJson.oneLine,
  daysSinceLastIntlAlert: dailyBriefJson.daysSinceLastIntlAlert,
};

// ---- China baseline (yearly, monthly, by province) -----------------------

export const chinaHfrsHistory: { year: number; cases: number; deaths: number }[] =
  chinaBaselineJson.yearly;

export const chinaHfrsMonthly2026: { month: string; cases: number }[] =
  chinaBaselineJson.monthlyCurrentYear.months;

export const chinaProvinceCases: { code: string; name: string; annualCases: number }[] =
  chinaBaselineJson.byProvince;

// ---- Recent cases (China + international) ---------------------------------

export interface RecentCase extends CaseRecord {
  /** International cases use this; domestic cases use `notes`. */
  title?: string;
  summary?: string;
  scope: 'china' | 'international';
}

const chinaCases: RecentCase[] = (recentCasesChinaJson.cases as CaseRecord[]).map((c) => ({
  ...c,
  scope: 'china' as const,
}));

/**
 * Compliance strategy for international cases (2026-05-13 v2).
 *
 * v1 of this filter dropped every `confidence: 'news'` entry that didn't
 * start with `manual-`, i.e. the entire Google-News scrape. That was too
 * blunt: the side-effect was that returning visitors saw WHO DON and ECDC
 * reports disappear whenever the collector's WHO fetch flaked (partial
 * failure → new JSON overwrote them with 0 official entries) and all the
 * news leads were hidden anyway.
 *
 * v2 drops the collection-time filter entirely. The compliance line has
 * moved to *render time* via `link-policy.ts` — we still show the source
 * name and headline for every entry, but only mainland sources get a
 * clickable outbound link. That keeps the information flow intact
 * (readers can at least see *that* e.g. Reuters reported on it) while
 * avoiding the two failure modes of v1:
 *   - aggregating overseas outbound links for a mainland audience, and
 *   - pretending overseas official bodies (ECDC/WHO) don't exist.
 *
 * See `link-policy.ts` for the mainland allowlist.
 */
const intlCases: RecentCase[] = (
  recentCasesIntlJson.cases as Array<CaseRecord & { title?: string; summary?: string }>
).map((c) => ({
  ...c,
  scope: 'international' as const,
}));

/**
 * Merged, sorted (newest first) timeline. Domestic + international.
 * Page rendering decides how to label and emphasise serotype/distance.
 */
export const recentCases: RecentCase[] = [...intlCases, ...chinaCases].sort((a, b) =>
  b.date.localeCompare(a.date),
);

// ---- Pipeline meta --------------------------------------------------------

export interface NewsLeadsDiagnostic {
  query: string;
  hl?: string;
  ok: boolean;
  fetched: number;
  blocked: number;
  no_signal: number;
  duplicate: number;
  kept: number;
}

export interface DataMeta {
  lastCollectedAt: string;
  lastCollectedAtCn?: string;
  sources: {
    who_don: { entries: number; ok: boolean };
    ecdc: { ok: boolean };
    news_leads?: { entries: number; ok: boolean; perQuery?: NewsLeadsDiagnostic[] };
  };
  clusterCount: number;
  yesterdayNearestDistanceKm?: number;
}

export const dataMeta: DataMeta = {
  lastCollectedAt: metaJson.lastCollectedAt,
  // `lastCollectedAtCn` is added by newer collector runs; older meta.json may
  // not have it, so guard with `as` cast (TS doesn't infer the optional field
  // from a JSON import).
  lastCollectedAtCn: (metaJson as { lastCollectedAtCn?: string }).lastCollectedAtCn,
  sources: metaJson.sources as DataMeta['sources'],
  clusterCount: metaJson.clusterCount,
  yesterdayNearestDistanceKm: metaJson.yesterdayNearestDistanceKm,
};

// ---- Re-export SerotypeId type for callers --------------------------------
export type { SerotypeId };
