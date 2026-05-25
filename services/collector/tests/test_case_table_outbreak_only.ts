/**
 * P1.c regression: buildCaseTable uses outbreakStatus only (no ArcGIS-only rows).
 * Run via: pnpm --filter @hantawatch/web test
 */
import { describe, expect, it } from 'vitest';
import { buildCaseTable, type BriefDisplayInput } from '../../../packages/shared/src/daily-brief-display';

const LEDGER_ISO2: Array<{ iso2: string; nameZh: string }> = [
  { iso2: 'US', nameZh: '美国' },
  { iso2: 'AU', nameZh: '澳大利亚' },
  { iso2: 'ES', nameZh: '西班牙' },
  { iso2: 'FR', nameZh: '法国' },
  { iso2: 'BE', nameZh: '比利时' },
  { iso2: 'CA', nameZh: '加拿大' },
  { iso2: 'DE', nameZh: '德国' },
  { iso2: 'GR', nameZh: '希腊' },
  { iso2: 'IE', nameZh: '爱尔兰' },
  { iso2: 'NL', nameZh: '荷兰' },
  { iso2: 'SG', nameZh: '新加坡' },
  { iso2: 'ZA', nameZh: '南非' },
  { iso2: 'CH', nameZh: '瑞士' },
  { iso2: 'TR', nameZh: '土耳其' },
  { iso2: 'GB', nameZh: '英国' },
];

const baseInput: BriefDisplayInput = {
  briefDate: '2026-05-25',
  oneLine: 'test',
  daysSinceLastIntlAlert: 3,
  domesticBaselineStatus: 'normal',
  recentCases: [],
  realtimeUpdates: [],
  hpiTotal: 24,
  outbreakStatus: [
    {
      id: 'mv-hondius-2026',
      name: 'MV Hondius 邮轮安第斯型聚集疫情',
      serotypeId: 'andes',
      totals: { all: 11, confirmed: 8, deaths: 3, indeterminate: 3 },
      perCountry: LEDGER_ISO2.map((c, i) => ({
        iso2: c.iso2,
        nameZh: c.nameZh,
        confirmed: i === 9 ? 2 : 0,
        monitoring: i === 9 ? 3 : 1,
        deaths: 0,
        status: 'monitoring',
        asOf: '2026-05-25T12:00:00.000Z',
      })),
    },
  ],
  arcgisCases: [
    { country: 'CAPE VERDE', confirmed: 0, monitoring: 1, total: 1 },
    { country: 'ST HELENA', confirmed: 0, monitoring: 2, total: 2 },
    { country: 'NETHERLANDS', confirmed: 2, monitoring: 3, total: 5 },
  ],
  arcgisFetchedAt: '2026-05-25',
};

describe('buildCaseTable outbreak-only source', () => {
  it('excludes ArcGIS-only countries and sorts outbreak first with YYYY-MM-DD dates', () => {
    const rows = buildCaseTable(baseInput);
    const names = rows.map((r) => r.countryNameZh);

    for (const banned of ['佛得角', 'CAPE VERDE', 'ST HELENA', '圣赫勒拿']) {
      expect(names.some((n) => n.includes(banned))).toBe(false);
    }

    expect(rows[0]?.caseType).toBe('outbreak');

    for (const r of rows) {
      expect(r.date.length).toBe(10);
    }
  });
});
