/**
 * MV Hondius outbreak event page — shared data shaping for Web + MiniApp.
 */

import { MV_HONDIUS_GROUP_KEY, sortRecentCasesByDate, type TimelineCase } from './timeline';

export const MV_HONDIUS_EVENT_ID = 'mv-hondius-2026';
export const MV_HONDIUS_EVENT_PATH = '/events/mv-hondius-2026';

export interface OutbreakClusterInput {
  id: string;
  name: string;
  serotypeId: string;
  location?: { name?: string };
  distanceFromChinaKm: number;
  confirmedCases: number;
  suspectedCases: number;
  deaths: number;
  humanToHuman: boolean;
  whoRiskLevel?: string;
  lastUpdate: string;
}

export interface WhoTimelineEntry {
  id: string;
  date: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
}

export interface ImportTableRow {
  iso2: string;
  date: string;
  statusZh: string;
  confirmedImports: number;
  monitoringCount?: number;
  quarantineCount?: number;
  deaths: number;
  summary_zh: string;
  sourceName: string;
}

const STATUS_ZH: Record<string, string> = {
  monitoring: '接触者监测',
  quarantine_active: '隔离观察',
  imports_confirmed: '确诊输入',
  closed: '已结案',
};

export function filterMvHondiusWhoCases(cases: TimelineCase[]): TimelineCase[] {
  return cases.filter(
    (c) => c.id.startsWith('who-2026-don') || (c.serotypeId === 'andes' && /hondius|邮轮/i.test(c.title ?? c.notes ?? '')),
  );
}

export function buildWhoTimeline(cases: TimelineCase[]): WhoTimelineEntry[] {
  return sortRecentCasesByDate(filterMvHondiusWhoCases(cases)).map((c) => ({
    id: c.id,
    date: c.date,
    title: c.title ?? c.notes ?? 'WHO 更新',
    summary: c.summary ?? '',
    sourceName: c.source.name,
    sourceUrl: c.source.url,
  }));
}

export function buildImportTable(
  imports: Array<{
    iso2: string;
    date: string;
    status: string;
    confirmedImports?: number;
    monitoringCount?: number;
    quarantineCount?: number;
    deaths?: number;
    summary_zh: string;
    source: { name: string };
  }>,
): ImportTableRow[] {
  return [...imports]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((imp) => ({
      iso2: imp.iso2,
      date: imp.date,
      statusZh: STATUS_ZH[imp.status] ?? imp.status,
      confirmedImports: imp.confirmedImports ?? 0,
      monitoringCount: imp.monitoringCount,
      quarantineCount: imp.quarantineCount,
      deaths: imp.deaths ?? 0,
      summary_zh: imp.summary_zh,
      sourceName: imp.source.name,
    }));
}

export interface OutbreakSummaryStats {
  confirmedCases: number;
  suspectedCases: number;
  deaths: number;
  lastOfficialUpdate: string;
  distanceFromChinaKm: number;
  whoUpdates: number;
  countriesTracked: number;
}

export function buildOutbreakSummary(
  cluster: OutbreakClusterInput | undefined,
  whoTimeline: WhoTimelineEntry[],
  importRows: ImportTableRow[],
): OutbreakSummaryStats {
  return {
    confirmedCases: cluster?.confirmedCases ?? 0,
    suspectedCases: cluster?.suspectedCases ?? 0,
    deaths: cluster?.deaths ?? 0,
    lastOfficialUpdate: cluster?.lastUpdate ?? whoTimeline[0]?.date ?? '—',
    distanceFromChinaKm: cluster?.distanceFromChinaKm ?? 0,
    whoUpdates: whoTimeline.length,
    countriesTracked: importRows.length,
  };
}

export { MV_HONDIUS_GROUP_KEY };
