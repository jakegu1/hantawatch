import { describe, expect, it } from 'vitest';
import { readFileProvenance } from './data-provenance';

describe('readFileProvenance', () => {
  it('reads the nested provenance block', () => {
    const p = readFileProvenance({
      provenance: {
        sourceName: '国家疾控局 全国法定传染病疫情概况',
        sourceUrl: 'https://www.ndcpa.gov.cn/jbkzzx/yqxxxw/example.html',
        asOf: '2026-05-31',
      },
    });
    expect(p.isSourced).toBe(true);
    expect(p.sourceUrl).toContain('ndcpa.gov.cn');
    expect(p.asOf).toBe('2026-05-31');
    expect(p.sourceName).toContain('国家疾控局');
  });

  it('reads the flat source + asOf shape', () => {
    const p = readFileProvenance({
      source: { name: 'WHO DON', url: 'https://www.who.int/emergencies/x' },
      asOf: '2026-07-02T00:00:00Z',
    });
    expect(p.isSourced).toBe(true);
    expect(p.sourceName).toBe('WHO DON');
  });

  it('a URL without a date is not sourced', () => {
    const p = readFileProvenance({ source: { url: 'https://example.gov.cn/a' } });
    expect(p.isSourced).toBe(false);
    expect(p.sourceUrl).toContain('example.gov.cn');
    expect(p.asOf).toBeNull();
  });

  it('a date without a URL is not sourced', () => {
    const p = readFileProvenance({ asOf: '2026-05-31' });
    expect(p.isSourced).toBe(false);
  });

  it('rejects non-http URLs and malformed dates', () => {
    expect(readFileProvenance({ source: { url: 'ftp://x/y' }, asOf: '2026-05-31' }).isSourced).toBe(false);
    expect(readFileProvenance({ source: { url: 'https://x.cn/y' }, asOf: '2026/05/31' }).isSourced).toBe(false);
    expect(readFileProvenance({ source: { url: 'https://x.cn/y' }, asOf: '待补充' }).isSourced).toBe(false);
  });

  it('treats an editor note as no provenance at all', () => {
    // china-baseline.json as it shipped: hand-transcribed, no URL, only a
    // lastEditedAt. `lastEditedAt` must NOT be mistaken for `asOf`.
    const p = readFileProvenance({
      __manualFile: true,
      lastEditedAt: '2026-05-12',
      yearly: [{ year: 2025, cases: 14056 }],
    });
    expect(p.isSourced).toBe(false);
    expect(p.asOf).toBeNull();
  });

  it('survives junk input', () => {
    for (const junk of [null, undefined, 42, 'x', [], [{ source: {} }]]) {
      expect(readFileProvenance(junk).isSourced).toBe(false);
    }
  });
});
