import './index.scss';
import { View, Text, Input } from '@tarojs/components';
import { useLoad } from '@tarojs/taro';
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
import { trackPageView } from '@/utils/api';

/**
 * Country-by-country Hantavirus situation page.
 *
 * Mirrors apps/web/src/app/countries/page.tsx in content and ordering;
 * the rendering is adapted to Taro's <View>/<Text> primitives + rpx units.
 *
 * Why a二级 page (not a tabBar entry):
 *   - tabBar slots are capped at 5 and all are already used. Adding country
 *     coverage as a二级 page reached from the home entry card preserves the
 *     existing nav muscle memory while still surfacing the feature.
 */

const SEROTYPE_LABEL_ZH: Record<string, string> = {
  hantaan: '汉滩型',
  seoul: '汉城型',
  puumala: '普马拉型',
  dobrava: 'Dobrava 型',
  sin_nombre: '辛诺柏型',
  andes: '安第斯型',
  other: '其他',
};

// Status badge palette — picked to align with the web app's red/amber/blue
// semantics so a user switching surfaces doesn't have to re-learn signals.
const STATUS_STYLES: Record<
  MvHondiusImport['status'],
  { bg: string; fg: string; label: string }
> = {
  imports_confirmed: { bg: '#fef2f2', fg: '#b91c1c', label: '确诊输入' },
  presumptive_positive: { bg: '#fff7ed', fg: '#c2410c', label: '初筛阳性' },
  quarantine_active: { bg: '#fffbeb', fg: '#b45309', label: '隔离中' },
  monitoring: { bg: '#eff6ff', fg: '#1d4ed8', label: '监测中' },
  closed: { bg: '#f3f4f6', fg: '#4b5563', label: '已结束' },
};

function StatusPill({ imp }: { imp: MvHondiusImport }) {
  const s = STATUS_STYLES[imp.status] ?? STATUS_STYLES.monitoring;
  return (
    <Text
      style={{
        display: 'inline-block',
        fontSize: '20rpx',
        fontWeight: 600,
        color: s.fg,
        background: s.bg,
        padding: '4rpx 12rpx',
        borderRadius: '999rpx',
      }}
    >
      ⚠ {s.label}
    </Text>
  );
}

function RiskPill({ c }: { c: CountryView }) {
  const risk = c.risk;
  if (!risk) return null;
  const color = {
    active: ['#fef2f2', '#b91c1c'],
    elevated: ['#fff7ed', '#c2410c'],
    watch: ['#eff6ff', '#1d4ed8'],
    baseline: ['#f3f4f6', '#4b5563'],
  }[risk.riskLevel];
  return (
    <Text
      style={{
        display: 'inline-block',
        fontSize: '20rpx',
        fontWeight: 600,
        color: color[1],
        background: color[0],
        padding: '4rpx 12rpx',
        borderRadius: '999rpx',
      }}
    >
      {risk.riskLevelZh} · {risk.evidenceLevelZh}
    </Text>
  );
}

function leftBorderColor(c: CountryView): string {
  if (c.hasLocalAndes) return '#ef4444';                  // red — local Andes
  if (c.imports?.status === 'imports_confirmed') return '#f97316';  // orange
  if (c.imports) return '#3b82f6';                        // blue — monitoring
  return '#e5e7eb';                                       // grey — baseline
}

