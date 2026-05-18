import './index.scss';
import { View, Text } from '@tarojs/components';
import Taro, { useLoad, useShareAppMessage, useShareTimeline } from '@tarojs/taro';
import { useEffect, useMemo, useState } from 'react';
import { SEROTYPES } from '@hantawatch/shared';
import type { ActiveCluster } from '@hantawatch/shared/types';
import {
  activeClusters as baselineClusters,
  currentHpi,
  hpi7DayHistory,
  todayBrief,
  recentCases,
  chinaHfrsHistory,
  chinaHfrsMonthly2026,
  dataMeta,
  realtimeFeed,
  riskSnapshot,
} from '@/lib/data';
import type { RecentCase } from '@/lib/data';
import { findNearestAndes } from '@/lib/nearest-cluster';
import type { ImportProximity } from '@/lib/nearest-cluster';
import { fetchClusters, fetchNewsEntries, trackPageView } from '@/utils/api';
import type { ManualNewsEntryPayload } from '@/utils/api';
import { DailyBriefBanner } from '@/components/daily-brief-banner';
import { DataFreshness } from '@/components/data-freshness';
import { NearestAndesCard } from '@/components/nearest-andes-card';
import { Sparkline } from '@/components/sparkline';
import { TrendBar } from '@/components/trend-bar';
import { RecentCasesList } from '@/components/recent-cases-list';
import { RealtimeFeedSection } from '@/components/realtime-feed-section';
import { HpiBreakdown } from '@/components/hpi-breakdown';
import { SubscribeForm } from '@/components/subscribe-form';

function fmt(n: number): string {
  return n.toLocaleString('zh-CN');
}

function distanceRingBg(km: number): { bg: string; border: string; color: string } {
  if (km > 10000) return { bg: '#f0fdf4', border: '#86efac', color: '#16a34a' };
  if (km > 3000) return { bg: '#fefce8', border: '#fde047', color: '#ca8a04' };
  if (km > 500) return { bg: '#fff7ed', border: '#fdba74', color: '#ea580c' };
  return { bg: '#fef2f2', border: '#fca5a5', color: '#dc2626' };
}

