/**
 * Runtime data adapter for the miniapp.
 *
 * Reads the SAME JSON artefacts the web app uses (apps/web/src/data/*.json,
 * produced by services/collector). The webpack alias `@web-data` in
 * `config/index.ts` resolves to that folder so there is exactly ONE source
 * of truth — the collector writes once and both apps read it.
 *
 * Mirrors apps/web/src/lib/data.ts. Keep the two in sync.
 */

import { sortRecentCasesByDate } from '@hantawatch/shared/timeline';
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

// ---- HPI history ---------------------------------------------------------

export const hpi7DayHistory: { date: string; value: number }[] = hpiHistoryJson.series.slice(-7);

// ---- Daily brief ---------------------------------------------------------

export interface DailyBrief {
  date: string;
  distanceDeltaKm: number;
  hpiDelta: number;
  globalNewCases: number;
  domesticBaselineStatus: 'normal' | 'elevated' | 'below';
  oneLine: string;
  daysSinceLastIntlAlert: number;
  whoDaysSinceOfficialUpdate?: number;
  cluesLast24h?: number;
  headline24h?: string;
  latestChange?: string;
  situation?: string;
  riskJudgment?: string;
  newCases?: string;
  sourceSummary?: string;
  watchFocus?: string[];
  shareLine?: string;
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
  whoDaysSinceOfficialUpdate:
    riskSnapshotDailyBrief?.whoDaysSinceOfficialUpdate ??
    staticDailyBrief.whoDaysSinceOfficialUpdate ??
    riskSnapshotDailyBrief?.daysSinceLastIntlAlert ??
    staticDailyBrief.daysSinceLastIntlAlert,
  cluesLast24h: riskSnapshotDailyBrief?.cluesLast24h ?? staticDailyBrief.cluesLast24h,
  headline24h: riskSnapshotDailyBrief?.headline24h ?? staticDailyBrief.headline24h,
  latestChange: riskSnapshotDailyBrief?.latestChange ?? staticDailyBrief.latestChange,
  situation: riskSnapshotDailyBrief?.situation ?? staticDailyBrief.situation,
  riskJudgment: riskSnapshotDailyBrief?.riskJudgment ?? staticDailyBrief.riskJudgment,
  newCases: riskSnapshotDailyBrief?.newCases ?? staticDailyBrief.newCases,
  sourceSummary: riskSnapshotDailyBrief?.sourceSummary ?? staticDailyBrief.sourceSummary,
  watchFocus: riskSnapshotDailyBrief?.watchFocus ?? staticDailyBrief.watchFocus,
  shareLine: riskSnapshotDailyBrief?.shareLine ?? staticDailyBrief.shareLine,
  evidence: riskSnapshotDailyBrief?.evidence ?? staticDailyBrief.evidence,
  structuralLine: riskSnapshotDailyBrief?.structuralLine ?? staticDailyBrief.structuralLine,
};

// ---- China baseline ------------------------------------------------------

export const chinaHfrsHistory: { year: number; cases: number; deaths: number }[] =
  chinaBaselineJson.yearly;

export const chinaHfrsMonthly2026: { month: string; cases: number }[] =
  chinaBaselineJson.monthlyCurrentYear.months;

export const chinaProvinceCases: { code: string; name: string; annualCases: number }[] =
  chinaBaselineJson.byProvince;

// ---- Recent cases --------------------------------------------------------

export interface RecentCase extends CaseRecord {
  title?: string;
  summary?: string;
  scope: 'china' | 'international';
}

const chinaCases: RecentCase[] = (recentCasesChinaJson.cases as CaseRecord[]).map((c) => ({
  ...c,
  scope: 'china' as const,
}));

type RawIntlCase = CaseRecord & { title?: string; summary?: string };

function passesNewsAllowlist(c: RawIntlCase): boolean {
  const conf = c.source?.confidence;
  if (conf === 'official') return true;
  if (c.id?.startsWith('manual-')) return true;
  if (conf !== 'news') return true;
  return isAuthoritativeNewsSource(c.source?.name, c.source?.url);
}

const intlCases: RecentCase[] = (recentCasesIntlJson.cases as RawIntlCase[])
  .filter(passesNewsAllowlist)
  .map((c) => {
    const isNews = c.source?.confidence === 'news';
    return {
      ...c,
      title: isNews && c.title ? cleanNewsTitle(c.title) : c.title,
      summary: isNews ? '' : c.summary,
      scope: 'international' as const,
    };
  });

export const recentCases: RecentCase[] = dedupByTitle(sortRecentCasesByDate([...intlCases, ...chinaCases]));

// ---- Pipeline meta -------------------------------------------------------

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
  lastCollectedAtCn: (metaJson as { lastCollectedAtCn?: string }).lastCollectedAtCn,
  sources: metaJson.sources as DataMeta['sources'],
  clusterCount: metaJson.clusterCount,
  yesterdayNearestDistanceKm: metaJson.yesterdayNearestDistanceKm,
};

// ---- Realtime feed (Tier-3 overseas media, machine-translated) -----------

export interface RealtimeUpdate {
  id: string;
  time: string;
  title_en: string;
  body_en?: string;
  summary_zh: string;
  key_facts_zh: string[];
  source_url?: string;
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

// ---- Country status (mirrors apps/web/src/lib/data.ts) ------------------

export const hondiusImports: MvHondiusImport[] =
  (mvHondiusImportsJson.imports as MvHondiusImport[]) ?? [];

const _COUNTRY_NAMES_ZH: Record<string, string> = {
  US: '美国', AU: '澳大利亚', ES: '西班牙', FR: '法国',
  CA: '加拿大', GB: '英国', DE: '德国', CL: '智利', AR: '阿根廷',
};

export const hondiusImportSummaries: { date: string; summary_zh: string; countryNameZh?: string }[] =
  hondiusImports.map((imp) => ({
    date: imp.date,
    summary_zh: imp.summary_zh,
    countryNameZh: _COUNTRY_NAMES_ZH[imp.iso2?.toUpperCase() ?? ''] ?? undefined,
  }));

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

export const CONTINENT_ORDER: ContinentCode[] = [
  'americas',
  'europe',
  'asia',
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

export const countryViews: CountryView[] = (countryStatusJson.countries as CountryStatus[])
  .map((c) => ({
    ...c,
    iso2: c.iso2.toUpperCase(),
    signals: _signalsByIso2[c.iso2.toUpperCase()],
    imports: _importsByIso2.get(c.iso2.toUpperCase()),
    risk: _riskByIso2[c.iso2.toUpperCase()],
  }));

function _countrySortKey(c: CountryView): [number, number, number, string] {
  return [
    c.risk?.riskLevel === 'active' ? 0 : c.risk?.riskLevel === 'elevated' ? 1 : c.imports ? 2 : 3,
    c.hasLocalAndes ? 0 : 1,
    -(c.risk?.signalCount30d ?? c.signals?.signalCount30d ?? 0),
    c.nameZh,
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

export type { SerotypeId };
