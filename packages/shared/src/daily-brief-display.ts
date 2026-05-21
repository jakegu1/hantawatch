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

/** Structured case-table row for Google AI Mode style comparison. */
export interface CaseTableRow {
  date: string;
  countryNameZh: string;
  caseType: 'import' | 'local' | 'outbreak';
  /** Source type for display: 邮轮输入 / 本地散发 / 聚集疫情 */
  sourceType: string;
  serotypeLabel: string;
  newConfirmed: number;
  totalConfirmed: number;
  deaths: number;
  monitoring: number;
  sourceName: string;
}

export interface ImportSummaryInput {
  date: string;
  summary_zh: string;
  /** Canonical Chinese country name for display (e.g. "法国") */
  countryNameZh?: string;
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
  /** ArcGIS per-country tracking data (monitoring counts) */
  arcgisCases?: Array<{ country: string; confirmed: number; monitoring: number; total: number }>;
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
    const shown = monitoringLeads.length;
    alertLabel += ` · 近 24h 抓取 ${cluesLast24h} 条相关信息，精选 ${shown} 条高可信信号`;
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
  /** Synthesised takeaway for the "24h要点" hero area (not raw signal) */
  briefTakeaway: string;
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
  /** Structured case table for comparison view */
  caseTable: CaseTableRow[];
  /** Summary totals: confirmed, monitoring, deaths across all rows */
  caseTableSummary: { totalConfirmed: number; totalMonitoring: number; totalDeaths: number };
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

  // Synthesised takeaway — prefers fresh hourly signals over stale collector AI.
  const briefTakeaway = (() => {
    // 1. Fresh 24h headline from realtime feed (updated hourly via feeds-only)
    if (briefHeadline24h && briefHeadline24h.length > 15) {
      return briefHeadline24h;
    }
    // 2. Synthesise from monitoring leads
    if (metrics.monitoringLeads.length > 0) {
      const signals = metrics.monitoringLeads.map((l) => l.summary_zh).join('；');
      if (signals.length <= 100) return `今日监测信号：${signals}。`;
      return `今日监测信号：${signals.slice(0, 97)}…。`;
    }
    // 3. Fallback: AI latestChange from last full collector run
    if (input.latestChange?.trim() && input.latestChange.trim().length > 15) {
      return input.latestChange.trim();
    }
    return briefHeadline24h;
  })();

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

