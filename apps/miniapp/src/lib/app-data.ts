/**
 * Pure derivation layer for the miniapp.
 *
 * `deriveAppData(raw)` turns the raw collector JSON bundle into the derived
 * view-model the pages consume. It is called twice:
 *   1. At module load in `data.ts` with the build-time-bundled JSON (instant
 *      first paint, offline-safe fallback).
 *   2. At runtime by the DataProvider with the freshly-fetched
 *      `/api/miniapp-snapshot` payload, so the published miniapp tracks the
 *      daily collector updates without a republish.
 *
 * Keep this in sync with apps/web/src/lib/data.ts (web gets freshness for free
 * because Vercel redeploys on every data commit; the miniapp needs this layer).
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
} from '@hantawatch/shared/types';
import type { OutbreakStatus } from '@hantawatch/shared/types/outbreak-status';
import type { RealtimeSituation } from '@/data/realtime-situation';
import { cleanNewsTitle, dedupByTitle } from './news-format';
import { isAuthoritativeNewsSource } from './news-allowlist';
import type { RawBundle } from './data';

// ---- Shared view-model types (re-exported from data.ts) ------------------

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
  structuralLine?: string;
}

export interface RecentCase extends CaseRecord {
  title?: string;
  summary?: string;
  scope: 'china' | 'international';
}

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

export interface OfficialAssessment {
  body: string;
  level: string;
  tone: 'low' | 'moderate' | 'high';
}

export interface RiskSnapshotShape {
  currentHpi?: HpiResult;
  baseHpi?: HpiResult;
  nearestImport?: unknown;
  displayedDistanceKm?: number;
  sourceDistanceKm?: number;
  hasImportDistance?: boolean;
  distanceDeltaKm?: number;
  hpiDelta?: number;
  dailyBrief?: Partial<DailyBrief>;
}

export interface CountryRiskSnapshotShape {
  date?: string;
  windowDays?: number;
  freshnessWarningHours?: number;
  countries?: Record<string, CountryRiskSnapshotEntry>;
}

// ---- Static (data-independent) constants & helpers -----------------------

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

const _COUNTRY_NAMES_ZH: Record<string, string> = {
  US: '美国', AU: '澳大利亚', ES: '西班牙', FR: '法国',
  CA: '加拿大', GB: '英国', DE: '德国', CL: '智利', AR: '阿根廷',
};

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

function _passesNewsAllowlist(c: CaseRecord & { title?: string; summary?: string }): boolean {
  const conf = c.source?.confidence;
  if (conf === 'official') return true;
  if (c.id?.startsWith('manual-')) return true;
  if (conf !== 'news') return true;
  return isAuthoritativeNewsSource(c.source?.name, c.source?.url);
}

// ---- Derivation ----------------------------------------------------------

export function deriveAppData(raw: RawBundle) {
  const activeClusters = raw.activeClusters.clusters as ActiveCluster[];

  const riskSnapshot = raw.riskSnapshot as RiskSnapshotShape;
  const currentHpi: HpiResult = (riskSnapshot.currentHpi ?? raw.activeClusters.currentHpi) as HpiResult;
  const baseHpi: HpiResult = (riskSnapshot.baseHpi ?? riskSnapshot.currentHpi ?? raw.activeClusters.currentHpi) as HpiResult;

  const hpi7DayHistory: { date: string; value: number }[] = raw.hpiHistory.series.slice(-7);

  const riskSnapshotDailyBrief = riskSnapshot.dailyBrief as Partial<DailyBrief> | undefined;
  const staticDailyBrief = raw.dailyBrief as DailyBrief;
  const todayBrief: DailyBrief = {
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

  const chinaHfrsHistory = raw.chinaBaseline.yearly as { year: number; cases: number; deaths: number }[];
  const chinaHfrsMonthly2026 = raw.chinaBaseline.monthlyCurrentYear.months as { month: string; cases: number }[];
  const chinaProvinceCases = raw.chinaBaseline.byProvince as { code: string; name: string; annualCases: number }[];

  const chinaCases: RecentCase[] = (raw.recentCasesChina.cases as CaseRecord[]).map((c) => ({
    ...c,
    scope: 'china' as const,
  }));

  type RawIntlCase = CaseRecord & { title?: string; summary?: string };
  const intlCases: RecentCase[] = (raw.recentCasesIntl.cases as RawIntlCase[])
    .filter(_passesNewsAllowlist)
    .map((c) => {
      const isNews = c.source?.confidence === 'news';
      return {
        ...c,
        title: isNews && c.title ? cleanNewsTitle(c.title) : c.title,
        summary: isNews ? '' : c.summary,
        scope: 'international' as const,
      };
    });

  const recentCases: RecentCase[] = dedupByTitle(sortRecentCasesByDate([...intlCases, ...chinaCases]));

  const dataMeta: DataMeta = {
    lastCollectedAt: raw.meta.lastCollectedAt,
    lastCollectedAtCn: (raw.meta as { lastCollectedAtCn?: string }).lastCollectedAtCn,
    sources: raw.meta.sources as DataMeta['sources'],
    clusterCount: raw.meta.clusterCount,
    yesterdayNearestDistanceKm: raw.meta.yesterdayNearestDistanceKm,
  };

  const rf = raw.realtimeFeed as RealtimeFeed;
  const realtimeFeed: RealtimeFeed = {
    source_name: rf.source_name,
    source_url: rf.source_url,
    last_fetched: rf.last_fetched ?? null,
    machine_translated: rf.machine_translated ?? true,
    translator_model: rf.translator_model ?? null,
    disclaimer_zh: rf.disclaimer_zh,
    updates: rf.updates ?? [],
  };

  const hondiusImports: MvHondiusImport[] =
    (raw.mvHondiusImports.imports as MvHondiusImport[]) ?? [];

  const officialAssessments: { asOf: string; assessments: OfficialAssessment[] } = {
    asOf: (raw.officialAssessments as { asOf?: string }).asOf ?? '',
    assessments: (raw.officialAssessments as { assessments?: OfficialAssessment[] }).assessments ?? [],
  };

  const outbreakStatus: OutbreakStatus[] =
    (raw.outbreakStatus as unknown as { outbreaks?: OutbreakStatus[] }).outbreaks ?? [];

  const arcgisCases: Array<{ country: string; confirmed: number; monitoring: number; total: number }> =
    (raw.arcgisAndvTracking as { cases?: typeof arcgisCases }).cases ?? [];

  const hondiusImportSummaries: { date: string; summary_zh: string; countryNameZh?: string }[] =
    hondiusImports.map((imp) => ({
      date: imp.date,
      summary_zh: imp.summary_zh,
      countryNameZh: _COUNTRY_NAMES_ZH[imp.iso2?.toUpperCase() ?? ''] ?? undefined,
    }));

  const hondiusOutbreakName: string =
    (raw.mvHondiusImports as { outbreakName?: string }).outbreakName ??
    'MV Hondius 邮轮安第斯型聚集疫情';

  const _importsByIso2 = new Map<string, MvHondiusImport>(
    hondiusImports.map((imp) => [imp.iso2.toUpperCase(), imp]),
  );
  const _signalsByIso2: Record<string, CountrySignal> =
    (raw.countrySignals as { countries?: Record<string, CountrySignal> }).countries ?? {};
  const countryRiskSnapshot = raw.countryRiskSnapshot as CountryRiskSnapshotShape;
  const _riskByIso2: Record<string, CountryRiskSnapshotEntry> =
    countryRiskSnapshot.countries ?? {};

  const countryViews: CountryView[] = (raw.countryStatus.countries as CountryStatus[])
    .map((c) => ({
      ...c,
      iso2: c.iso2.toUpperCase(),
      signals: _signalsByIso2[c.iso2.toUpperCase()],
      imports: _importsByIso2.get(c.iso2.toUpperCase()),
      risk: _riskByIso2[c.iso2.toUpperCase()],
    }));

  const countryViewsByContinent: Record<ContinentCode, CountryView[]> =
    CONTINENT_ORDER.reduce(
      (acc, cont) => {
        acc[cont] = countryViews
          .filter((c) => c.continent === cont)
          .sort((a, b) => _compareSortKeys(_countrySortKey(a), _countrySortKey(b)));
        return acc;
      },
      {} as Record<ContinentCode, CountryView[]>,
    );

  const searchCountries = (query: string, limit = 12): CountryView[] => {
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
  };

  const realtimeSituation = raw.realtimeSituation as RealtimeSituation;

  return {
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
  };
}

export type AppData = ReturnType<typeof deriveAppData>;
