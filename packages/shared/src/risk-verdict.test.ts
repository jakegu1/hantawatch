import { describe, expect, it } from 'vitest';
import { deriveRiskVerdict, type RiskVerdictInput } from './risk-verdict';

const base: RiskVerdictInput = {
  stateCode: 'calm',
  domesticBaselineStatus: 'normal',
  displayedDistanceKm: 8400,
  communityTransmissionCount: 0,
  nearestImport: null,
  sourceDistanceKm: 16500,
};

describe('deriveRiskVerdict', () => {
  it('calm + normal domestic → reassuring green copy with source distance', () => {
    const v = deriveRiskVerdict({ ...base, stateCode: 'calm' });
    expect(v.level).toBe('calm');
    expect(v.titleZh).toContain('无需');
    expect(v.detailZh).toContain('16,500');
    expect(v.detailZh).toContain('无输入或社区传播');
  });

  it('remote_watch → blue-tier copy', () => {
    const v = deriveRiskVerdict({ ...base, stateCode: 'remote_watch' });
    expect(v.level).toBe('remote');
    expect(v.titleZh).toBe('远处有事，近处平静');
    expect(v.detailZh).toContain('16,500');
  });

  it('near_watch → amber copy with nearest import', () => {
    const v = deriveRiskVerdict({
      ...base,
      stateCode: 'near_watch',
      displayedDistanceKm: 8400,
      nearestImport: { nameZh: '法国', distanceKm: 8400, cityZh: '巴黎' },
    });
    expect(v.level).toBe('near');
    expect(v.titleZh).toContain('较近的输入监测');
    expect(v.detailZh).toContain('法国 巴黎');
    expect(v.detailZh).toContain('8,400');
  });

  it('domestic_alert → domestic copy without medical advice', () => {
    const v = deriveRiskVerdict({
      ...base,
      stateCode: 'domestic_alert',
      domesticBaselineStatus: 'elevated',
    });
    expect(v.level).toBe('domestic');
    expect(v.titleZh).toContain('HFRS');
    expect(v.detailZh).toContain('官方通报');
    expect(v.detailZh).not.toMatch(/用药|就医|必须/);
  });

  it('elevated domestic baseline maps to domestic even if state is calm', () => {
    const v = deriveRiskVerdict({
      ...base,
      stateCode: 'calm',
      domesticBaselineStatus: 'elevated',
    });
    expect(v.level).toBe('domestic');
  });

  it('missing state code → pending fallback (no false reassurance)', () => {
    const v = deriveRiskVerdict({
      ...base,
      stateCode: null,
    });
    expect(v.level).toBe('pending');
    expect(v.titleZh).not.toMatch(/安全|无需担心|放心/);
    expect(v.detailZh).toContain('实时态势');
  });

  it('resolved → states the no-new-case streak as a fact, not an "outbreak over" claim', () => {
    const v = deriveRiskVerdict({
      ...base,
      stateCode: 'resolved',
      daysWithoutNewConfirmed: 56,
      whoDaysAgo: 56,
      whoLastUpdateZh: '7/2',
    });
    expect(v.level).toBe('resolved');
    expect(v.titleZh).toContain('56 天');
    expect(v.titleZh).toContain('没有新增确诊');
    // We never declare an outbreak finished — that is WHO's call, not ours.
    expect(v.titleZh).not.toMatch(/疫情结束|已结束|完全安全/);
    expect(v.detailZh).toContain('WHO 最近一次通报在 56 天前（7/2）');
    expect(v.detailZh).toContain('16,500');
  });

  it('resolved without a streak number → no fabricated count', () => {
    const v = deriveRiskVerdict({ ...base, stateCode: 'resolved' });
    expect(v.level).toBe('resolved');
    expect(v.titleZh).not.toMatch(/\d/);
    // WHO clause is omitted entirely rather than rendered with a placeholder.
    expect(v.detailZh).not.toContain('WHO');
  });

  it('elevated domestic baseline still overrides resolved', () => {
    const v = deriveRiskVerdict({
      ...base,
      stateCode: 'resolved',
      domesticBaselineStatus: 'elevated',
      daysWithoutNewConfirmed: 56,
    });
    expect(v.level).toBe('domestic');
  });

  it('missing distance → em dash in copy without throwing', () => {
    const v = deriveRiskVerdict({
      ...base,
      sourceDistanceKm: null,
      displayedDistanceKm: undefined,
    });
    expect(v.detailZh).toContain('—');
  });
});
