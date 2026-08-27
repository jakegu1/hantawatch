import { describe, expect, it } from 'vitest';
import { CN_CITIES, findCity } from './cn-cities';

describe('CN_CITIES', () => {
  it('has at least 34 entries with unique nameZh', () => {
    expect(CN_CITIES.length).toBeGreaterThanOrEqual(34);
    const names = CN_CITIES.map((c) => c.nameZh);
    expect(new Set(names).size).toBe(names.length);
  });

  it('each entry has valid province and coordinates within China bounds', () => {
    for (const city of CN_CITIES) {
      expect(city.provinceZh.trim().length).toBeGreaterThan(0);
      expect(city.lat).toBeGreaterThanOrEqual(18);
      expect(city.lat).toBeLessThanOrEqual(54);
      expect(city.lon).toBeGreaterThanOrEqual(73);
      expect(city.lon).toBeLessThanOrEqual(135);
    }
  });
});

describe('findCity', () => {
  it('returns the matching city', () => {
    const shanghai = findCity('上海');
    expect(shanghai).toBeDefined();
    expect(shanghai!.provinceZh).toBe('上海市');
    expect(shanghai!.lat).toBeCloseTo(31.2304, 3);
  });

  it('returns undefined for unknown name', () => {
    expect(findCity('不存在市')).toBeUndefined();
  });
});
