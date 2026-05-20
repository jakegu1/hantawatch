/**
 * P1.5 — Three feed layers: what each section means and how fresh it should be.
 */

export interface FeedDefinition {
  id: 'daily-brief' | 'recent-cases' | 'realtime';
  titleZh: string;
  meaningZh: string;
  freshnessTargetZh: string;
  trustLevelZh: string;
}

export const FEED_DEFINITIONS: readonly FeedDefinition[] = [
  {
    id: 'daily-brief',
    titleZh: '每日简报',
    meaningZh: '面向中国用户的当日结论：24 小时事实 + 风险判断 + 结构指标（HPI/距离/基线）。',
    freshnessTargetZh: '当日或每 6 小时（全量采集）更新；线索部分可随每小时轻量采集刷新。',
    trustLevelZh: '结论层 — 综合官方通报、输入监测与待核实线索，克制表述。',
  },
  {
    id: 'recent-cases',
    titleZh: '最新通报',
    meaningZh: '可溯源的权威与准权威记录（WHO/ECDC、国内通报、专业监测、合规新闻线索）。',
    freshnessTargetZh: '官方：天级；监测/线索：小时级（轻量采集）。默认按日期倒序展示。',
    trustLevelZh: '证据层 — 每条标注来源可信度，优先蓝色「官方通报」。',
  },
  {
    id: 'realtime',
    titleZh: '实时动态',
    meaningZh: '境外媒体与监测源的早期线索墙，经 AI 译为中文摘要，可能尚未获官方确认。',
    freshnessTargetZh: '分钟～小时级；请以「最新通报」中的官方记录为准。',
    trustLevelZh: '线索层 — 仅供跟踪苗头，不作确诊依据。',
  },
] as const;

export function getFeedDefinition(id: FeedDefinition['id']): FeedDefinition {
  return FEED_DEFINITIONS.find((f) => f.id === id) ?? FEED_DEFINITIONS[0];
}
