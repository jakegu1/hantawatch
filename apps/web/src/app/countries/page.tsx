'use client';

/**
 * /countries — country-by-country Hantavirus situation page.
 *
 * Three data layers (joined upstream in `lib/data.ts`):
 *   1. Hand-curated 35-country epidemiological baseline,
 *   2. Hand-curated MV Hondius import/monitoring tracker,
 *   3. Auto-aggregated Hantaflow signal heat (30 d window).
 *
 * Design intent:
 *   - "中国留学生想知道我要去的国家有没有汉坦病毒" is the dominant use case.
 *     The page makes that a one-search-or-one-scroll action.
 *   - We deliberately avoid a map: OpenStreetMap is unreliable from
 *     mainland China and country-granularity data doesn't benefit from a
 *     geographic projection — a sorted list is denser and faster to scan.
 *   - "本土流行 vs. 邮轮输入" is the key distinction users need: someone
 *     going to Spain should see "无本土流行, 监测 MV Hondius 输入", not
 *     a scary case count number.
 */

import { useMemo, useState } from 'react';

import {
  CONTINENT_LABEL_ZH,
  CONTINENT_ORDER,
  countryViews,
  countryViewsByContinent,
  hondiusImports,
  hondiusOutbreakName,
  searchCountries,
} from '@/lib/data';
import type { CountryView, MvHondiusImport } from '@hantawatch/shared/types';

const SEROTYPE_LABEL_ZH: Record<string, string> = {
  hantaan: '汉滩型',
  seoul: '汉城型',
  puumala: '普马拉型',
  dobrava: 'Dobrava 型',
  sin_nombre: '辛诺柏型',
  andes: '安第斯型',
  other: '其他',
};

