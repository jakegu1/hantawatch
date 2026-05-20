/**
 * Shared timeline utilities for Web + MiniApp.
 * Keep display ordering / grouping logic here — do not fork per platform.
 */

export interface TimelineCaseSource {
  name: string;
  url: string;
  retrievedAt: string;
  confidence: string;
}

export interface TimelineCase {
  id: string;
  date: string;
  serotypeId: string;
  title?: string;
  notes?: string;
  summary?: string;
  scope: 'china' | 'international';
  source: TimelineCaseSource;
}

export const MV_HONDIUS_GROUP_KEY = 'mv-hondius-outbreak';

export function getCaseDisplayTitle(c: TimelineCase): string {
  return (c.title ?? c.notes ?? '').trim();
}

export function isLowInformationTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return (
    lower.includes('frequently asked questions') ||
    lower.includes('faq') ||
    lower.includes('what to know') ||
    title.includes('是什么') ||
    title.includes('什么是')
  );
}

/** Lower = higher trust (used only when trust-first sort is requested). */
export function recentCaseTier(c: TimelineCase): number {
  const name = c.source?.name ?? '';
  const conf = c.source?.confidence;
  if (name.includes('WHO') || name.includes('DON')) return 0;
  if (conf === 'official') return 1;
  if (conf === 'surveillance') return 2;
  if (conf === 'news') return 3;
  return 4;
}

/** Default homepage timeline order — newest first. */
export function sortRecentCasesByDate<T extends TimelineCase>(cases: T[]): T[] {
  return [...cases].sort((a, b) => b.date.localeCompare(a.date));
}

/** Legacy trust-first order (e.g. "仅官方" filter secondary sort). */
export function sortRecentCasesByTrustThenDate<T extends TimelineCase>(cases: T[]): T[] {
  return [...cases].sort((a, b) => {
    const tierDiff = recentCaseTier(a) - recentCaseTier(b);
    if (tierDiff !== 0) return tierDiff;
    return b.date.localeCompare(a.date);
  });
}

export function filterOfficialTimelineCases<T extends TimelineCase>(cases: T[]): T[] {
  return cases.filter((c) => {
    const conf = c.source?.confidence;
    return conf === 'official' || c.id.startsWith('manual-') || c.scope === 'china';
  });
}

export function getTimelineEventGroupId(c: TimelineCase): string | null {
  if (c.id.startsWith('who-2026-don')) return MV_HONDIUS_GROUP_KEY;
  const title = getCaseDisplayTitle(c);
  if (
    c.serotypeId === 'andes' &&
    (/mv\s*hondius|hondius|邮轮/i.test(title) || title.includes('邮轮'))
  ) {
    return MV_HONDIUS_GROUP_KEY;
  }
  return null;
}

export type TimelineRow =
  | { kind: 'single'; case: TimelineCase }
  | {
      kind: 'group';
      groupId: string;
      title: string;
      latestDate: string;
      cases: TimelineCase[];
      latestSummary?: string;
    };

/**
 * Collapse multiple WHO DON rows for the same outbreak into one grouped row.
 */
export function buildTimelineRows(cases: TimelineCase[]): TimelineRow[] {
  const sorted = sortRecentCasesByDate(cases);
  const groupCases: TimelineCase[] = [];
  const singles: TimelineCase[] = [];

  for (const c of sorted) {
    const gid = getTimelineEventGroupId(c);
    if (gid === MV_HONDIUS_GROUP_KEY && c.id.startsWith('who-') && c.source.confidence === 'official') {
      groupCases.push(c);
    } else {
      singles.push(c);
    }
  }

  const rows: TimelineRow[] = singles.map((c) => ({ kind: 'single', case: c }));

  if (groupCases.length >= 2) {
    const ordered = sortRecentCasesByDate(groupCases);
    const latest = ordered[0];
    rows.push({
      kind: 'group',
      groupId: MV_HONDIUS_GROUP_KEY,
      title: getCaseDisplayTitle(latest) || 'MV Hondius 邮轮安第斯型聚集疫情',
      latestDate: latest.date,
      cases: ordered,
      latestSummary: latest.summary,
    });
  } else if (groupCases.length === 1) {
    rows.push({ kind: 'single', case: groupCases[0] });
  }

  return rows.sort((a, b) => {
    const dateA = a.kind === 'group' ? a.latestDate : a.case.date;
    const dateB = b.kind === 'group' ? b.latestDate : b.case.date;
    return dateB.localeCompare(dateA);
  });
}

export interface RealtimeSignalInput {
  id: string;
  time: string;
  summary_zh: string;
  key_facts_zh?: string[];
  signal_strength?: string;
}

export interface MonitoringLead {
  id: string;
  time: string;
  summary_zh: string;
  key_facts_zh: string[];
}

const MONITORING_KEYWORDS =
  /andes|安第斯|hondius|邮轮|汉坦|hantavirus|加拿大|推定|初筛|presumptive|输入|病例/i;

/** High-signal realtime rows promoted above the authoritative timeline. */
export function pickMonitoringLeads(
  updates: RealtimeSignalInput[],
  briefDate: string,
  max = 2,
): MonitoringLead[] {
  const dayStart = new Date(`${briefDate}T00:00:00+08:00`).getTime();
  const windowStart = dayStart - 48 * 3600_000;

  return updates
    .filter((u) => {
      const t = new Date(u.time).getTime();
      if (Number.isNaN(t) || t < windowStart) return false;
      if (u.signal_strength === 'high') return true;
      return MONITORING_KEYWORDS.test(u.summary_zh);
    })
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, max)
    .map((u) => ({
      id: u.id,
      time: u.time,
      summary_zh: u.summary_zh,
      key_facts_zh: u.key_facts_zh ?? [],
    }));
}