function CountryCard({ c }: { c: CountryView }) {
  return (
    <View
      className="card"
      style={{
        borderLeft: `8rpx solid ${leftBorderColor(c)}`,
      }}
    >
      {/* Top row: flag + name + signal heat */}
      <View
        className="flex items-center"
        style={{ justifyContent: 'space-between', marginBottom: '8rpx' }}
      >
        <View className="flex items-center" style={{ gap: '12rpx', minWidth: 0 }}>
          <Text style={{ fontSize: '40rpx', lineHeight: 1 }}>{c.flag}</Text>
          <Text style={{ fontSize: '30rpx', fontWeight: 700, color: '#111827' }}>
            {c.nameZh}
          </Text>
          <Text style={{ fontSize: '20rpx', color: '#9ca3af' }}>{c.nameEn}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <RiskPill c={c} />
          {c.signals && (
            <Text style={{ fontSize: '20rpx', color: '#6b7280', flexShrink: 0, marginTop: '4rpx' }}>
              近 30 天 {c.signals.signalCount30d} 条
              {c.signals.signalCount7d > 0 ? `  · 7 天 ${c.signals.signalCount7d}` : ''}
            </Text>
          )}
        </View>
      </View>

      {c.risk && (
        <View
          style={{
            background: '#f8fafc',
            padding: '10rpx 14rpx',
            borderRadius: '8rpx',
            marginBottom: '10rpx',
          }}
        >
          <Text style={{ display: 'block', fontSize: '22rpx', color: '#334155', fontWeight: 600 }}>
            {c.risk.statusZh}
          </Text>
          <Text style={{ display: 'block', fontSize: '22rpx', color: '#475569', lineHeight: 1.6 }}>
            {c.risk.riskSummaryZh}
          </Text>
          {c.risk.latestEvent && (
            <Text style={{ display: 'block', fontSize: '20rpx', color: '#64748b', marginTop: '4rpx' }}>
              最新事件：{c.risk.latestEvent.date} · {c.risk.latestEvent.title}
            </Text>
          )}
          <Text style={{ display: 'block', fontSize: '20rpx', color: '#94a3b8', marginTop: '4rpx' }}>
            {c.risk.latestSourceRetrievedAt
              ? `来源抓取：约 ${c.risk.sourceFreshnessHours ?? 0} 小时前${c.risk.stale ? ' · 需复核' : ''}`
              : c.risk.lastSignalAt
                ? `最近信号：${c.risk.lastSignalAt.slice(0, 10)}`
                : '近期未见自动事件，显示长期流行基线'}
          </Text>
        </View>
      )}

      {/* Endemic serotypes */}
      <View style={{ marginBottom: '6rpx' }}>
        <Text style={{ fontSize: '22rpx', color: '#9ca3af' }}>本土流行：</Text>
        {c.endemicSerotypes.length > 0 ? (
          <>
            <Text style={{ fontSize: '22rpx', color: '#111827', fontWeight: 600 }}>
              {c.endemicSerotypes.map((s) => SEROTYPE_LABEL_ZH[s] ?? s).join(' · ')}
            </Text>
            {c.hasLocalAndes && (
              <Text
                style={{
                  fontSize: '18rpx',
                  fontWeight: 700,
                  color: '#b91c1c',
                  background: '#fef2f2',
                  padding: '2rpx 8rpx',
                  borderRadius: '4rpx',
                  marginLeft: '8rpx',
                }}
              >
                高致命
              </Text>
            )}
          </>
        ) : (
          <Text style={{ fontSize: '22rpx', color: '#4b5563' }}>无本土传播证据</Text>
        )}
      </View>

      {/* Annual cases line */}
      <Text
        style={{ display: 'block', fontSize: '22rpx', color: '#4b5563', lineHeight: 1.6 }}
      >
        <Text style={{ color: '#9ca3af' }}>年均例数：</Text>
        {c.annualCasesText}
      </Text>

      {/* Imports event */}
      {c.imports && (
        <View
          style={{
            background: '#f9fafb',
            padding: '10rpx 14rpx',
            borderRadius: '8rpx',
            marginTop: '10rpx',
          }}
        >
          <View className="flex items-center" style={{ gap: '8rpx', marginBottom: '4rpx' }}>
            <StatusPill imp={c.imports} />
            <Text style={{ fontSize: '20rpx', color: '#9ca3af' }}>· {c.imports.date}</Text>
          </View>
          <Text style={{ fontSize: '22rpx', color: '#1f2937', lineHeight: 1.6 }}>
            {c.imports.summary_zh}
          </Text>
        </View>
      )}

      {/* Advice */}
      <Text
        style={{
          display: 'block',
          fontSize: '24rpx',
          color: '#374151',
          lineHeight: 1.7,
          marginTop: '10rpx',
        }}
      >
        {c.advice_zh}
      </Text>

      {/* Data note */}
      {c.dataNote && (
        <Text
          style={{
            display: 'block',
            fontSize: '20rpx',
            color: '#9ca3af',
            fontStyle: 'italic',
            marginTop: '6rpx',
          }}
        >
          {c.dataNote}
        </Text>
      )}

      {/* Footer: data review date */}
      <Text
        style={{ display: 'block', fontSize: '20rpx', color: '#9ca3af', marginTop: '8rpx' }}
      >
        基线 review 于 {c.lastReviewed}
      </Text>
    </View>
  );
}

function ImportsBanner() {
  if (hondiusImports.length === 0) return null;
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
    <View className="card" style={{ borderLeft: '8rpx solid #ef4444' }}>
      <View
        className="flex items-center"
        style={{ justifyContent: 'space-between', marginBottom: '12rpx' }}
      >
        <Text style={{ fontSize: '28rpx', fontWeight: 700, color: '#111827' }}>
          ⚠ {hondiusOutbreakName}
        </Text>
        <Text style={{ fontSize: '20rpx', color: '#9ca3af' }}>跨国监测</Text>
      </View>
      {sorted.map((imp) => {
        const country = byIso2.get(imp.iso2.toUpperCase());
        return (
          <View
            key={imp.iso2}
            style={{
              padding: '10rpx 0',
              borderTop: '1rpx solid #f3f4f6',
            }}
          >
            <View className="flex items-center" style={{ gap: '10rpx', marginBottom: '4rpx' }}>
              <Text style={{ fontSize: '34rpx' }}>{country?.flag ?? '🏳️'}</Text>
              <Text style={{ fontSize: '26rpx', fontWeight: 600, color: '#111827' }}>
                {country?.nameZh ?? imp.iso2}
              </Text>
              <StatusPill imp={imp} />
            </View>
            <Text style={{ fontSize: '22rpx', color: '#4b5563', lineHeight: 1.6 }}>
              {imp.summary_zh}
            </Text>
          </View>
        );
      })}
      <Text
        style={{
          display: 'block',
          fontSize: '20rpx',
          color: '#9ca3af',
          marginTop: '10rpx',
          lineHeight: 1.6,
        }}
      >
        每条信息由编辑根据 WHO 与各国卫生机构通报维护。
      </Text>
    </View>
  );
}