function StatusBadge({ imp }: { imp: MvHondiusImport }) {
  // Colour-coded by status. Picked to match the rest of the site's
  // semantic palette (red = high, amber = elevated, blue = info).
  const palette: Record<MvHondiusImport['status'], { bg: string; fg: string; label: string }> = {
    imports_confirmed: { bg: 'bg-red-50', fg: 'text-red-700', label: '确诊输入' },
    presumptive_positive: { bg: 'bg-orange-50', fg: 'text-orange-700', label: '初筛阳性' },
    quarantine_active: { bg: 'bg-amber-50', fg: 'text-amber-700', label: '隔离中' },
    monitoring: { bg: 'bg-blue-50', fg: 'text-blue-700', label: '监测中' },
    closed: { bg: 'bg-gray-100', fg: 'text-gray-600', label: '已结束' },
  };
  const p = palette[imp.status] ?? palette.monitoring;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${p.bg} ${p.fg}`}>
      ⚠️ {p.label}
    </span>
  );
}

function CountryCard({ c }: { c: CountryView }) {
  // Red left-bar for local Andes (most lethal serotype, person-to-person).
  // Amber for non-Andes endemic but with active imports.
  // Blue for monitoring-only imports.
  // Grey for everything else.
  let leftBorder = 'border-l-4 border-l-gray-200';
  if (c.hasLocalAndes) leftBorder = 'border-l-4 border-l-red-500';
  else if (c.imports?.status === 'imports_confirmed') leftBorder = 'border-l-4 border-l-orange-400';
  else if (c.imports) leftBorder = 'border-l-4 border-l-blue-400';

  return (
    <div className={`card ${leftBorder}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-2xl leading-none" aria-hidden>{c.flag}</span>
          <h3 className="font-semibold text-base truncate">{c.nameZh}</h3>
          <span className="text-xs text-gray-400 hidden sm:inline truncate">{c.nameEn}</span>
        </div>
        {c.signals && (
          <span className="shrink-0 text-[11px] text-gray-500">
            近 30 天 {c.signals.signalCount30d} 条
            {c.signals.signalCount7d > 0 && (
              <span className="ml-1 text-orange-600">· 7 天 {c.signals.signalCount7d}</span>
            )}
          </span>
        )}
      </div>

      <div className="text-xs text-gray-600 space-y-1">
        {c.endemicSerotypes.length > 0 ? (
          <div>
            <span className="text-gray-400">本土流行：</span>
            <span className="font-medium">
              {c.endemicSerotypes.map((s) => SEROTYPE_LABEL_ZH[s] ?? s).join(' · ')}
            </span>
            {c.hasLocalAndes && (
              <span className="ml-1 inline-flex items-center rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                高致命
              </span>
            )}
          </div>
        ) : (
          <div className="text-gray-500">
            <span className="text-gray-400">本土流行：</span>
            <span>无本土传播证据</span>
          </div>
        )}

        <div>
          <span className="text-gray-400">年均例数：</span>
          <span>{c.annualCasesText}</span>
        </div>

        {c.imports && (
          <div className="mt-2 rounded bg-gray-50 px-2 py-1.5 text-[11px] leading-relaxed">
            <div className="flex items-center gap-2 mb-0.5">
              <StatusBadge imp={c.imports} />
              <span className="text-gray-400">· {c.imports.date}</span>
            </div>
            <div className="text-gray-700">{c.imports.summary_zh}</div>
          </div>
        )}

        <p className="text-gray-700 leading-relaxed pt-1">{c.advice_zh}</p>

        {c.dataNote && (
          <p className="text-[11px] text-gray-400 pt-1 italic">{c.dataNote}</p>
        )}

        <div className="text-[11px] text-gray-400 pt-1">
          数据更新于 {c.lastReviewed}
          {c.sources && c.sources.length > 0 && (
            <span> · 来源：{c.sources.map((s) => s.name).join('、')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportsBanner() {
  if (hondiusImports.length === 0) return null;
  // Sort imports: confirmed > quarantine > monitoring > closed.
  const order: Record<MvHondiusImport['status'], number> = {
    imports_confirmed: 0,
    presumptive_positive: 1,
    quarantine_active: 2,
    monitoring: 3,
    closed: 4,
  };
  const sorted = [...hondiusImports].sort((a, b) => order[a.status] - order[b.status]);
  const byIso2 = new Map(countryViews.map((c) => [c.iso2, c]));

  return (
    <section className="card border-l-4 border-l-red-500 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <span className="text-lg" aria-hidden>⚠️</span>
          <span>{hondiusOutbreakName}</span>
        </h2>
        <span className="text-[11px] text-gray-400">跨国监测跟踪</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {sorted.map((imp) => {
          const country = byIso2.get(imp.iso2.toUpperCase());
          return (
            <div key={imp.iso2} className="flex items-start gap-2 text-sm">
              <span className="text-xl shrink-0" aria-hidden>{country?.flag ?? '🏳️'}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{country?.nameZh ?? imp.iso2}</span>
                  <StatusBadge imp={imp} />
                </div>
                <div className="text-xs text-gray-600 mt-0.5 leading-relaxed">{imp.summary_zh}</div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-3">
        每条信息由编辑根据 WHO 与各国卫生机构公开通报维护。详见首页的 MV Hondius 聚集疫情卡片。
      </p>
    </section>
  );
}

export default function CountriesPage() {
  const [query, setQuery] = useState('');
  const searchResults = useMemo(() => searchCountries(query), [query]);
  const isSearching = query.trim().length > 0;

  // Continent totals for the section headers (recomputed once per render).
  const continentSummary = useMemo(() => {
    const out: Record<string, { total: number; andes: number; imports: number }> = {};
    for (const cont of CONTINENT_ORDER) {
      const list = countryViewsByContinent[cont] ?? [];
      out[cont] = {
        total: list.length,
        andes: list.filter((c) => c.hasLocalAndes).length,
        imports: list.filter((c) => c.imports).length,
      };
    }
    return out;
  }, []);

  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-bold mb-2">各国汉坦病毒情况</h1>
      <p className="text-sm text-gray-500 mb-6 leading-relaxed">
        覆盖 35 国流行病学基线 + MV Hondius 输入跟踪 + 近 30 天信号热度。
        数据按「邮轮输入」「本土安第斯」「信号热度」排序，最相关国家排在前面。
      </p>

      {/* Search */}
      <div className="card mb-6">
        <label htmlFor="country-search" className="text-xs text-gray-500 mb-1.5 block">
          搜索国家（支持中文、英文、ISO 代码）
        </label>
        <input
          id="country-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例如：法国 · Spain · DE · 韩国"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          autoComplete="off"
        />
        {isSearching && (
          <p className="text-[11px] text-gray-400 mt-2">
            {searchResults.length === 0
              ? `未找到匹配 "${query}" 的国家。我们目前覆盖 35 国流行病学基线，冷门目的地暂未维护。`
              : `匹配 ${searchResults.length} 条结果`}
          </p>
        )}
      </div>

      {/* MV Hondius imports banner — high priority */}
      {!isSearching && <ImportsBanner />}

      {/* Search results OR continent groups */}
      {isSearching ? (
        <section>
          <h2 className="font-semibold text-base mb-3">搜索结果</h2>
          <div className="grid gap-3">
            {searchResults.map((c) => <CountryCard key={c.iso2} c={c} />)}
          </div>
        </section>
      ) : (
        CONTINENT_ORDER.map((cont) => {
          const list = countryViewsByContinent[cont] ?? [];
          if (list.length === 0) return null;
          const s = continentSummary[cont];
          return (
            <section key={cont} className="mb-8">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-semibold text-lg">{CONTINENT_LABEL_ZH[cont]}</h2>
                <div className="text-[11px] text-gray-500">
                  {s.total} 国
                  {s.andes > 0 && <span className="ml-2 text-red-600">安第斯本土 {s.andes}</span>}
                  {s.imports > 0 && <span className="ml-2 text-orange-600">输入事件 {s.imports}</span>}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((c) => <CountryCard key={c.iso2} c={c} />)}
              </div>
            </section>
          );
        })
      )}

      {/* Compliance footer */}
      <section className="mt-10 rounded-md bg-gray-50 px-4 py-3 text-[11px] text-gray-500 leading-relaxed">
        <p>
          <strong className="text-gray-700">数据来源说明：</strong>
          各国流行病学基线由编辑依据公开年报与同行评议文献整理，
          每 6 个月人工 review 一次；MV Hondius 输入跟踪根据 WHO 与各国卫生机构通报维护；
          「近 30 天信号热度」由系统自动聚合多语言新闻信号，仅反映报道活跃度，不等同于病例数。
        </p>
        <p className="mt-2">
          <strong className="text-gray-700">不构成医学/旅行建议：</strong>
          本页面为公益性疫情科普展示，不替代官方卫生机构、医生或外交部门的正式建议。
          出行前请同时查阅目的地国卫生机构公告与中国外交部领事保护信息。
        </p>
      </section>
    </div>
  );
}
