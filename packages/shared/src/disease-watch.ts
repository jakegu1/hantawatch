/**
 * 传言体温计 — turns one row of `disease-watch.json` into the sentence a
 * worried reader needs.
 *
 * The collector (services/collector/hantawatch_collector/disease_watch.py)
 * answers one narrow, verifiable question per disease: when did WHO last
 * publish a Disease Outbreak News about it. This module does the wording and
 * nothing else — no thresholds are re-derived here, no risk is computed.
 *
 * Two rules shape every string below:
 *   - Absence of a WHO notice is not absence of disease. WHO publishes a DON
 *     for *unusual* events, so silence about seasonal influenza or norovirus
 *     is the normal state, and the copy has to say so rather than implying
 *     "all clear".
 *   - Claims are scoped to the corpus we actually read. We say "WHO 疫情通报里
 *     没有涉及中国大陆的条目", never "中国没有病例".
 */

/** Raw shape of one entry in `disease-watch.json#diseases[]`. */
export interface DiseaseWatchLatest {
  /** Verbatim WHO headline, English, always displayed with its link. */
  titleEn: string;
  url: string;
  /** YYYY-MM-DD */
  asOf: string;
  daysAgo: number;
}

export interface DiseaseWatchOfficialRef {
  nameZh: string;
  url: string;
}

export interface DiseaseWatchRow {
  id: string;
  nameZh: string;
  aliasesZh: string[];
  blurbZh: string;
  /** Collector classification: has a recent notice / an old one / none ever. */
  level: 'active' | 'quiet' | 'none' | string;
  latest: DiseaseWatchLatest | null;
  countInWindow: number;
  countScanned: number;
  /** DON entries in the window whose *title* names China. */
  chinaTitledInWindow: number;
  donScopeNoteZh: string;
  officialRefs: DiseaseWatchOfficialRef[];
}

export interface DiseaseWatchFile {
  asOf: string;
  sourceName: string;
  sourceUrl: string;
  windowDays: number;
  scannedEntries: number;
  oldestScanned: string | null;
  diseases: DiseaseWatchRow[];
}

/**
 * Display tier. Four states, because "WHO never published one" and "WHO
 * published one two years ago" are genuinely different answers to a rumour,
 * even though both mean "nothing is happening right now".
 */
export type DiseaseVerdictLevel =
  | 'no_record'
  | 'dormant'
  | 'overseas'
  | 'china_mentioned';

export type DiseaseVerdictTone = 'neutral' | 'calm' | 'watch';

export interface DiseaseVerdict {
  level: DiseaseVerdictLevel;
  tone: DiseaseVerdictTone;
  /** ⚪ / 🟢 / 🟡 — same vocabulary as the outbreak state card. */
  icon: string;
  /** One line, the answer itself. */
  headlineZh: string;
  /** One line of supporting fact — always sourced or explicitly scoped. */
  detailZh: string;
}

function fmtDays(days: number): string {
  if (!Number.isFinite(days)) return '—';
  const d = Math.max(0, Math.round(days));
  if (d === 0) return '今天';
  if (d === 1) return '昨天';
  if (d < 60) return `${d} 天前`;
  if (d < 730) return `${Math.round(d / 30)} 个月前`;
  return `${Math.floor(d / 365)} 年多以前`;
}

/** "2026-07-02" → "2026年7月2日"; falls back to the raw string. */
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return iso ?? '';
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

function resolveLevel(row: DiseaseWatchRow): DiseaseVerdictLevel {
  if (!row.latest || row.level === 'none') return 'no_record';
  if (row.level !== 'active') return 'dormant';
  return row.chinaTitledInWindow > 0 ? 'china_mentioned' : 'overseas';
}

const TONE: Record<DiseaseVerdictLevel, { tone: DiseaseVerdictTone; icon: string }> = {
  no_record: { tone: 'neutral', icon: '⚪' },
  dormant: { tone: 'neutral', icon: '⚪' },
  overseas: { tone: 'calm', icon: '🟢' },
  china_mentioned: { tone: 'watch', icon: '🟡' },
};

/** Pure mapper: one collector row + the file's window → display copy. */
export function deriveDiseaseVerdict(
  row: DiseaseWatchRow,
  windowDays: number,
): DiseaseVerdict {
  const level = resolveLevel(row);
  const { tone, icon } = TONE[level];
  const win = Number.isFinite(windowDays) ? Math.round(windowDays) : 90;

  if (level === 'no_record') {
    return {
      level,
      tone,
      icon,
      headlineZh: 'WHO 疫情通报里没有它',
      detailZh: row.donScopeNoteZh,
    };
  }

  const latest = row.latest as DiseaseWatchLatest;

  if (level === 'dormant') {
    return {
      level,
      tone,
      icon,
      headlineZh: `WHO 上一次通报是 ${fmtDays(latest.daysAgo)}`,
      detailZh: `最近一条：${fmtDate(latest.asOf)}。过去 ${win} 天没有新的。`,
    };
  }

  if (level === 'china_mentioned') {
    return {
      level,
      tone,
      icon,
      headlineZh: `${fmtDays(latest.daysAgo)}有 WHO 通报，其中涉及中国大陆`,
      detailZh: `过去 ${win} 天 WHO 发布 ${row.countInWindow} 条，其中 ${row.chinaTitledInWindow} 条标题涉及中国大陆。请以官方通报为准。`,
    };
  }

  return {
    level,
    tone,
    icon,
    headlineZh: `${fmtDays(latest.daysAgo)}有 WHO 通报，不在中国大陆`,
    detailZh: `过去 ${win} 天 WHO 发布 ${row.countInWindow} 条，标题都不涉及中国大陆。`,
  };
}

/**
 * Rows most worth a reader's attention first: anything naming China, then
 * anything recent, then everything else by how long it has been quiet.
 * Stable for equal keys, so the registry order shows through.
 */
export function sortDiseaseRows(rows: DiseaseWatchRow[]): DiseaseWatchRow[] {
  const rank = (r: DiseaseWatchRow): number => {
    const level = resolveLevel(r);
    if (level === 'china_mentioned') return 0;
    if (level === 'overseas') return 1;
    if (level === 'dormant') return 2;
    return 3;
  };
  return [...rows].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return (a.latest?.daysAgo ?? Number.MAX_SAFE_INTEGER) - (b.latest?.daysAgo ?? Number.MAX_SAFE_INTEGER);
  });
}

/** Free-text match over name + aliases, for a "我看到的是这个吗" search box. */
export function matchDisease(rows: DiseaseWatchRow[], query: string): DiseaseWatchRow[] {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    if (r.nameZh.toLowerCase().includes(q)) return true;
    if (r.id.toLowerCase().includes(q)) return true;
    return r.aliasesZh.some((a) => a.toLowerCase().includes(q));
  });
}
