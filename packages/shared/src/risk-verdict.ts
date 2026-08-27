/**
 * Hero reassurance verdict — translates existing realtime-situation state into
 * plain-language copy. Does NOT compute risk; reads the same state code as
 * RealtimeSituationSection (`liveSituation.state.code`).
 */

export type RiskVerdictStateCode =
  | 'calm'
  | 'resolved'
  | 'remote_watch'
  | 'near_watch'
  | 'domestic_alert';

export type DomesticBaselineStatus = 'normal' | 'elevated' | 'below';

export type RiskVerdictLevel =
  | 'calm'
  | 'resolved'
  | 'remote'
  | 'near'
  | 'domestic'
  | 'pending';

export interface RiskVerdictNearestImport {
  nameZh: string;
  distanceKm: number;
  cityZh?: string;
}

/** Machine-verifiable input — all fields sourced from liveSituation + snapshot. */
export interface RiskVerdictInput {
  /** From liveSituation.state.code — sole risk state source. */
  stateCode: RiskVerdictStateCode | string | null | undefined;
  /** From daily brief / risk snapshot domestic baseline. */
  domesticBaselineStatus: DomesticBaselineStatus | string | null | undefined;
  /** Hero displayed distance (import-aware). */
  displayedDistanceKm: number | null | undefined;
  /** Mainland community transmission count (homepage shows 0 today). */
  communityTransmissionCount: number | null | undefined;
  nearestImport: RiskVerdictNearestImport | null | undefined;
  /** Outbreak source cluster distance — used for calm/remote copy. */
  sourceDistanceKm?: number | null | undefined;
  /**
   * From liveSituation.daysWithoutNewConfirmed — days since the last new
   * confirmed case anywhere in the tracked outbreak. Drives the `resolved`
   * copy, which states this streak as a fact rather than declaring an
   * outbreak "over" (that call belongs to WHO, not to us).
   */
  daysWithoutNewConfirmed?: number | null | undefined;
  /** From liveSituation.headline.whoDaysAgo — age of the last WHO update. */
  whoDaysAgo?: number | null | undefined;
  /** From liveSituation.headline.whoLastUpdateZh — e.g. "7/2". */
  whoLastUpdateZh?: string | null | undefined;
}

export interface RiskVerdict {
  level: RiskVerdictLevel;
  titleZh: string;
  detailZh: string;
}

function fmtKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '—';
  return Math.round(km).toLocaleString('zh-CN');
}

function importLabel(imp: RiskVerdictNearestImport): string {
  return imp.cityZh ? `${imp.nameZh} ${imp.cityZh}` : imp.nameZh;
}

function communityPhrase(count: number | null | undefined, short = false): string {
  if (count == null || count <= 0) {
    return short
      ? '中国大陆无社区传播报告'
      : '中国大陆无输入或社区传播报告';
  }
  return `中国大陆社区传播 ${count} 例（请以官方通报为准）`;
}

function resolveLevel(input: RiskVerdictInput): RiskVerdictLevel {
  const code = input.stateCode;
  const domestic = input.domesticBaselineStatus;

  if (code === 'domestic_alert' || domestic === 'elevated') {
    return 'domestic';
  }
  if (code === 'near_watch') return 'near';
  if (code === 'resolved') return 'resolved';
  if (code === 'remote_watch') return 'remote';
  if (code === 'calm' && domestic !== 'elevated') return 'calm';
  if (!code) return 'pending';
  return 'pending';
}

/** "WHO 最近一次通报在 56 天前（7/2）" — omitted entirely when unknown. */
function whoClause(input: RiskVerdictInput): string {
  const days = input.whoDaysAgo;
  if (days == null || !Number.isFinite(days)) return '';
  const stamp = input.whoLastUpdateZh ? `（${input.whoLastUpdateZh}）` : '';
  return `WHO 最近一次通报在 ${Math.round(days)} 天前${stamp}；`;
}

/** Pure mapper: existing fields → human verdict copy. */
export function deriveRiskVerdict(input: RiskVerdictInput): RiskVerdict {
  const level = resolveLevel(input);
  const community = communityPhrase(input.communityTransmissionCount);
  const sourceKm = input.sourceDistanceKm ?? input.displayedDistanceKm;
  const displayKm = input.displayedDistanceKm ?? sourceKm;

  if (level === 'pending') {
    return {
      level,
      titleZh: '实时态势加载中',
      detailZh: '请查看下方实时态势卡获取最新状态，勿自行推断风险。',
    };
  }

  if (level === 'domestic') {
    const domestic = input.domesticBaselineStatus;
    const detail =
      domestic === 'elevated'
        ? '国内 HFRS 报告数高于近年基线，请以官方通报为准；本页同时展示海外 Andes 输入监测。'
        : '国内监测信号需关注，请以官方通报为准；本页同时展示海外 Andes 输入监测。';
    return {
      level,
      titleZh: '国内 HFRS 高于基线，建议关注',
      detailZh: detail,
    };
  }

  if (level === 'near') {
    const imp = input.nearestImport;
    const loc = imp ? importLabel(imp) : '较近地区';
    const km = imp?.distanceKm ?? displayKm;
    return {
      level,
      titleZh: '出现较近的输入监测，仍无社区传播',
      detailZh: `最近输入监测在 ${loc}（约 ${fmtKm(km)} km）；${communityPhrase(input.communityTransmissionCount, true)}`,
    };
  }

  if (level === 'resolved') {
    // Deliberately states the *streak* (a fact we can source) instead of
    // declaring the outbreak over — that declaration is WHO's to make.
    const days = input.daysWithoutNewConfirmed;
    const streak =
      days != null && Number.isFinite(days)
        ? `已经 ${Math.round(days)} 天没有新增确诊`
        : '这波疫情已经很久没有新增确诊';
    return {
      level,
      titleZh: streak,
      detailZh: `${whoClause(input)}${community}。距离仍在约 ${fmtKm(sourceKm)} km 外。`,
    };
  }

  if (level === 'remote') {
    return {
      level,
      titleZh: '远处有事，近处平静',
      detailZh: `重点疫情距中国大陆约 ${fmtKm(sourceKm)} km；${community}`,
    };
  }

  // calm
  return {
    level: 'calm',
    titleZh: '当前无需为安第斯型汉坦病毒担心',
    detailZh: `${community}；最近相关疫情在约 ${fmtKm(sourceKm)} km 外`,
  };
}
