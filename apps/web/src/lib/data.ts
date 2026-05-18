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

import type {
  ActiveCluster,
  CaseRecord,
  ContinentCode,
  CountryRiskSnapshotEntry,
  CountrySignal,
  CountryStatus,
  CountryView,
  HpiResult,
  MvHondiusImport,
  SerotypeId,
} from '@hantawatch/shared/types';
import { cleanNewsTitle, dedupByTitle } from './news-format';
import { isAuthoritativeNewsSource } from './news-allowlist';

import activeClustersJson from '@/data/active-clusters.json';
import recentCasesIntlJson from '@/data/recent-cases-intl.json';
import recentCasesChinaJson from '@/data/recent-cases-china.json';
import chinaBaselineJson from '@/data/china-baseline.json';
import hpiHistoryJson from '@/data/hpi-history.json';
import dailyBriefJson from '@/data/daily-brief.json';
import riskSnapshotJson from '@/data/risk-snapshot.json';
import metaJson from '@/data/meta.json';
import realtimeFeedJson from '@/data/realtime-feed.json';
import countryStatusJson from '@/data/country-status.json';
import mvHondiusImportsJson from '@/data/mv-hondius-imports.json';
import countrySignalsJson from '@/data/country-signals.json';
import countryRiskSnapshotJson from '@/data/country-risk-snapshot.json';
import officialSourcesJson from '@/data/official-sources.json';

// ---- Active clusters & current HPI ---------------------------------------

export const activeClusters: ActiveCluster[] = activeClustersJson.clusters as ActiveCluster[];
export const riskSnapshot = riskSnapshotJson as {
  currentHpi?: HpiResult;
  nearestImport?: unknown;
  displayedDistanceKm?: number;
  sourceDistanceKm?: number;
  hasImportDistance?: boolean;
  distanceDeltaKm?: number;
  hpiDelta?: number;
  dailyBrief?: Partial<DailyBrief>;
};
export const currentHpi: HpiResult = (riskSnapshot.currentHpi ?? activeClustersJson.currentHpi) as HpiResult;

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
  latestChange?: string;
  situation?: string;
  riskJudgment?: string;
  evidence?: string[];
}

const riskSnapshotDailyBrief = riskSnapshot.dailyBrief as Partial<DailyBrief> | undefined;
const staticDailyBrief = dailyBriefJson as DailyBrief;