export default function CountriesPage() {
  useLoad(() => {
    trackPageView('pages/countries/index');
  });

  const [query, setQuery] = useState('');
  const searchResults = useMemo(() => searchCountries(query), [query]);
  const isSearching = query.trim().length > 0;

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
    <View className="page">
      <View style={{ padding: '24rpx 24rpx 0 24rpx' }}>
        <Text style={{ fontSize: '40rpx', fontWeight: 700, display: 'block' }}>
          各国汉坦病毒情况
        </Text>
        <Text
          style={{
            fontSize: '22rpx',
            color: '#6b7280',
            marginTop: '8rpx',
            display: 'block',
            lineHeight: 1.6,
          }}
        >
          35 国流行病学基线 + MV Hondius 输入跟踪 + 近 30 天信号热度。最相关国家排在前面。
        </Text>
      </View>

      {/* Search input */}
      <View className="card">
        <Text
          style={{
            display: 'block',
            fontSize: '20rpx',
            color: '#6b7280',
            marginBottom: '8rpx',
          }}
        >
          搜索国家（中英文、ISO 代码均可）
        </Text>
        <Input
          type="text"
          value={query}
          onInput={(e) => setQuery(e.detail.value)}
          placeholder="例如：法国 · Spain · DE · 韩国"
          placeholderStyle="color:#9ca3af"
          style={{
            width: '100%',
            border: '1rpx solid #d1d5db',
            borderRadius: '8rpx',
            padding: '14rpx 16rpx',
            fontSize: '26rpx',
            background: '#ffffff',
          }}
        />
        {isSearching && (
          <Text
            style={{
              display: 'block',
              fontSize: '20rpx',
              color: '#9ca3af',
              marginTop: '8rpx',
              lineHeight: 1.6,
            }}
          >
            {searchResults.length === 0
              ? `未找到匹配 "${query}" 的国家。我们目前覆盖 35 国基线。`
              : `匹配 ${searchResults.length} 条结果`}
          </Text>
        )}
      </View>

      {/* MV Hondius banner */}
      {!isSearching && <ImportsBanner />}

      {/* Search results */}
      {isSearching && (
        <>
          <View style={{ padding: '12rpx 24rpx 4rpx 24rpx' }}>
            <Text style={{ fontSize: '28rpx', fontWeight: 600, color: '#111827' }}>
              搜索结果
            </Text>
          </View>
          {searchResults.map((c) => <CountryCard key={c.iso2} c={c} />)}
        </>
      )}

      {/* Continent groups (when not searching) */}
      {!isSearching &&
        CONTINENT_ORDER.map((cont) => {
          const list = countryViewsByContinent[cont] ?? [];
          if (list.length === 0) return null;
          const s = continentSummary[cont];
          return (
            <View key={cont}>
              <View
                style={{
                  padding: '20rpx 24rpx 8rpx 24rpx',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <Text style={{ fontSize: '32rpx', fontWeight: 700, color: '#111827' }}>
                  {CONTINENT_LABEL_ZH[cont]}
                </Text>
                <Text style={{ fontSize: '20rpx', color: '#6b7280' }}>
                  {s.total} 国
                  {s.andes > 0 ? `  · 安第斯本土 ${s.andes}` : ''}
                  {s.imports > 0 ? `  · 输入事件 ${s.imports}` : ''}
                </Text>
              </View>
              {list.map((c) => <CountryCard key={c.iso2} c={c} />)}
            </View>
          );
        })}

      {/* Compliance footer */}
      <View className="card" style={{ background: '#f9fafb' }}>
        <Text
          style={{
            display: 'block',
            fontSize: '20rpx',
            color: '#6b7280',
            lineHeight: 1.7,
          }}
        >
          <Text style={{ fontWeight: 600, color: '#374151' }}>数据来源说明：</Text>
          各国流行病学基线由编辑依据公开年报与同行评议文献整理，每 6 个月人工 review 一次；
          MV Hondius 输入跟踪根据 WHO 与各国卫生机构通报维护；
          「近 30 天信号热度」由系统自动聚合多语言新闻信号，仅反映报道活跃度，不等同于病例数。
        </Text>
        <Text
          style={{
            display: 'block',
            fontSize: '20rpx',
            color: '#6b7280',
            lineHeight: 1.7,
            marginTop: '10rpx',
          }}
        >
          <Text style={{ fontWeight: 600, color: '#374151' }}>不构成医学/旅行建议：</Text>
          本页面为公益性疫情科普展示。出行前请同时查阅目的地国卫生机构与中国外交部领事保护信息。
        </Text>
      </View>
    </View>
  );
}