export default function HomePage() {
  // Start from the JSON baked into the bundle (instant paint, no network
  // dependency). After mount, optionally refresh from /api/clusters so
  // editorial overrides (saved via the web /admin queue) take effect.
  const [liveClusters, setLiveClusters] = useState<ActiveCluster[]>(baselineClusters);
  const [liveRecentCases, setLiveRecentCases] = useState<RecentCase[]>(recentCases);

  useLoad(() => {
    trackPageView('pages/home/index');
  });

  useEffect(() => {
    let cancelled = false;
    fetchClusters()
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) setLiveClusters(data);
      })
      .catch((err) => {
        console.error('[HantaWatch] fetchClusters failed, keeping bundled baseline:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchNewsEntries()
      .then((data) => {
        if (cancelled) return;
        const hiddenIds = Array.isArray(data.hiddenIds) ? data.hiddenIds : [];
        const rawAdditions = Array.isArray(data.additions) ? data.additions : [];
        if (hiddenIds.length === 0 && rawAdditions.length === 0) return;
        const additions: RecentCase[] = rawAdditions.map((a: ManualNewsEntryPayload) => ({
          id: a.id,
          regionCode: a.regionCode ?? (a.scope === 'china' ? '000000' : 'INT'),
          serotypeId: a.serotypeId ?? 'other',
          date: a.date ?? '',
          caseType: a.caseType === 'clinical' || a.caseType === 'suspected' ? a.caseType : 'confirmed',
          count: Number(a.count ?? 0),
          title: a.title,
          summary: a.summary,
          source: {
            name: a.sourceName ?? '',
            url: a.sourceUrl ?? '',
            retrievedAt: a.createdAt ?? new Date().toISOString(),
            confidence: a.confidence ?? 'official',
          },
          notes: a.notes,
          scope: a.scope ?? 'international',
        }));
        const hideSet = new Set(hiddenIds);
        setLiveRecentCases([...recentCases.filter((c) => !hideSet.has(c.id)), ...additions].sort((a, b) => b.date.localeCompare(a.date)));
      })
      .catch((err) => {
        console.error('[HantaWatch] fetchNewsEntries failed, keeping bundled baseline:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // WeChat native share — replaces the web app's /share poster page.
  useShareAppMessage(() => {
    if (hasImportDistance) {
      return {
        title: `汉坦距中国大陆 ${fmt(displayedDistanceKm)} km（${nearestImport!.nameZh}输入）· 病毒观察`,
        path: '/pages/home/index',
      };
    }
    const nearest = findNearestAndes(liveClusters);
    return {
      title: `汉坦距中国大陆 ${fmt(nearest.km > 0 ? nearest.km : 0)} km · 病毒观察`,
      path: '/pages/home/index',
    };
  });
  useShareTimeline(() => ({
    title: '病毒观察 BingDuGuanCha · 第一时间看清风险',
  }));

  const nearestImport = riskSnapshot.nearestImport as ImportProximity | null | undefined;
  const hpi = currentHpi;
  const dynamicHpi7DayHistory = useMemo(() => {
    if (hpi7DayHistory.length === 0) return hpi7DayHistory;
    return hpi7DayHistory.map((point, index) =>
      index === hpi7DayHistory.length - 1 ? { ...point, value: hpi.total } : point,
    );
  }, [hpi.total]);

  const nearestAndes = useMemo(() => findNearestAndes(liveClusters), [liveClusters]);
  const cluster = nearestAndes.nearest ?? liveClusters[0];

  // When a confirmed/quarantined import is closer than the outbreak source,
  // we show the import distance (e.g. France ~8,400 km) instead of the source
  // distance (Ushuaia ~16,500 km). Mirrors web page.tsx L200-201.
  const hasImportDistance = riskSnapshot.hasImportDistance === true;
  const displayedDistanceKm = riskSnapshot.displayedDistanceKm ?? cluster?.distanceFromChinaKm ?? 0;
  const distTone = distanceRingBg(displayedDistanceKm);
  const highRiskDistanceText = hasImportDistance && nearestImport
    ? `约 ${fmt(displayedDistanceKm)} km（${nearestImport.nameZh}，${nearestImport.statusZh}）`
    : `约 ${fmt(displayedDistanceKm)} km（${cluster?.location?.name ?? '当前重点疫情'}）`;
  const highRiskDistanceContext = hasImportDistance && nearestImport
    ? `源头疫情距中国大陆约 ${fmt(riskSnapshot.sourceDistanceKm ?? cluster?.distanceFromChinaKm ?? 0)} km；当前按最近输入监测距离展示。`
    : '按当前最近 Andes 型重点疫情距离展示。';

  const ranking: Array<{ id: keyof typeof SEROTYPES; label: string; color: string; bg: string; border: string }> = [
    { id: 'andes', label: '🔴 高危关注', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    { id: 'sin_nombre', label: '🟠 警惕', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
    { id: 'hantaan', label: '🟡 地方性流行', color: '#ca8a04', bg: '#fefce8', border: '#fde68a' },
    { id: 'seoul', label: '🟢 常规监测', color: '#16a34a', bg: '#f0fdf4', border: '#e5e7eb' },
    { id: 'puumala', label: '⚪ 低风险', color: '#6b7280', bg: '#ffffff', border: '#f3f4f6' },
  ];

  return (
    <View className="page">
      {/* ============================================================ */}
      {/* SECTION 1 · HERO (gradient brand-900 → brand-500)             */}
      {/* ============================================================ */}
      <View
        style={{
          background: 'linear-gradient(180deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%)',
          color: '#fff',
          padding: '24rpx 24rpx 32rpx 24rpx',
        }}
      >
        {/* Data freshness pill — right aligned */}
        <View className="flex" style={{ justifyContent: 'flex-end', marginBottom: '8rpx' }}>
          <DataFreshness meta={dataMeta} />
        </View>

        {/* Andes warning strip */}
        <View
          style={{
            background: 'rgba(239,68,68,0.18)',
            border: '1rpx solid rgba(252,165,165,0.4)',
            borderRadius: '16rpx',
            padding: '20rpx 24rpx',
            marginBottom: '16rpx',
          }}
        >
          <View className="flex items-start gap-3">
            <Text style={{ fontSize: '48rpx', lineHeight: 1, flexShrink: 0 }}>⚠️</Text>
            <View className="flex-1 min-w-0">
              <Text
                className="uppercase tracking-wider"
                style={{ color: '#fecaca', fontSize: '20rpx', fontWeight: 500, display: 'block' }}
              >
                当前最受关注
              </Text>
              <Text style={{ fontSize: '36rpx', fontWeight: 800, color: '#fff', display: 'block' }}>
                安第斯型汉坦病毒（Andes）
              </Text>
              <Text style={{ fontSize: '22rpx', color: '#fecaca', marginTop: '6rpx', lineHeight: 1.5, display: 'block' }}>
                唯一已确认可人际传播的汉坦病毒 · 病死率 30-40% · 2026年5月南美洲邮轮聚集疫情
              </Text>
              {cluster && (
                <View className="flex flex-wrap gap-2 mt-2">
                  <Text
                    style={{
                      background: 'rgba(248,113,113,0.25)',
                      color: '#fee2e2',
                      borderRadius: '100rpx',
                      padding: '4rpx 16rpx',
                      fontSize: '20rpx',
                    }}
                  >
                    {cluster.confirmedCases}例确诊 · {cluster.deaths}例死亡
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Distance + HPI 2-column grid */}
        {cluster && (
          <View className="flex gap-3 mb-3" style={{ alignItems: 'stretch' }}>
            <View
              className="flex-1"
              style={{
                background: distTone.bg,
                border: `2rpx solid ${distTone.border}`,
                borderRadius: '16rpx',
                padding: '20rpx',
              }}
            >
              <Text style={{ color: '#6b7280', fontSize: '22rpx', fontWeight: 500, display: 'block' }}>
                {hasImportDistance ? '最近已确认输入距中国大陆' : '最近 Andes 疫情距中国大陆'}
              </Text>
              <View className="flex items-baseline gap-1 mt-1">
                <Text style={{ fontSize: '72rpx', fontWeight: 800, color: distTone.color, lineHeight: 1 }}>
                  {fmt(displayedDistanceKm)}
                </Text>
                <Text style={{ fontSize: '32rpx', fontWeight: 700, color: '#9ca3af' }}>km</Text>
              </View>
              <Text style={{ fontSize: '22rpx', color: '#6b7280', marginTop: '6rpx', display: 'block' }} className="truncate">
                {hasImportDistance ? `${nearestImport!.flag} ${nearestImport!.nameZh} · ${nearestImport!.statusZh}` : cluster?.location?.name ?? ''}
              </Text>
              {hasImportDistance && (
                <Text style={{ fontSize: '18rpx', color: '#9ca3af', marginTop: '4rpx', display: 'block' }}>
                  疫情源头: {cluster?.location?.name ?? ''}（{fmt(cluster?.distanceFromChinaKm ?? 0)} km）
                </Text>
              )}
              {/* Distance ring */}
              <View className="flex gap-1 mt-2">
                <View style={{ flex: 1, height: '6rpx', background: '#22c55e', borderRadius: '3rpx' }} />
                <View style={{ flex: 1, height: '6rpx', background: '#fbbf24', opacity: 0.6, borderRadius: '3rpx' }} />
                <View style={{ flex: 1, height: '6rpx', background: '#fb923c', opacity: 0.4, borderRadius: '3rpx' }} />
                <View style={{ width: '12rpx', height: '6rpx', background: '#f87171', opacity: 0.3, borderRadius: '3rpx' }} />
              </View>
            </View>

            <View
              className="flex-1"
              style={{
                background: '#fff',
                borderRadius: '16rpx',
                padding: '20rpx',
                boxShadow: '0 4rpx 12rpx rgba(0,0,0,0.08)',
              }}
            >
              <View className="flex items-center gap-1">
                <Text style={{ fontSize: '22rpx', fontWeight: 600, color: '#111827' }}>📈 HPI 逼近指数</Text>
              </View>
              <View className="flex items-baseline gap-2 mt-1">
                <Text style={{ fontSize: '72rpx', fontWeight: 800, color: hpi.color, lineHeight: 1 }}>{hpi.total}</Text>
                <Text style={{ fontSize: '24rpx', fontWeight: 600, color: hpi.color }}>{hpi.gradeZh}</Text>
              </View>
              <View
                className="mt-2"
                style={{ height: '8rpx', background: '#f3f4f6', borderRadius: '4rpx', overflow: 'hidden' }}
              >
                <View
                  style={{
                    height: '100%',
                    width: `${hpi.total}%`,
                    background: hpi.color,
                    borderRadius: '4rpx',
                  }}
                />
              </View>
              <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '4rpx', display: 'block' }}>
                中国大陆视角 · 满分 100
              </Text>
            </View>
          </View>
        )}

        {/* 3 atomic numbers */}
        <View className="flex gap-2 mb-3">
          {[
            {
              v: nearestAndes.totalConfirmed,
              label: `Andes 全球确诊${nearestAndes.count > 1 ? ` · ${nearestAndes.count} 起` : ''}`,
              color: '#fff',
            },
            { v: 0, label: '中国大陆社区传播', color: '#86efac' },
            { v: fmt(displayedDistanceKm), label: hasImportDistance ? `距最近输入 ${nearestImport!.nameZh} (km)` : '距中国大陆 (km)', color: '#fff' },
          ].map((m, i) => (
            <View
              key={i}
              className="flex-1"
              style={{
                background: 'rgba(255,255,255,0.10)',
                borderRadius: '12rpx',
                padding: '12rpx 8rpx',
                textAlign: 'center',
              }}
            >
              <Text style={{ fontSize: '32rpx', fontWeight: 700, color: m.color, lineHeight: 1, display: 'block' }}>
                {m.v}
              </Text>
              <Text style={{ fontSize: '20rpx', color: 'rgba(255,255,255,0.7)', marginTop: '4rpx', display: 'block', lineHeight: 1.3 }}>
                {m.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Official risk 4-row card */}
        <View
          style={{
            background: '#fff',
            borderRadius: '16rpx',
            padding: '20rpx 24rpx',
            boxShadow: '0 4rpx 12rpx rgba(0,0,0,0.08)',
            marginBottom: '16rpx',
          }}
        >
          <View className="flex items-center gap-2 mb-2">
            <Text style={{ fontSize: '22rpx', fontWeight: 600, color: '#1e3a8a' }}>🛡️ 官方风险评估</Text>
            <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginLeft: 'auto' }}>WHO / CDC</Text>
          </View>
          {[
            ['WHO 全球', '低风险', '#dcfce7', '#166534'],
            ['US CDC', 'L3 最低', '#dcfce7', '#166534'],
            ['ECDC', '低风险', '#dcfce7', '#166534'],
            ['中国 CDC', '未升级', '#dcfce7', '#166534'],
          ].map(([label, value, bg, color]) => (
            <View
              key={label}
              className="flex items-center"
              style={{ justifyContent: 'space-between', padding: '8rpx 0' }}
            >
              <Text style={{ fontSize: '24rpx', color: '#4b5563' }}>{label}</Text>
              <Text
                style={{
                  background: bg,
                  color,
                  borderRadius: '100rpx',
                  padding: '2rpx 16rpx',
                  fontSize: '22rpx',
                  fontWeight: 500,
                }}
              >
                {value}
              </Text>
            </View>
          ))}
        </View>

        {/* Nearest Andes card */}
        <View style={{ marginBottom: '16rpx' }}>
          <NearestAndesCard
            result={nearestAndes}
            lastCheckedAt={dataMeta.lastCollectedAtCn ?? dataMeta.lastCollectedAt}
            importProximity={hasImportDistance ? nearestImport : null}
          />
        </View>

        {/* 7-day HPI sparkline */}
        <View
          style={{
            background: '#fff',
            borderRadius: '16rpx',
            padding: '20rpx 24rpx',
            boxShadow: '0 4rpx 12rpx rgba(0,0,0,0.08)',
          }}
        >
          <View className="flex items-center" style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontSize: '22rpx', fontWeight: 500, color: '#6b7280' }}>HPI 近 7 天趋势</Text>
            <Text style={{ fontSize: '22rpx', fontFamily: 'monospace', color: '#6b7280' }}>
              {dynamicHpi7DayHistory[0]?.value} → <Text style={{ color: hpi.color, fontWeight: 700 }}>{dynamicHpi7DayHistory[dynamicHpi7DayHistory.length - 1]?.value}</Text>
            </Text>
          </View>
          <View className="mt-2">
            <Sparkline
              values={dynamicHpi7DayHistory.map((d) => d.value)}
              labels={dynamicHpi7DayHistory.map((d) => d.date.slice(5))}
              color={hpi.color}
              height={48}
            />
          </View>
          <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '8rpx', display: 'block', lineHeight: 1.5 }}>
            分数主要来自病毒本身的高危属性、输入监测距离、交通连接和国内基线状态。
          </Text>
        </View>

        <View style={{ marginTop: '16rpx' }}>
          <DailyBriefBanner
            brief={todayBrief}
            hpiTotal={hpi.total}
            hpiGradeZh={hpi.gradeZh}
            hpiColor={hpi.color}
            highRiskDistanceText={highRiskDistanceText}
            highRiskDistanceContext={highRiskDistanceContext}
          />
        </View>
      </View>

      {/* ============================================================ */}
      {/* SECTION 2 · 各血清型关注等级                                   */}
      {/* ============================================================ */}
      <View className="container-page" style={{ padding: '24rpx', marginTop: '8rpx' }}>
        <View className="flex items-center gap-2 mb-2">
          <Text style={{ fontSize: '22rpx', color: '#ef4444' }}>⚠️</Text>
          <Text style={{ fontSize: '26rpx', fontWeight: 600, color: '#374151' }}>各血清型关注等级</Text>
          <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginLeft: 'auto' }}>按威胁程度排序</Text>
        </View>
        {ranking.map((r, i) => {
          const s = SEROTYPES[r.id];
          return (
            <View
              key={r.id}
              className="flex items-center gap-3"
              style={{
                background: r.bg,
                border: `1rpx solid ${r.border}`,
                borderRadius: '12rpx',
                padding: '16rpx 18rpx',
                marginBottom: '8rpx',
              }}
            >
              <View
                style={{
                  width: '48rpx',
                  height: '48rpx',
                  borderRadius: '24rpx',
                  background: s.color + '22',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Text style={{ fontSize: '22rpx', fontWeight: 700, color: s.color }}>{i + 1}</Text>
              </View>
              <View className="flex-1 min-w-0">
                <View className="flex items-center gap-2 flex-wrap">
                  <Text style={{ fontSize: '26rpx', fontWeight: 600, color: '#111827' }}>{s.nameZh}</Text>
                  <Text style={{ fontSize: '20rpx', color: '#9ca3af' }}>{s.nameEn}</Text>
                  <Text style={{ fontSize: '20rpx', color: s.color, fontWeight: 500 }}>{r.label}</Text>
                </View>
                <Text
                  style={{ fontSize: '20rpx', color: '#6b7280', marginTop: '4rpx', display: 'block', lineHeight: 1.4 }}
                  className="truncate"
                >
                  {s.humanToHuman ? '⚠ 可人际传播 · ' : ''}宿主: {s.primaryHost.split('(')[0].trim()} · 病死率 {s.fatalityRate}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* ============================================================ */}
      {/* SECTION 3 · 中国 HFRS 地方性流行概况                           */}
      {/* ============================================================ */}
      <View className="container-page" style={{ padding: '0 24rpx', marginTop: '24rpx' }}>
        <View
          className="card"
          style={{ background: '#f9fafb', border: '1rpx solid #e5e7eb' }}
        >
          <View className="flex items-center gap-2 mb-1">
            <Text style={{ fontSize: '24rpx' }}>ℹ️</Text>
            <Text style={{ fontSize: '28rpx', fontWeight: 600, color: '#4b5563' }}>
              中国大陆 HFRS 地方性流行概况
            </Text>
          </View>
          <Text style={{ fontSize: '22rpx', color: '#9ca3af', marginBottom: '16rpx', display: 'block', lineHeight: 1.5 }}>
            以下为每年常规报告的 HFRS 病例（地方性流行基线），并非新兴疫情。
          </Text>

          <Text style={{ fontSize: '22rpx', fontWeight: 500, color: '#6b7280', marginBottom: '8rpx', display: 'block' }}>
            年度趋势（2020-2025）
          </Text>
          <TrendBar
            data={chinaHfrsHistory.map((d) => ({ label: d.year.toString(), value: d.cases }))}
            color="#1e40af"
            baseline={Math.round(
              chinaHfrsHistory.reduce((s, d) => s + d.cases, 0) / chinaHfrsHistory.length,
            )}
            unit="例"
          />

          <View className="mt-3">
            <Text style={{ fontSize: '22rpx', fontWeight: 500, color: '#6b7280', marginBottom: '8rpx', display: 'block' }}>
              2026年月度数据（截至5月）
            </Text>
            <TrendBar
              data={chinaHfrsMonthly2026.map((d) => ({ label: d.month, value: d.cases }))}
              color="#0891b2"
              unit="例"
              showDelta
            />
          </View>

          <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '12rpx', display: 'block', lineHeight: 1.6 }}>
            数据来源：中国疾控中心传染病月报。HFRS 主要由汉滩型和汉城型引起，均不具备人际传播能力。
            当前发病数处于历史基线正常范围，无异常暴发。
          </Text>
        </View>
      </View>

      {/* ============================================================ */}
      {/* SECTION 4 · 最新通报 (authoritative — WHO / ECDC / 中疾控)     */}
      {/* Moved ABOVE the realtime feed (was Section 5) so the highest- */}
      {/* trust source surfaces first (2026-05-15 trust-order fix).     */}
      {/* ============================================================ */}
      <View className="container-page" style={{ padding: '0 24rpx', marginTop: '24rpx' }}>
        <View className="card">
          <View className="flex items-center mb-3" style={{ justifyContent: 'space-between' }}>
            <View className="flex items-center gap-2">
              <Text style={{ fontSize: '24rpx', color: '#1e40af' }}>🔔</Text>
              <Text style={{ fontSize: '28rpx', fontWeight: 600 }}>最新通报</Text>
            </View>
            <Text style={{ fontSize: '20rpx', color: '#9ca3af' }}>国际 + 国内 · 按日期倒序</Text>
          </View>
          <RecentCasesList cases={liveRecentCases.slice(0, 12)} />
        </View>
      </View>

      {/* ============================================================ */}
      {/* SECTION 5 · 实时动态 (Tier-3, machine-translated, collapsed)  */}
      {/* Demoted below 最新通报 because it's lower-trust + previewCount=2  */}
      {/* keeps it from eating the screen. 4b 各国入口 已撤除（晋升 tabBar）.*/}
      {/* ============================================================ */}
      <View className="container-page" style={{ padding: '0 24rpx', marginTop: '24rpx' }}>
        <View className="card">
          {/* Compliance: no right-side "境外媒体" / outlet-name tag in the
              header. The disclaimer banner rendered inside the component
              already covers the AI-translation caveat. */}
          <View className="flex items-center mb-3" style={{ justifyContent: 'space-between' }}>
            <View className="flex items-center gap-2">
              <Text style={{ fontSize: '24rpx', color: '#6b7280' }}>🕐</Text>
              <Text style={{ fontSize: '28rpx', fontWeight: 600 }}>实时动态</Text>
            </View>
          </View>
          <RealtimeFeedSection feed={realtimeFeed} previewCount={2} />
        </View>
      </View>

      {/* ============================================================ */}
      {/* SECTION 5 · HPI 透明度面板                                    */}
      {/* ============================================================ */}
      <View className="container-page" style={{ padding: '0 24rpx', marginTop: '24rpx' }}>
        <View className="card">
          <View className="flex items-center gap-2 mb-3">
            <Text style={{ fontSize: '24rpx', color: '#1e40af' }}>ℹ️</Text>
            <Text style={{ fontSize: '28rpx', fontWeight: 600 }}>HPI 指数分解（透明度面板）</Text>
          </View>
          <HpiBreakdown hpi={hpi} />
        </View>
      </View>

      {/* ============================================================ */}
      {/* SECTION 6 · 订阅 + 反馈 CTA                                    */}
      {/* ============================================================ */}
      <View className="container-page" style={{ padding: '0 24rpx', marginTop: '24rpx', marginBottom: '32rpx' }}>
        <View
          className="card"
          style={{ background: 'linear-gradient(to right, #eff6ff, #dbeafe)', border: '1rpx solid #bfdbfe' }}
        >
          <View className="flex items-center gap-2">
            <Text style={{ fontSize: '24rpx', color: '#1e40af' }}>🔔</Text>
            <Text style={{ fontSize: '28rpx', fontWeight: 600 }}>订阅预警通知</Text>
          </View>
          <Text style={{ fontSize: '22rpx', color: '#4b5563', marginTop: '6rpx', marginBottom: '12rpx', display: 'block', lineHeight: 1.5 }}>
            只在以下情况通知你：聚集地距离跨圈层 / HPI 跨阈值 / 官方发布新通报。<Text style={{ color: '#374151', fontWeight: 600 }}>不会发送日常推送。</Text>
          </Text>
          <SubscribeForm />

          <View
            className="flex items-center gap-3 mt-3 pt-3"
            style={{ borderTop: '1rpx solid #bfdbfe' }}
          >
            <Text
              style={{ fontSize: '22rpx', color: '#6b7280' }}
              onClick={() => Taro.navigateTo({ url: '/pages/feedback/index' })}
            >
              反馈建议 →
            </Text>
            <Text style={{ color: '#d1d5db', fontSize: '22rpx' }}>·</Text>
            <Text
              style={{ fontSize: '22rpx', color: '#6b7280' }}
              onClick={() => Taro.switchTab({ url: '/pages/data/index' })}
            >
              查看完整数据 →
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