export const todayBrief: DailyBrief = {
  date: riskSnapshotDailyBrief?.date ?? staticDailyBrief.date,
  distanceDeltaKm: riskSnapshotDailyBrief?.distanceDeltaKm ?? staticDailyBrief.distanceDeltaKm,
  hpiDelta: riskSnapshotDailyBrief?.hpiDelta ?? staticDailyBrief.hpiDelta,
  globalNewCases: riskSnapshotDailyBrief?.globalNewCases ?? staticDailyBrief.globalNewCases,
  domesticBaselineStatus: (riskSnapshotDailyBrief?.domesticBaselineStatus ?? staticDailyBrief.domesticBaselineStatus) as DailyBrief['domesticBaselineStatus'],
  oneLine: riskSnapshotDailyBrief?.oneLine ?? staticDailyBrief.oneLine,
  daysSinceLastIntlAlert: riskSnapshotDailyBrief?.daysSinceLastIntlAlert ?? staticDailyBrief.daysSinceLastIntlAlert,
  latestChange: riskSnapshotDailyBrief?.latestChange ?? staticDailyBrief.latestChange,
  situation: riskSnapshotDailyBrief?.situation ?? staticDailyBrief.situation,
  riskJudgment: riskSnapshotDailyBrief?.riskJudgment ?? staticDailyBrief.riskJudgment,
  evidence: riskSnapshotDailyBrief?.evidence ?? staticDailyBrief.evidence,
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
 * Merged, sorted timeline. Domestic + international.
 */

function recentCaseTier(c: RecentCase): number {
  const name = c.source?.name ?? '';
  const conf = c.source?.confidence;
  if (name.includes('WHO') || name.includes('DON')) return 0;
  if (conf === 'official') return 1;
  if (conf === 'surveillance') return 2;
  if (conf === 'news') return 3;
  return 4;
}

export function sortRecentCases(rows: RecentCase[]): RecentCase[] {
  return [...rows].sort((a, b) => {
    const tierDiff = recentCaseTier(a) - recentCaseTier(b);
    if (tierDiff !== 0) return tierDiff;
    return b.date.localeCompare(a.date);
  });
}

export const recentCases: RecentCase[] = dedupByTitle(sortRecentCases([...intlCases, ...chinaCases]));

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
    official_sources?: { entries: number; ok: boolean; okCount?: number; checkedAt?: string | null };
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

export interface OfficialSourceStatus {
  id: string;
  nameZh: string;
  scope: string;
  countryIso2?: string;
  url: string;
  checkedAt?: string | null;
  ok: boolean;
  statusCode?: number;
  finalUrl?: string;
  hantaKeywordHit: boolean;
  error?: string;
}

export const officialSourcesStatus = officialSourcesJson as {
  checkedAt?: string | null;
  okCount: number;
  total: number;
  hantaKeywordHitCount: number;
  sources: OfficialSourceStatus[];
};

// ---- Realtime feed (Tier-3 overseas media, machine-translated) -----------
//
// This is an ADDITIONAL feed deliberately kept separate from
// recent-cases-intl.json so the official+allow-listed news pipeline stays
// uncontaminated. Each entry comes from a non-authoritative source
// (currently Yahoo News live updates) and has been AI-translated at
// collection time. Compliance wording is locked: the disclaimer banner
// says "AI 翻译" (never "机翻" / "机器翻译") and the section header MUST
// NOT carry a "境外媒体" tag — see realtime-feed-section.tsx.

export interface RealtimeUpdate {
  id: string;
  time: string;            // ISO 8601, original outlet timestamp
  title_en: string;
  body_en?: string;        // optional longer paragraph
  summary_zh: string;      // ≤40 Chinese chars
  key_facts_zh: string[];  // 1-3 short tags
  source_url?: string;     // direct URL to the original update if available
}

export interface RealtimeFeed {
  source_name: string;
  source_url: string;
  last_fetched: string | null;
  machine_translated: boolean;
  translator_model: string | null;
  disclaimer_zh: string;
  updates: RealtimeUpdate[];
}

export const realtimeFeed: RealtimeFeed = {
  source_name: (realtimeFeedJson as RealtimeFeed).source_name,
  source_url: (realtimeFeedJson as RealtimeFeed).source_url,
  last_fetched: (realtimeFeedJson as RealtimeFeed).last_fetched ?? null,
  machine_translated: (realtimeFeedJson as RealtimeFeed).machine_translated ?? true,
  translator_model: (realtimeFeedJson as RealtimeFeed).translator_model ?? null,
  disclaimer_zh: (realtimeFeedJson as RealtimeFeed).disclaimer_zh,
  updates: (realtimeFeedJson as RealtimeFeed).updates ?? [],
};

// ---- Country status (epidemiology baseline + imports + signals) ---------
//
// Three layers joined here at module-load time, exposed as a single
// `countryViews` array sorted for display + helpers for grouping and search.
//
// Layer 1: hand-curated baseline           (country-status.json)
// Layer 2: hand-curated import tracking    (mv-hondius-imports.json)
// Layer 3: auto-aggregated signal heat     (country-signals.json)

export const hondiusImports: MvHondiusImport[] =
  (mvHondiusImportsJson.imports as MvHondiusImport[]) ?? [];

export const hondiusOutbreakName: string =
  (mvHondiusImportsJson as { outbreakName?: string }).outbreakName ??
  'MV Hondius 邮轮安第斯型聚集疫情';

const _importsByIso2 = new Map<string, MvHondiusImport>(
  hondiusImports.map((imp) => [imp.iso2.toUpperCase(), imp]),
);

const _signalsByIso2: Record<string, CountrySignal> =
  (countrySignalsJson as { countries?: Record<string, CountrySignal> }).countries ?? {};

export const countryRiskSnapshot = countryRiskSnapshotJson as {
  date?: string;
  windowDays?: number;
  freshnessWarningHours?: number;
  countries?: Record<string, CountryRiskSnapshotEntry>;
};

const _riskByIso2: Record<string, CountryRiskSnapshotEntry> =
  countryRiskSnapshot.countries ?? {};

/** Continent display order — matches the page section order. */
export const CONTINENT_ORDER: ContinentCode[] = [
  'americas',  // Andes + Sin Nombre — highest interest right now
  'europe',    // big Puumala block + import-receiving countries
  'asia',      // CN/KR HFRS plus regional monitoring
  'oceania',
  'africa',
];

export const CONTINENT_LABEL_ZH: Record<ContinentCode, string> = {
  americas: '美洲',
  europe: '欧洲',
  asia: '亚洲',
  oceania: '大洋洲',
  africa: '非洲',
};

/**
 * All 35 baseline countries, enriched with Layer 2 (imports) + Layer 3
 * (signal heat) when available. The base list comes from the hand-curated
 * `country-status.json`; the auto-aggregated signal layer never *adds*
 * countries here (we deliberately avoid showing countries with zero
 * epidemiological context, since a single news mention without
 * background is misleading for a Chinese audience).
 */
export const countryViews: CountryView[] = (countryStatusJson.countries as CountryStatus[])
  .map((c) => ({
    ...c,
    iso2: c.iso2.toUpperCase(),
    signals: _signalsByIso2[c.iso2.toUpperCase()],
    imports: _importsByIso2.get(c.iso2.toUpperCase()),
    risk: _riskByIso2[c.iso2.toUpperCase()],
  }));

/** Country sort within a continent, designed for the UI's scan-from-top use case:
 *  1. Active import event (red/orange badge) first — these are TIME-CRITICAL,
 *  2. Local Andes transmission (red, highest fatality serotype) next,
 *  3. Higher 30-day signal heat first (active news clusters),
 *  4. Alphabetical (Chinese name) as deterministic tiebreaker.
 */
function _countrySortKey(c: CountryView): [number, number, number, string] {
  return [
    c.risk?.riskLevel === 'active' ? 0 : c.risk?.riskLevel === 'elevated' ? 1 : c.imports ? 2 : 3,
    c.hasLocalAndes ? 0 : 1,                    // andes second
    -(c.risk?.signalCount30d ?? c.signals?.signalCount30d ?? 0),
    c.nameZh,                                   // stable alpha order
  ];
}

function _compareSortKeys(
  a: [number, number, number, string],
  b: [number, number, number, string],
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
  }
  return a[3].localeCompare(b[3]);
}

