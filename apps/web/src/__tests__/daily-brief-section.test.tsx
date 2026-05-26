import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DailyBriefSection } from '@/components/daily-brief-section';
import type { BriefSectionContent } from '@hantawatch/shared/daily-brief-display';

function minimalContent(
  caseTableSummary: BriefSectionContent['caseTableSummary'],
): BriefSectionContent {
  return {
    metrics: {
      headline24h: '测试',
      alertLabel: '距上次 WHO 官方更新 13 天',
      whoDaysSinceOfficialUpdate: 13,
      cluesLast24h: 0,
      monitoringLeads: [],
    },
    briefHeadline24h: '测试',
    briefTakeaway: '',
    briefLatestChange: '',
    briefNewCases: '',
    briefSituation: '',
    briefRiskJudgment: '',
    briefShareLine: 'MV Hondius 邮轮汉坦疫情累计 11 例。',
    domesticBaselineText: '正常',
    structuralMetricsLine: '',
    officialExcerpt: '',
    userActionHint: '',
    briefSourceSummary: '',
    briefWatchFocus: [],
    briefFocusSentence: '',
    caseTable: [],
    caseTableSummary,
  };
}

describe('DailyBriefSection', () => {
  it('andes summary label matches shareline total', () => {
    const { container } = render(
      <DailyBriefSection
        briefDate="2026-05-26"
        hpiTotal={24}
        hpiGradeZh="一般关注"
        hpiColor="#0891b2"
        content={minimalContent({
          totalAll: 11,
          totalConfirmed: 8,
          totalMonitoring: 91,
          totalDeaths: 3,
        })}
        highRiskDistanceText="8,400 km"
        highRiskDistanceContext=""
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('11');
    expect(text).toContain('安第斯累计');
    expect(text).not.toContain('安第斯确诊 8');
    expect(screen.getByText(/安第斯累计 11/)).toBeTruthy();
  });
});