  // Dynamic watchFocus from monitoring lead key_facts (deduplicated, ≤6 chars each).
  const dynamicWatchFocus = (() => {
    const seen = new Set<string>();
    const live: string[] = [];
    for (const lead of metrics.monitoringLeads) {
      const facts = lead.key_facts_zh ?? [];
      for (const f of facts) {
        // Keep full fact, cap at 6 chars for display density
        const clean = f.replace(/[，,。.、\s]+/g, '').slice(0, 6);
        if (clean && !seen.has(clean)) {
          seen.add(clean);
          live.push(clean);
        }
      }
    }
    if (live.length < 2 && input.evidence?.length) {
      for (const e of input.evidence) {
        const clean = e.replace(/[，,。.、\s]+/g, '').slice(0, 6);
        if (clean && !seen.has(clean) && live.length < 3) {
          seen.add(clean);
          live.push(clean);
        }
      }
    }
    if (live.length < 2 && metrics.cluesLast24h > 0) {
      live.push('近24h新信号');
    }
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

  // Strip HPI clause from structural line — HPI is already shown in the top badge
  // and may differ from collector raw value due to nearestImport adjustment.
  const structuralMetricsLine = (input.structuralLine || input.oneLine)
    .replace(/，?\s*HPI[^，。]*[，。]?\s*/g, '，')
    .replace(/，+，/g, '，')
    .replace(/^，|，$/g, '')
    .replace(/，，/g, '，');

  const userActionHint = (() => {
    if (input.hpiTotal <= 20) return '当前无需特殊行动，保持常规卫生防护即可。';
    const importSummaries = input.importSummaries ?? [];
    const candidates = importSummaries.filter(
      (i) => i.summary_zh.includes('确诊输入') || i.summary_zh.includes('隔离中'),
    );
    // Prefer explicit countryNameZh, fallback to regex extract from summary
    const names = candidates
      .map((i) => {
        if (i.countryNameZh) return i.countryNameZh;
        // Try country name before 确诊/输入/隔离 (2-3 CJK chars, may have intervening digits/space)
        const m = i.summary_zh.match(/([\u4e00-\u9fff]{2,3}).*?(?:确诊输入|隔离)/);
        return m?.[1] ?? null;
      })
      .filter(Boolean) as string[];
    if (names.length > 0) {
      const cs = [...new Set(names)].slice(0, 2).join('、');
      return `已有输入病例报告国家：${cs}。如有相关旅行计划，可查看中国驻当地使领馆健康提示。`;
    }
    if (input.hpiTotal <= 35) return '当前无需特殊行动，建议关注下方最新通报了解态势变化。';
    return 'HPI 已上升，建议重点查看官方通报和输入监测动态。';
  })();

  return {
    metrics,
    briefHeadline24h,
    briefTakeaway,
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
    caseTable: buildCaseTable(input),
    caseTableSummary: _computeCaseTableSummary(buildCaseTable(input)),
  };
}

function _computeCaseTableSummary(rows: CaseTableRow[]): { totalConfirmed: number; totalMonitoring: number; totalDeaths: number } {
  return {
    // Only count Andes serotype for confirmed & deaths (exclude HTNV/SEOV local cases)
    totalConfirmed: rows.filter((r) => r.serotypeLabel === '安第斯型').reduce((s, r) => s + r.totalConfirmed, 0),
    totalMonitoring: rows.reduce((s, r) => s + r.monitoring, 0),
    totalDeaths: rows.filter((r) => r.serotypeLabel === '安第斯型').reduce((s, r) => s + r.deaths, 0),
  };
}

/** Build structured case table from recent cases + import summaries. */
/** Serotype → Chinese display name */
function serotypeLabel(id: string): string {
  const map: Record<string, string> = {
    'andes': '安第斯型', 'hantaan': '汉滩型', 'seoul': '汉城型',
    'puumala': '普马拉型', 'sin_nombre': '无名型',
  };
  return map[id] ?? (id === 'other' ? '欧洲株' : id);
}

/** Normalise 台湾 → 台湾省 */
function normaliseCountry(name: string): string {
  if (name === '台湾' || name === '台湾省') return '台湾省';
  return name;
}

/** ArcGIS English country names → Chinese for merge matching */
const ARCGIS_COUNTRY_MAP: Record<string, string> = {
  'FRANCE': '法国', 'SPAIN': '西班牙', 'UNITED STATES': '美国',
  'UNITED KINGDOM': '英国', 'CANADA': '加拿大', 'AUSTRALIA': '澳大利亚',
  'GERMANY': '德国', 'NETHERLANDS': '荷兰', 'BELGIUM': '比利时',
  'SWITZERLAND': '瑞士', 'SOUTH AFRICA': '南非', 'SINGAPORE': '新加坡',
  'TURKEY': '土耳其', 'GREECE': '希腊', 'IRELAND': '爱尔兰',
  'CAPE VERDE': '佛得角', 'ST HELENA': '圣赫勒拿', 'ONBOARD': 'MV Hondius 邮轮',
};

function buildCaseTable(input: BriefDisplayInput): CaseTableRow[] {
  const rows: CaseTableRow[] = [];
  const seen = new Set<string>();

  // 1. Active clusters (outbreak source)
  for (const c of input.recentCases) {
    if (c.source?.confidence === 'official' && c.id.startsWith('who-')) {
      const key = `outbreak-${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Extract counts from summary if present
      const summary = c.summary ?? '';
      const confMatch = summary.match(/(\d+)\s*例\s*确诊/);
      const suspMatch = summary.match(/(\d+)\s*例\s*(?:结果未定|可能|疑似)/);
      const deathMatch = summary.match(/(\d+)\s*例\s*死亡/);
      rows.push({
        date: c.date,
        countryNameZh: 'MV Hondius 邮轮',
        caseType: 'outbreak',
        sourceType: '聚集疫情',
        serotypeLabel: serotypeLabel(c.serotypeId),
        newConfirmed: 0,
        totalConfirmed: confMatch ? parseInt(confMatch[1]) : 0,
        deaths: deathMatch ? parseInt(deathMatch[1]) : 0,
        monitoring: 0,
        sourceName: c.source.name,
      });
    }
  }

  // 2. Import / monitoring entries from importSummaries
  for (const imp of (input.importSummaries ?? [])) {
    const name = imp.countryNameZh ?? '';
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const confMatch = imp.summary_zh.match(/(\d+)\s*例\s*(?:新\s*)?确诊/);
    const deathMatch = imp.summary_zh.match(/(\d+)\s*例\s*死亡/);
    const isImport = imp.summary_zh.includes('确诊输入') || imp.summary_zh.includes('隔离中');
    rows.push({
      date: imp.date,
      countryNameZh: normaliseCountry(name),
      caseType: isImport ? 'import' : 'local',
      sourceType: isImport ? '邮轮输入' : '本地散发',
      serotypeLabel: '安第斯型',
      newConfirmed: confMatch ? parseInt(confMatch[1]) : 0,
      totalConfirmed: confMatch ? parseInt(confMatch[1]) : (isImport ? 1 : 0),
      deaths: deathMatch ? parseInt(deathMatch[1]) : 0,
      monitoring: 0,
      sourceName: isImport ? 'WHO / 各国卫生部' : '官方通报',
    });
  }

  // 3. Non-outbreak recent cases from timeline (local/sporadic)
  for (const c of input.recentCases) {
    if (c.source?.confidence === 'official' && c.id.startsWith('who-')) continue;
    const name = c.title ?? c.notes ?? '';
    if (!name || seen.has(name)) continue;
    const country = c.title?.match(/^(.{2,4})(?:省|市|州|报告|通报|确认|确诊|出现)/)?.[1]
      ?? c.notes?.match(/^(.{2,4})(?:省|市|州)/)?.[1];
    if (!country) continue;
    if (seen.has(country)) continue;
    seen.add(country);
    const isChina = c.scope === 'china';
    const summary = c.summary ?? c.notes ?? '';
    rows.push({
      date: c.date,
      countryNameZh: normaliseCountry(isChina ? '中国' : country),
      caseType: 'local',
      sourceType: '本地散发',
      serotypeLabel: serotypeLabel(c.serotypeId),
      newConfirmed: 1,
      totalConfirmed: 1,
      deaths: summary.includes('死亡') ? 1 : 0,
      monitoring: 0,
      sourceName: c.source?.name ?? '',
    });
  }

  // Merge ArcGIS monitoring data into existing rows
  if (input.arcgisCases?.length) {
    for (const ac of input.arcgisCases) {
      const arcgisCountryZh = ARCGIS_COUNTRY_MAP[ac.country.toUpperCase()] || ac.country;
      const existing = rows.find((r) => {
        const cn = r.countryNameZh;
        return cn === arcgisCountryZh || cn.includes(arcgisCountryZh) || arcgisCountryZh.includes(cn);
      });
      if (existing) {
        existing.monitoring = ac.monitoring;
        if (existing.totalConfirmed === 0 && ac.confirmed > 0) {
          existing.totalConfirmed = ac.confirmed;
        }
      }
      // If no existing row, add a new one from ArcGIS data
      if (!existing && ac.total > 0) {
        rows.push({
          date: '',
          countryNameZh: arcgisCountryZh,
          caseType: 'import',
          sourceType: '邮轮输入',
          serotypeLabel: '安第斯型',
          newConfirmed: ac.confirmed,
          totalConfirmed: ac.confirmed,
          deaths: 0,
          monitoring: ac.monitoring,
          sourceName: 'ArcGIS ANDV Dashboard',
        });
      }
    }
  }

  // Deduplicate by countryNameZh and sort by date desc
  const deduped: CaseTableRow[] = [];
  const dedupKeys = new Set<string>();
  for (const r of rows.sort((a, b) => b.date.localeCompare(a.date))) {
    const k = `${r.countryNameZh}-${r.serotypeLabel}-${r.date}`;
    if (!dedupKeys.has(k)) {
      dedupKeys.add(k);
      deduped.push(r);
    }
  }
  return deduped.slice(0, 8);
}
