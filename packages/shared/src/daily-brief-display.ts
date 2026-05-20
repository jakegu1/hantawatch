/**
 * Shared daily-brief copy rules for Web + MiniApp.
 */

import {
  getCaseDisplayTitle,
  isLowInformationTitle,
  pickMonitoringLeads,
  sortRecentCasesByDate,
  type MonitoringLead,
  type RealtimeSignalInput,
  type TimelineCase,
} from './timeline';

export interface ImportSummaryInput {
  date: string;
  summary_zh: string;
}

export interface BriefDisplayInput {
  briefDate: string;
  oneLine: string;
  /** Collector-generated static structural line (dist + HPI + baseline) */
  structuralLine?: string;
  latestChange?: string;
  situation?: string;
  riskJudgment?: string;
  newCases?: string;
  sourceSummary?: string;
  watchFocus?: string[];
  evidence?: string[];
  shareLine?: string;
  /** Legacy field — days since cluster lastUpdate */
  daysSinceLastIntlAlert: number;
  clusterLastUpdate?: string;
  domesticBaselineStatus: 'normal' | 'elevated' | 'below';
  recentCases: TimelineCase[];
  realtimeUpdates: RealtimeSignalInput[];
  importSummaries?: ImportSummaryInput[];
  hpiTotal: number;
  chinaRiskFallback?: string;
}

export interface BriefDisplayMetrics {
  headline24h: string;
  alertLabel: string;
  whoDaysSinceOfficialUpdate: number;
  cluesLast24h: number;
  monitoringLeads: MonitoringLead[];
}

function parseBriefDayStart(briefDate: string): number {
  return new Date(`${briefDate}T00:00:00+08:00`).getTime();
}

function isWithinHours(isoOrDate: string, briefDate: string, hours: number): boolean {
  const start = parseBriefDayStart(briefDate);
  const end = start + hours * 3600_000;
  const t = isoOrDate.length <= 10 ? new Date(`${isoOrDate}T12:00:00+08:00`).getTime() : new Date(isoOrDate).getTime();
  return !Number.isNaN(t) && t >= start - (hours - 24) * 3600_000 && t <= end;
}

function countCluesLast24h(
  briefDate: string,
  recentCases: TimelineCase[],
  realtimeUpdates: RealtimeSignalInput[],
): number {
  const leads = pickMonitoringLeads(realtimeUpdates, briefDate, 50);
  const caseHits = recentCases.filter(
    (c) =>
      isWithinHours(c.date, briefDate, 24) &&
      !isLowInformationTitle(getCaseDisplayTitle(c)) &&
      c.source.confidence !== 'official',
  );
  return leads.length + caseHits.length;
}

function pickHeadline24h(input: BriefDisplayInput, monitoringLeads: MonitoringLead[]): string {
  if (monitoringLeads[0]?.summary_zh) {
    return monitoringLeads[0].summary_zh;
  }

  const recent = sortRecentCasesByDate(input.recentCases).filter(
    (c) => isWithinHours(c.date, input.briefDate, 24) && !isLowInformationTitle(getCaseDisplayTitle(c)),
  );
  if (recent[0]) {
    const c = recent[0];
    const title = getCaseDisplayTitle(c);
    if (c.summary && c.source.confidence !== 'news') return c.summary;
    return title;
  }

  const imports = (input.importSummaries ?? [])
    .filter((i) => isWithinHours(i.date, input.briefDate, 48))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (imports[0]?.summary_zh) {
    return imports[0].summary_zh;
  }

  if (input.latestChange?.trim()) {
    return input.latestChange.trim();
  }

  return input.oneLine.length > 120 ? `${input.oneLine.slice(0, 117)}…` : input.oneLine;
}

export function computeWhoDaysSinceOfficialUpdate(
  clusterLastUpdate: string | undefined,
  briefDate: string,
  fallbackDays: number,
): number {
  if (!clusterLastUpdate) return fallbackDays;
  try {
    const today = parseBriefDayStart(briefDate);
    const last = new Date(`${clusterLastUpdate}T00:00:00+08:00`).getTime();
    if (Number.isNaN(last)) return fallbackDays;
    return Math.max(0, Math.round((today - last) / 86400000));
  } catch {
    return fallbackDays;
  }
}

export function computeBriefDisplay(input: BriefDisplayInput): BriefDisplayMetrics {
  const monitoringLeads = pickMonitoringLeads(input.realtimeUpdates, input.briefDate, 2);
  const whoDays = computeWhoDaysSinceOfficialUpdate(
    input.clusterLastUpdate,
    input.briefDate,
    input.daysSinceLastIntlAlert,
  );
  const cluesLast24h = countCluesLast24h(input.briefDate, input.recentCases, input.realtimeUpdates);

  const headline24h = pickHeadline24h(input, monitoringLeads);

  let alertLabel = `距上次 WHO 官方更新 ${whoDays} 天`;
  if (cluesLast24h > 0) {
    const shown = Math.min(cluesLast24h, monitoringLeads.length + 1);
    alertLabel += ` · 近 24h ${cluesLast24h} 条线索（展示 ${shown} 条最高信号）`;
  } else {
    alertLabel += ' · 近 24h 无新高可信通报';
  }

  return {
    headline24h,
    alertLabel,
    whoDaysSinceOfficialUpdate: whoDays,
    cluesLast24h,
    monitoringLeads,
  };
}