/** Pre-grouped + pre-sorted for the page's continent accordion sections. */
export const countryViewsByContinent: Record<ContinentCode, CountryView[]> =
  CONTINENT_ORDER.reduce(
    (acc, cont) => {
      acc[cont] = countryViews
        .filter((c) => c.continent === cont)
        .sort((a, b) => _compareSortKeys(_countrySortKey(a), _countrySortKey(b)));
      return acc;
    },
    {} as Record<ContinentCode, CountryView[]>,
  );

/**
 * Fuzzy search across ISO2 + Chinese name + English name. Case-insensitive,
 * substring match. Returns up to `limit` matches sorted by the same logic
 * as the continent groups so the most actionable matches surface first.
 *
 * Examples:
 *   searchCountries('德')     → [Germany]
 *   searchCountries('ger')    → [Germany]
 *   searchCountries('AR')     → [Argentina]
 *   searchCountries('西')     → [Spain]      (西班牙)
 *   searchCountries('south')  → [South Korea]
 */
export function searchCountries(query: string, limit = 12): CountryView[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return countryViews
    .filter((c) =>
      c.iso2.toLowerCase().includes(q) ||
      c.nameZh.toLowerCase().includes(q) ||
      c.nameEn.toLowerCase().includes(q),
    )
    .sort((a, b) => _compareSortKeys(_countrySortKey(a), _countrySortKey(b)))
    .slice(0, limit);
}

// ---- Re-export SerotypeId type for callers --------------------------------
export type { SerotypeId };
