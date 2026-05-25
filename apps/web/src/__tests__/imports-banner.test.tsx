import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImportsBanner } from '@/app/countries/page';

vi.mock('@/lib/data', () => ({
  outbreakStatus: [
    {
      id: 'mv-hondius-2026',
      name: 'MV Hondius 邮轮安第斯型聚集疫情',
      serotypeId: 'andes',
      totals: { all: 11, confirmed: 8, deaths: 3, indeterminate: 3, possible: 0 },
      perCountry: [
        {
          iso2: 'GR',
          nameZh: '希腊',
          status: 'monitoring',
          confirmed: 0,
          monitoring: 1,
          quarantine: 0,
          deaths: 0,
          newConfirmedToday: 0,
          asOf: '2026-05-20',
          evidence: [],
        },
        {
          iso2: 'NL',
          nameZh: '荷兰',
          status: 'imports_confirmed',
          confirmed: 2,
          monitoring: 3,
          quarantine: 0,
          deaths: 0,
          newConfirmedToday: 0,
          asOf: '2026-05-25',
          evidence: [],
        },
      ],
      origin: { nameZh: '南美洲海域', lat: 0, lng: 0 },
      lastUpdate: { asOfDate: '2026-05-25', source: { name: 'WHO', url: '', retrievedAt: '', confidence: 'official' as const }, headlineZh: '' },
      provenance: { generatedAt: '', contributors: [] },
    },
  ],
  hondiusImports: [],
  hondiusOutbreakName: 'MV Hondius 邮轮安第斯型聚集疫情',
  countryViews: [],
  countryViewsByContinent: {},
  CONTINENT_LABEL_ZH: {},
  CONTINENT_ORDER: [],
  searchCountries: () => [],
}));

describe('ImportsBanner', () => {
  it('renders Chinese names and metadata without flags', () => {
    const { container } = render(<ImportsBanner />);
    const text = container.textContent ?? '';

    expect(screen.getByText('希腊')).toBeTruthy();
    expect(text).not.toMatch(/\bGR\b/);
    expect(text).toContain('确诊 2');
    expect(text).toContain('监测 3');
    expect(text).toContain('数据截至 5月25日');

    const regionalIndicators = text.match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu);
    expect(regionalIndicators ?? []).toHaveLength(0);
    expect(text).not.toContain('🏳');
  });
});
