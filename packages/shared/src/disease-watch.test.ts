import { describe, expect, it } from 'vitest';
import {
  deriveDiseaseVerdict,
  matchDisease,
  sortDiseaseRows,
  type DiseaseWatchRow,
} from './disease-watch';

function row(over: Partial<DiseaseWatchRow> = {}): DiseaseWatchRow {
  return {
    id: 'dengue',
    nameZh: '登革热',
    aliasesZh: ['登革', '骨痛热'],
    blurbZh: '蚊媒传染病，不人传人。',
    level: 'active',
    latest: {
      titleEn: 'Dengue – Iran (Islamic Republic of)',
      url: 'https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON999',
      asOf: '2026-07-02',
      daysAgo: 12,
    },
    countInWindow: 1,
    countScanned: 3,
    chinaTitledInWindow: 0,
    donScopeNoteZh: '登革热在很多国家常年流行，WHO 只在异常暴发时通报。',
    officialRefs: [{ nameZh: '国家疾病预防控制局', url: 'https://www.ndcpa.gov.cn/' }],
    ...over,
  };
}

describe('deriveDiseaseVerdict', () => {
  it('recent notice, no China in any title → calm green', () => {
    const v = deriveDiseaseVerdict(row(), 90);
    expect(v.level).toBe('overseas');
    expect(v.tone).toBe('calm');
    expect(v.icon).toBe('🟢');
    expect(v.headlineZh).toContain('不在中国大陆');
    expect(v.detailZh).toContain('过去 90 天');
  });

  it('recent notice naming China → amber, and never claims cases exist', () => {
    const v = deriveDiseaseVerdict(row({ chinaTitledInWindow: 2, countInWindow: 5 }), 90);
    expect(v.level).toBe('china_mentioned');
    expect(v.icon).toBe('🟡');
    expect(v.detailZh).toContain('5 条');
    expect(v.detailZh).toContain('2 条');
    // The claim is about WHO's corpus, not about reality.
    expect(v.detailZh).toContain('标题涉及中国大陆');
    expect(v.detailZh).not.toMatch(/中国(大陆)?(已|有)\d+例/);
  });

  it('old notice → neutral, states when it was', () => {
    const v = deriveDiseaseVerdict(
      row({ level: 'quiet', countInWindow: 0, latest: { ...row().latest!, daysAgo: 766 } }),
      90,
    );
    expect(v.level).toBe('dormant');
    expect(v.icon).toBe('⚪');
    expect(v.headlineZh).toContain('上一次通报');
    expect(v.detailZh).toContain('2026年7月2日');
  });

  it('no record ever → says so, and explains what silence means', () => {
    const v = deriveDiseaseVerdict(
      row({ id: 'norovirus', level: 'none', latest: null, countInWindow: 0, countScanned: 0 }),
      90,
    );
    expect(v.level).toBe('no_record');
    expect(v.headlineZh).toBe('WHO 疫情通报里没有它');
    // Silence must never be presented as "there is no disease".
    expect(v.detailZh).toBe(row().donScopeNoteZh);
    expect(v.headlineZh).not.toMatch(/安全|没有病例|无风险/);
  });

  it('a null latest overrides a stale level field', () => {
    const v = deriveDiseaseVerdict(row({ level: 'active', latest: null }), 90);
    expect(v.level).toBe('no_record');
  });

  it('renders day distances in human units', () => {
    const at = (daysAgo: number) =>
      deriveDiseaseVerdict(
        row({ level: 'quiet', latest: { ...row().latest!, daysAgo } }),
        90,
      ).headlineZh;
    expect(at(0)).toContain('今天');
    expect(at(1)).toContain('昨天');
    expect(at(45)).toContain('45 天前');
    expect(at(139)).toContain('5 个月前');
    expect(at(766)).toContain('2 年多以前');
  });
});

describe('sortDiseaseRows', () => {
  it('China-related first, then recent, then dormant, then never-reported', () => {
    const rows = [
      row({ id: 'norovirus', level: 'none', latest: null }),
      row({ id: 'influenza', level: 'quiet', latest: { ...row().latest!, daysAgo: 139 } }),
      row({ id: 'ebola', level: 'active', latest: { ...row().latest!, daysAgo: 13 } }),
      row({ id: 'flu-cn', level: 'active', chinaTitledInWindow: 1 }),
    ];
    expect(sortDiseaseRows(rows).map((r) => r.id)).toEqual([
      'flu-cn',
      'ebola',
      'influenza',
      'norovirus',
    ]);
  });

  it('does not mutate the input', () => {
    const rows = [row({ id: 'a', level: 'none', latest: null }), row({ id: 'b' })];
    sortDiseaseRows(rows);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('matchDisease', () => {
  const rows = [
    row({ id: 'norovirus', nameZh: '诺如病毒', aliasesZh: ['诺如', '冬季呕吐病'] }),
    row({ id: 'influenza', nameZh: '流感', aliasesZh: ['甲流', 'H5N1'] }),
  ];

  it('matches the display name, an alias, or the id', () => {
    expect(matchDisease(rows, '诺如').map((r) => r.id)).toEqual(['norovirus']);
    expect(matchDisease(rows, '甲流').map((r) => r.id)).toEqual(['influenza']);
    expect(matchDisease(rows, 'h5n1').map((r) => r.id)).toEqual(['influenza']);
    expect(matchDisease(rows, 'influ').map((r) => r.id)).toEqual(['influenza']);
  });

  it('empty query returns everything, unknown query returns nothing', () => {
    expect(matchDisease(rows, '   ')).toHaveLength(2);
    expect(matchDisease(rows, '狂犬')).toHaveLength(0);
  });
});