export interface BriefSectionContent {
  metrics: BriefDisplayMetrics;
  /** Primary 24h fact — always from live signals, not stale JSON alone */
  briefHeadline24h: string;
  briefLatestChange: string;
  briefSituation: string;
  briefRiskJudgment: string;
  briefNewCases: string;
  /** WHO/AI 书面简报摘录（可能与 24h 要点不同） */
  officialExcerpt?: string;
  briefSourceSummary: string;
  briefWatchFocus: string[];
  briefShareLine: string;
  domesticBaselineText: string;
  briefFocusSentence: string;
  /** Static structural line (dist + HPI + baseline, no change detection) */
  structuralMetricsLine: string;
  /** Action-oriented guidance based on current risk context */
  userActionHint: string;
}

function briefCaseText(c: TimelineCase): string {
  const title = getCaseDisplayTitle(c);
  if (c.summary && c.source?.confidence !== 'news') {
    return c.summary;
  }
  return title;
}

export function buildBriefSectionContent(input: BriefDisplayInput): BriefSectionContent {
  const metrics = computeBriefDisplay(input);
  const briefDate = input.briefDate;
  const yesterdayDate = new Date(parseBriefDayStart(briefDate) - 86400000).toISOString().slice(0, 10);

  const chronological = sortRecentCasesByDate(input.recentCases);
  const yesterdayItems = chronological
    .filter((c) => c.date >= yesterdayDate && c.date <= briefDate)
    .filter((c) => !isLowInformationTitle(getCaseDisplayTitle(c)))
    .slice(0, 3);

  const briefItems =
    yesterdayItems.length > 0
      ? yesterdayItems
      : chronological.filter((c) => !isLowInformationTitle(getCaseDisplayTitle(c))).slice(0, 3);

  const latestWho = input.recentCases.find(
    (c) => c.source?.confidence === 'official' && (c.source.name.includes('WHO') || c.source.name.includes('DON')),
  );
  const latestSurveillance = chronological.find((c) => c.source?.confidence === 'surveillance');

  const chinaRiskText =
    input.chinaRiskFallback ??
    (input.hpiTotal <= 35
      ? '对中国大陆公众的短期风险仍处于一般关注水平，重点是持续监测输入病例和官方通报。'
      : 'HPI 已高于低位区间，建议重点查看官方通报、输入监测和国内基线变化。');

  const briefHeadline24h = metrics.headline24h;

  const briefLatestChange =
    metrics.monitoringLeads[0]?.summary_zh ??
    (briefItems[0] ? briefCaseText(briefItems[0]) : briefHeadline24h);

  const staticExcerpt = input.newCases?.trim() || input.latestChange?.trim();
  const officialExcerpt =
    staticExcerpt && staticExcerpt !== briefHeadline24h ? staticExcerpt : undefined;

  const briefSituation = input.situation ?? input.oneLine;

  const briefRiskJudgment = input.riskJudgment ?? chinaRiskText;
  /** Section hero: always the computed 24h headline, not static JSON `newCases` */
  const briefNewCases = briefHeadline24h;
  const briefSourceSummary =
    input.sourceSummary ??
    (latestWho
      ? `主要依据：WHO DON（${latestWho.date}）`
      : latestSurveillance
        ? '主要依据：专业监测源'
        : '主要依据：现有公开数据');

  // Dynamic watchFocus: prefer live signals over static JSON fallback.
  const dynamicWatchFocus = (() => {
    const live: string[] = [];
    if (metrics.monitoringLeads[0]?.summary_zh) {
      live.push(metrics.monitoringLeads[0].summary_zh.slice(0, 12));
    }
    if (briefHeadline24h && briefHeadline24h.length > 10) {
      live.push(briefHeadline24h.slice(0, 12));
    }
    if (metrics.cluesLast24h > 0) live.push('近24h监测线索');
    return live.length >= 2 ? live.slice(0, 3) : undefined;
  })();
  const briefWatchFocus = dynamicWatchFocus ??
    (input.watchFocus?.length ? input.watchFocus : input.evidence
  )?.slice(0, 3) ?? ['官方通报', '输入病例', '国内基线'];

  const briefShareLine = input.shareLine ?? `${briefNewCases} ${briefRiskJudgment}`;

  const domesticBaselineText =
    input.domesticBaselineStatus === 'elevated'
      ? '国内 HFRS 高于基线'
      : input.domesticBaselineStatus === 'below'
        ? '国内 HFRS 低于基线'
        : '国内 HFRS 基线正常';

  const briefFocusSentence =
    briefWatchFocus.length > 0
      ? `${briefWatchFocus.join('、')}仍是今日主要观察点。`
      : '继续关注官方通报、输入病例监测和国内 HFRS 基线变化。';

  const structuralMetricsLine = input.structuralLine || input.oneLine;

  const userActionHint = (() => {
    if (input.hpiTotal <= 20) return '当前风险处于低位，保持常规卫生防护即可。';
    const hasImport = input.importSummaries?.some(
      (i) => i.summary_zh.includes('确诊输入') || i.summary_zh.includes('隔离中'),
    );
    if (hasImport) return '如有前往已报告输入病例国家的旅行计划，可关注当地卫生部门更新。';
    if (input.hpiTotal <= 35) return '风险处于一般关注水平，建议查看下方最新通报了解详情。';
    return 'HPI 已上升，建议重点查看官方通报和输入监测动态。';
  })();

  return {
    metrics,
    briefHeadline24h,
    briefLatestChange,
    briefSituation,
    briefRiskJudgment,
    briefNewCases,
    officialExcerpt,
    briefSourceSummary,
    briefWatchFocus,
    briefShareLine,
    domesticBaselineText,
    briefFocusSentence,
    structuralMetricsLine,
    userActionHint,
  };
}
