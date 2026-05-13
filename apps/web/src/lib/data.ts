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
import { cleanNewsTitle, dedupByTitle } from './news-format';
import { isAuthoritativeNewsSource } from './news-allowlist';

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
type RawIntlCase = CaseRecord & { title?: string; summary?: string };

/**
 * Render-time authoritative-source filter (2026-05-13).
 *
 * Mirrors the collector-side allowlist in `news_leads.py`. Applied to
 * the JSON on disk so the filter takes effect immediately, without
 * waiting for the next bot run.
 *
 * Pass-through rules:
 *   - `confidence: 'official'`  always shown (WHO DON, ECDC — authoritative
 *                                by their collection path).
 *   - `manual-` id prefix       always shown (admin-curated entries are
 *                                exempt, see `merge_manual_news_leads`).
 *   - `confidence: 'news'`      shown iff the outlet is on the authoritative
 *                                allowlist (Xinhua, mainland CDC/NHC,
 *                                WHO, ECDC, Swiss BAG, Taiwan CDC,
 *                                ministries of health, …).
 */
function passesNewsAllowlist(c: RawIntlCase): boolean {
  const conf = c.source?.confidence;
  if (conf === 'official') return true;
  if (c.id?.startsWith('manual-')) return true;
  if (conf !== 'news') return true; // unknown confidence — be permissive
  return isAuthoritativeNewsSource(c.source?.name, c.source?.url);
}

const intlCases: RecentCase[] = (recentCasesIntlJson.cases as RawIntlCase[])
  .filter(passesNewsAllowlist)
  .map((c) => {
    // Render-time normalisation for news-confidence entries
    // (see lib/news-format.ts for rationale):
    //
    //   - strip the trailing ' - outlet' tag from titles (Google News
    //     appends it to every headline; we already show the outlet
    //     separately so the suffix in the title is redundant + ugly),
    //
    //   - clear the summary: Google News stuffs the <description> with a
    //     concatenation of every related-story headline + outlet name,
    //     which renders as a confusing wall of text. The title alone
    //     carries the signal for news entries.
    //
    // Official entries (WHO DON, ECDC) get their summary left intact —
    // those are well-formed by the publisher.
    const isNews = c.source?.confidence === 'news';
    return {
      ...c,
      title: isNews && c.title ? cleanNewsTitle(c.title) : c.title,
      summary: isNews ? '' : c.summary,
      scope: 'international' as const,
    };
  });

/**
 * Merged, sorted (newest first) timeline. Domestic + international.
 *
 * After sorting we run a title-key dedup pass so the same wire story
 * republished by multiple outlets (e.g. a Tedros statement appearing
 * under both 天津日报 and 新华网) collapses to a single row, keeping
 * the newest occurrence. See `news-format.ts#dedupByTitle`.
 *
 * Page rendering decides how to label and emphasise serotype/distance.
 */
export const recentCases: RecentCase[] = dedupByTitle(
  [...intlCases, ...chinaCases].sort((a, b) => b.date.localeCompare(a.date)),
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
