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

import { ImportsBanner, StatusBadge } from '@/components/imports-banner';
import {
  CONTINENT_LABEL_ZH,
  CONTINENT_ORDER,
  countryViews,
  countryViewsByContinent,
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

function RiskBadge({ c }: { c: CountryView }) {
  const risk = c.risk;
  if (!risk) return null;
  const palette = {
    active: 'bg-red-50 text-red-700',
    elevated: 'bg-orange-50 text-orange-700',
    watch: 'bg-blue-50 text-blue-700',
    baseline: 'bg-gray-100 text-gray-600',
  }[risk.riskLevel];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${palette}`}>
      {risk.riskLevelZh} · {risk.evidenceLevelZh}
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
        <div className="shrink-0 flex flex-col items-end gap-1">
          <RiskBadge c={c} />
          {c.signals && (
          <span className="shrink-0 text-[11px] text-gray-500">
            30 天报道 {c.signals.signalCount30d} 条
            {c.signals.signalCount7d > 0 && (
              <span className="ml-1 text-orange-600">· 7 天新增 {c.signals.signalCount7d}</span>
            )}
          </span>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-600 space-y-1">
        {c.risk && (
          <div className="rounded bg-slate-50 px-2 py-1.5 text-[11px] leading-relaxed">
            <div className="font-medium text-slate-700">{c.risk.statusZh}</div>
            <div className="mt-0.5 text-slate-600">{c.risk.riskSummaryZh}</div>
            {c.risk.latestEvent && (
              <div className="mt-1 text-slate-500">
                最新事件：{c.risk.latestEvent.date} · {c.risk.latestEvent.title}
              </div>
            )}
            <div className="mt-1 text-slate-400">
              {c.risk.latestSourceRetrievedAt
                ? `来源抓取：约 ${c.risk.sourceFreshnessHours ?? 0} 小时前${c.risk.stale ? ' · 需复核' : ''}`
                : c.risk.lastSignalAt
                  ? `最近报道线索：${c.risk.lastSignalAt.slice(0, 10)}`
                  : '近期未见自动事件，显示长期流行基线'}
            </div>
          </div>
        )}

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
          基线 review 于 {c.lastReviewed}
          {c.sources && c.sources.length > 0 && (
            <span> · 来源：{c.sources.map((s) => s.name).join('、')}</span>
          )}
        </div>
      </div>
    </div>
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
        覆盖 35 国流行病学基线 + MV Hondius 输入跟踪 + 近 30 天相关报道活跃度。
        数据按「邮轮输入」「本土安第斯」「近期报道活跃度」排序，最相关国家排在前面。
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
          「近 30 天相关报道活跃度」由系统自动聚合多语言公开报道，仅说明该国近期被提及较多，不等同于病例数。
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
