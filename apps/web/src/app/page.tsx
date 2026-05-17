'use client';

import { useEffect, useMemo, useState } from 'react';
import { currentHpi, activeClusters, chinaHfrsHistory, chinaHfrsMonthly2026, recentCases, hpi7DayHistory, todayBrief } from '@/lib/mock-data';
import { dataMeta, realtimeFeed, riskSnapshot } from '@/lib/data';
import type { DailyBrief, RecentCase } from '@/lib/data';
import { findNearestAndes, relativeTimeZh, type ImportProximity } from '@/lib/nearest-cluster';
import type { SerotypeId, ActiveCluster } from '@hantawatch/shared/types';
import { isMainlandSource } from '@/lib/link-policy';
import { SEROTYPES } from '@hantawatch/shared';
import { Shield, MapPin, TrendingUp, Bell, ChevronRight, Info, AlertTriangle } from 'lucide-react';
import { DataFreshness } from '@/components/data-freshness';
import { NearestAndesCard } from '@/components/nearest-andes-card';
import { TrendChart } from '@/components/trend-chart';
import { Sparkline } from '@/components/sparkline';
import { DailyBriefBanner } from '@/components/daily-brief-banner';
import { SubscribeForm } from '@/components/subscribe-form';
import { RealtimeFeedSection } from '@/components/realtime-feed-section';

// NOTE (2026-05-13): the interactive MapLibre world map has been removed.
// - Carto/OSM tile CDNs are unreliable behind the GFW, so mainland users
//   (our primary audience) saw blank tiles.
// - The <NearestAndesCard> + <DistanceBar> combo replaces it with a
//   GFW-proof, inline-SVG visualisation that delivers the same core signal
//   ("how far is the nearest outbreak from China").
// If you ever need to reinstate the map, see git history before this commit;
// the component lived at `apps/web/src/components/distance-map.tsx`.

function fmt(n: number): string {
  return n.toLocaleString('zh-CN');
}

function distanceRingColor(km: number): string {
  if (km > 10000) return 'text-green-600';
  if (km > 3000) return 'text-yellow-600';
  if (km > 500) return 'text-orange-600';
  return 'text-red-600';
}

function distanceRingBg(km: number): string {
  if (km > 10000) return 'bg-green-50 border-green-300';
  if (km > 3000) return 'bg-yellow-50 border-yellow-300';
  if (km > 500) return 'bg-orange-50 border-orange-300';
  return 'bg-red-50 border-red-300';
}

export default function HomePage() {
  // ────────────────────────────────────────────────────────────────────
  //  Live cluster data — see lib/cluster-overrides.ts for the story.
  //
  //  Initial state: the static JSON baked at build time (instant paint,
  //  works even with JS disabled / Supabase unreachable).
  //  After mount: fetch /api/clusters which merges in any editorial
  //  overrides saved from /admin/审核队列. Re-render on success.
  //
  //  We deliberately don't show a loading spinner — the baseline JSON is
  //  good enough as a first paint, and the override fetch typically
  //  finishes in <200 ms so the swap is imperceptible.
  // ────────────────────────────────────────────────────────────────────
  const [liveClusters, setLiveClusters] = useState<ActiveCluster[]>(activeClusters);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/clusters', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && Array.isArray(data.clusters) && data.clusters.length > 0) {
          setLiveClusters(data.clusters as ActiveCluster[]);
        }
      })
      .catch(() => {
        /* baseline JSON stays — that's the desired fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ────────────────────────────────────────────────────────────────────
  //  Live "最新通报" entries — admin can add/hide rows from /admin →
  //  「通报管理」 tab. Same fetch-then-merge pattern as liveClusters.
  //  Initial state is the static `recentCases` built from JSON; the
  //  useEffect overlays additions + hides without waiting for a redeploy.
  // ────────────────────────────────────────────────────────────────────
  const [liveRecentCases, setLiveRecentCases] = useState<RecentCase[]>(recentCases);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/news-entries', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const hiddenIds: string[] = Array.isArray(data.hiddenIds) ? data.hiddenIds : [];
        const rawAdditions: Array<Record<string, unknown>> = Array.isArray(data.additions) ? data.additions : [];

        if (hiddenIds.length === 0 && rawAdditions.length === 0) return; // no-op fast path

        // Narrow `caseType` to the CaseRecord union — anything unexpected
        // from the API falls back to 'confirmed' (the only case-type the
        // admin form currently emits, but we defend against schema drift).
        const normalizeCaseType = (v: unknown): 'confirmed' | 'clinical' | 'suspected' =>
          v === 'clinical' || v === 'suspected' ? v : 'confirmed';

        const additions: RecentCase[] = rawAdditions.map((a) => ({
          id: (a.id as string) ?? `admin-${Date.now()}`,
          regionCode: (a.regionCode as string) ?? (a.scope === 'china' ? '000000' : 'INT'),
          serotypeId: ((a.serotypeId as SerotypeId) ?? 'other'),
          date: (a.date as string) ?? '',
          caseType: normalizeCaseType(a.caseType),
          count: Number(a.count ?? 0),
          title: (a.title as string) ?? undefined,
          summary: (a.summary as string) ?? undefined,
          source: {
            name: (a.sourceName as string) ?? '',
            url: (a.sourceUrl as string) ?? '',
            retrievedAt: (a.createdAt as string) ?? new Date().toISOString(),
            confidence: ((a.confidence as 'official' | 'news') ?? 'official'),
          },
          notes: (a.notes as string) ?? undefined,
          scope: ((a.scope as 'china' | 'international') ?? 'international'),
        }));

        const hideSet = new Set(hiddenIds);
        const merged = [...recentCases.filter((c) => !hideSet.has(c.id)), ...additions].sort((a, b) =>
          b.date.localeCompare(a.date),
        );
        setLiveRecentCases(merged);
      })
      .catch(() => { /* keep static baseline */ });
    return () => { cancelled = true; };
  }, []);

  // The hero now centres on the *nearest active Andes cluster*, not
  // "liveClusters[0]" (which is just whatever the collector happened to
  // sort first). See lib/nearest-cluster.ts for the rationale. Memoised so
  // the heavy filter+sort doesn't run on every state tick.
  const nearestAndes = useMemo(() => findNearestAndes(liveClusters), [liveClusters]);

  const nearestImport = riskSnapshot.nearestImport as ImportProximity | null | undefined;
  const hpi = currentHpi;

  // The hero still needs a *single* cluster object for the distance card +
  // map. Fall back to liveClusters[0] when no Andes cluster exists at all
  // (e.g. test fixtures with non-Andes data), so the page never crashes.
  const cluster = nearestAndes.nearest ?? liveClusters[0];

  const hpiFactors = hpi.factors;
  const hasImportDistance = riskSnapshot.hasImportDistance === true;
  const displayedDistanceKm = riskSnapshot.displayedDistanceKm ?? cluster.distanceFromChinaKm;
  const dynamicHpi7DayHistory = useMemo(() => {
    if (hpi7DayHistory.length === 0) return hpi7DayHistory;
    return hpi7DayHistory.map((point, index) =>
      index === hpi7DayHistory.length - 1 ? { ...point, value: hpi.total } : point,
    );
  }, [hpi.total]);
  const dynamicTodayBrief: DailyBrief = todayBrief;

  return (
    <div className="pb-16">
      {/* ================================================================ */}
      {/* SECTION 1: Hero — mobile-first "everything important above fold"  */}
      {/* ================================================================ */}
      <section className="bg-gradient-to-b from-brand-900 via-brand-700 to-brand-500 text-white">
        <div className="container-page py-4 sm:py-8">
          {/* Data freshness pill — visible affirmation that data is recent.
              Built from meta.json so the user can spot stale dashboards
              without needing to check admin. */}
          <div className="mb-2 flex justify-end">
            <DataFreshness meta={dataMeta} variant="pill" />
          </div>

          {/* Daily brief banner */}
          <DailyBriefBanner brief={dynamicTodayBrief} />

          {/* ⚠ Andes warning — compact 1–2 line strip on mobile, expanded on sm+ */}
          <div className="rounded-xl bg-red-500/15 backdrop-blur border border-red-300/30 px-3 py-2.5 sm:p-5 mb-3 sm:mb-4">
            <div className="flex items-start gap-2 sm:gap-3">
              <span className="text-xl sm:text-3xl flex-shrink-0 leading-none mt-0.5">⚠️</span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs font-medium text-red-300 uppercase tracking-wider">当前最受关注</p>
                <h1 className="text-base sm:text-2xl font-extrabold leading-tight truncate sm:whitespace-normal">
                  安第斯型汉坦病毒（Andes）
                </h1>
                <p className="text-[11px] sm:text-sm text-red-200 mt-0.5 sm:mt-1 leading-snug sm:leading-relaxed line-clamp-2 sm:line-clamp-none">
                  唯一已确认可人际传播的汉坦病毒 · 病死率 30-40% · 2026年5月南美洲邮轮聚集疫情
                </p>
                {/* Tag pills — desktop only (saves vertical space on mobile) */}
                <div className="hidden sm:flex flex-wrap gap-2 mt-3 text-xs">
                  <span className="rounded-full bg-red-400/25 px-3 py-1 font-medium text-red-100">⚠ 可人际传播</span>
                  <span className="rounded-full bg-red-400/25 px-3 py-1 text-red-100">病死率 30-40%</span>
                  <span className="rounded-full bg-red-400/25 px-3 py-1 text-red-100">
                    {cluster.confirmedCases}例确诊 · {cluster.deaths}例死亡
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Above-the-fold metrics: Distance + HPI on one row ─── */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
            {/* Distance card — uses nearest import distance when a confirmed/
                quarantined import is closer than the outbreak source. */}
            {(() => {
              const hasImport = nearestImport != null && nearestImport.distanceKm < cluster.distanceFromChinaKm;
              const dKm = hasImport ? nearestImport!.distanceKm : cluster.distanceFromChinaKm;
              const dLabel = hasImport
                ? `${nearestImport!.flag} ${nearestImport!.nameZh}（${nearestImport!.statusZh}）`
                : cluster.location.name;
              return (
                <div className={`rounded-xl border-2 p-3 sm:p-4 ${distanceRingBg(dKm)}`}>
                  <p className="text-[10px] sm:text-xs font-medium text-gray-500 leading-tight">
                    {hasImport ? '最近 Andes 型活动距中国' : '最近 Andes 疫情距中国大陆'}
                  </p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-3xl sm:text-5xl font-extrabold leading-none ${distanceRingColor(dKm)}`}>
                      {hasImport ? '~' : ''}{fmt(dKm)}
                    </span>
                    <span className="text-sm sm:text-xl font-bold text-gray-400">km</span>
                  </div>
                  <p className="mt-1 text-[10px] sm:text-xs text-gray-600 truncate">
                    {dLabel}
                  </p>
                  {/* Distance ring — compact on mobile */}
                  <div className="mt-2 flex gap-0.5" aria-label="距离圈层">
                    <div className={`flex-1 h-1 rounded-full ${dKm > 10000 ? 'bg-green-500' : 'bg-green-500 opacity-40'}`} title=">10,000 km" />
                    <div className={`flex-1 h-1 rounded-full ${dKm > 3000 && dKm <= 10000 ? 'bg-yellow-400' : 'bg-yellow-400 opacity-40'}`} />
                    <div className={`flex-1 h-1 rounded-full ${dKm > 500 && dKm <= 3000 ? 'bg-orange-400' : 'bg-orange-400 opacity-40'}`} />
                    <div className={`w-2 h-1 rounded-full ${dKm <= 500 ? 'bg-red-400' : 'bg-red-400 opacity-30'}`} />
                  </div>
                </div>
              );
            })()}

            {/* HPI card */}
            <div className="rounded-xl bg-white text-gray-900 shadow-md p-3 sm:p-4">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-brand-700 flex-shrink-0" />
                <span className="font-semibold text-[10px] sm:text-xs leading-tight">HPI 逼近指数</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-3xl sm:text-5xl font-extrabold leading-none" style={{ color: hpi.color }}>{hpi.total}</span>
                <span className="text-xs sm:text-base font-semibold" style={{ color: hpi.color }}>{hpi.gradeZh}</span>
              </div>
              <div className="mt-2 h-1 sm:h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${hpi.total}%`, backgroundColor: hpi.color }} />
              </div>
              <p className="mt-1 text-[10px] text-gray-500 leading-tight">中国大陆视角 · 满分 100</p>
            </div>
          </div>

          {/* ─── Number cards row — 3 atomic numbers always visible ─── */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="rounded-lg sm:rounded-xl bg-white/10 backdrop-blur px-2 py-2 sm:p-3 text-center">
              <div className="text-base sm:text-xl font-bold leading-none">
                {nearestAndes.totalConfirmed}
              </div>
              <div className="mt-1 text-[10px] sm:text-[11px] opacity-70 leading-tight">
                {/* "Andes 全球确诊" is more honest than "全球活跃确诊" — we
                    don't aggregate Hantaan/Seoul endemic counts here. */}
                Andes 全球确诊
                {nearestAndes.count > 1 && ` · ${nearestAndes.count} 起`}
              </div>
            </div>
            <div className="rounded-lg sm:rounded-xl bg-white/10 backdrop-blur px-2 py-2 sm:p-3 text-center">
              <div className="text-base sm:text-xl font-bold leading-none text-green-300">0</div>
              <div className="mt-1 text-[10px] sm:text-[11px] opacity-70 leading-tight">中国大陆社区传播</div>
            </div>
            <div className="rounded-lg sm:rounded-xl bg-white/10 backdrop-blur px-2 py-2 sm:p-3 text-center">
              <div className="text-base sm:text-xl font-bold leading-none">{fmt(displayedDistanceKm)}</div>
              <div className="mt-1 text-[10px] sm:text-[11px] opacity-70 leading-tight">
                {hasImportDistance ? `距最近输入 (km)` : '距中国大陆 (km)'}
              </div>
            </div>
          </div>

          {/* ─── Official risk — compact 4-row table ─── */}
          <div className="rounded-xl bg-white text-gray-900 shadow-md p-3 sm:p-5 mb-3 sm:mb-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
              <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-brand-700" />
              <span className="font-semibold text-xs sm:text-sm">官方风险评估</span>
              <span className="ml-auto text-[10px] text-gray-500">WHO / CDC</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-1 gap-x-3 gap-y-1.5 sm:gap-y-2.5">
              {([
                ['WHO 全球', '低风险', 'badge-low'],
                ['US CDC', 'L3 最低', 'badge-low'],
                ['ECDC', '低风险', 'badge-low'],
                ['中国 CDC', '未升级', 'badge-low'],
              ] as const).map(([label, value, cls]) => (
                <div key={label} className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="text-gray-600">{label}</span>
                  <span className={`badge text-[10px] sm:text-[11px] ${cls}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─── Nearest-Andes card — replaces the world map as the
                primary geo-context widget. Works offline / behind GFW (no
                tile CDN), which our mainland audience can't reach reliably.
                See components/nearest-andes-card.tsx for the design notes. */}
          <div className="mb-3 sm:mb-4">
            <NearestAndesCard
              result={nearestAndes}
              nearestImport={nearestImport}
              lastCheckedAt={dataMeta.lastCollectedAtCn ?? dataMeta.lastCollectedAt}
            />
          </div>

          {/* ─── 7-day HPI sparkline + explanation (desktop only — mobile users
                can scroll for this) ─── */}
          <div className="hidden sm:block rounded-xl bg-white text-gray-900 shadow-md p-5 mt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span className="font-medium">HPI 近 7 天趋势</span>
              <span className="font-mono">
                {dynamicHpi7DayHistory[0].value} → <b style={{ color: hpi.color }}>{dynamicHpi7DayHistory[dynamicHpi7DayHistory.length - 1].value}</b>
              </span>
            </div>
            <Sparkline
              values={dynamicHpi7DayHistory.map((d) => d.value)}
              labels={dynamicHpi7DayHistory.map((d) => d.date.slice(5))}
              color={hpi.color}
              height={48}
            />
            <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">
              分数主要来自病毒本身的高危属性（人传人 + 高病死率），因距离中国大陆极远被大幅降权。
            </p>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 2: Serotype status — ranked by concern level             */}
      {/* ================================================================ */}
      <section className="container-page mt-8 relative z-10">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h2 className="text-sm font-semibold text-gray-700">各血清型关注等级</h2>
          <span className="text-[10px] text-gray-400 ml-auto">按威胁程度排序</span>
        </div>
        <div className="space-y-2">
          {(['andes', 'sin_nombre', 'hantaan', 'seoul', 'puumala'] as const).map((id, i) => {
            const s = SEROTYPES[id];
            const rankColors = ['border-red-300 bg-red-50', 'border-orange-200 bg-orange-50', 'border-yellow-200 bg-yellow-50', 'border-gray-200', 'border-gray-100'];
            const rankLabels = ['🔴 高危关注', '🟠 警惕', '🟡 地方性流行', '🟢 常规监测', '⚪ 低风险'];
            return (
              <div key={id} className={`card border ${rankColors[i]} flex items-center gap-3`}>
                <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: s.color + '20', color: s.color }}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">{s.nameZh}</h3>
                    <span className="text-[10px] text-gray-400">{s.nameEn}</span>
                    <span className="text-[10px] font-medium" style={{ color: s.color }}>{rankLabels[i]}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {s.humanToHuman ? '⚠ 可人际传播 · ' : ''}宿主: {s.primaryHost.split('(')[0].trim()} · 病死率: {s.fatalityRate}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 3: China endemic context — de-emphasized, factual        */}
      {/* ================================================================ */}
      <section className="container-page mt-6">
        <div className="card border-gray-200 bg-gray-50/50">
          <h2 className="font-semibold text-base mb-1 flex items-center gap-2 text-gray-600">
            <Info className="h-4 w-4" />
            中国大陆 HFRS（肾综合征出血热）地方性流行概况
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            以下为中国大陆每年常规报告的 HFRS 病例（地方性流行基线），<strong className="text-gray-600">并非新兴疫情</strong>。
          </p>

          {/* Yearly trend — ECharts bar with 5y mean baseline */}
          <div className="mb-6">
            <p className="text-xs font-medium text-gray-500 mb-2">年度趋势（2020-2025）</p>
            <TrendChart
              categories={chinaHfrsHistory.map((d) => d.year)}
              values={chinaHfrsHistory.map((d) => d.cases)}
              variant="bar"
              color="#1e40af"
              baseline={Math.round(
                chinaHfrsHistory.reduce((s, d) => s + d.cases, 0) / chinaHfrsHistory.length,
              )}
              unit="例"
              height={200}
            />
          </div>

          {/* 2026 monthly — line chart, easier to read for short series */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">
              2026年月度数据 <span className="text-gray-400 font-normal">（截至5月）</span>
            </p>
            <TrendChart
              categories={chinaHfrsMonthly2026.map((d) => d.month)}
              values={chinaHfrsMonthly2026.map((d) => d.cases)}
              variant="line"
              color="#0891b2"
              unit="例"
              height={180}
            />
          </div>

          <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
            数据来源：中国疾控中心传染病月报。HFRS 在中国大陆属于地方性流行（endemic），每年报告约 1-2 万例，
            主要由汉滩型和汉城型引起，均<strong>不具备人际传播能力</strong>。
            当前发病数处于历史基线正常范围，无异常暴发。
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 4: Recent timeline (authoritative — WHO / ECDC / 中疾控)   */}
      {/* Moved ABOVE the realtime feed (was Section 5) so the highest-trust */}
      {/* source surfaces first. The realtime feed is machine-translated     */}
      {/* and now lives below in a collapsed state (2026-05-15 trust-order   */}
      {/* fix).                                                              */}
      {/* ================================================================ */}
      <section className="container-page mt-6">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-brand-500" />
              最新通报
            </h2>
            <span className="text-[11px] text-gray-400">国际 + 国内 · 按日期倒序</span>
          </div>

          {/* Legend — explain serotype labels + confidence levels at a glance */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[10px] text-gray-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 px-2 py-0.5 font-medium ring-1 ring-red-200">
              ⚠ 安第斯型（人传人）
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 text-gray-600 px-2 py-0.5 ring-1 ring-gray-200">
              其他血清型
            </span>
            <span className="mx-1 text-gray-300">·</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 font-medium">官方通报</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-medium">新闻线索</span>
          </div>

          <ol className="space-y-3">
            {liveRecentCases.map((c) => {
              const sero = SEROTYPES[c.serotypeId];
              const isAndes = c.serotypeId === 'andes';
              const isIntl = c.scope === 'international';

              // Serotype chip: red when Andes (the only human-to-human serotype), neutral otherwise.
              const seroChipClass = isAndes
                ? 'bg-red-50 text-red-700 ring-red-200 font-semibold'
                : 'bg-gray-50 text-gray-600 ring-gray-200';

              // Row accent: red for Andes, brand for international non-Andes, gray for domestic.
              const accentClass = isAndes
                ? 'border-l-red-500 bg-red-50/50'
                : isIntl
                  ? 'border-l-brand-400 bg-brand-50/30'
                  : 'border-l-gray-300';

              // News leads (confidence === 'news') are surfaced separately
              // from WHO/ECDC official reports so users can tell them apart at
              // a glance. They still go through the same record shape so old
              // consumers continue to work.
              const isNewsLead = c.source?.confidence === 'news';
              const scopeBadge = isNewsLead
                ? { label: '新闻线索', cls: 'bg-amber-100 text-amber-800' }
                : isIntl
                  ? { label: '官方通报', cls: isAndes ? 'badge-severe' : 'badge-elevated' }
                  : { label: '国内通报', cls: 'badge-low' };

              const title = c.title ?? c.notes ?? '';
              // Subtitle rules:
              //   - News leads: never show a summary line. Google News's
              //     <description> is structurally noisy (story-bundle
              //     concat of multiple headlines); the title alone is
              //     enough. See lib/news-format.ts.
              //   - Official entries (WHO DON / ECDC): show their summary
              //     if present; it's hand-written by the publisher.
              //   - Domestic / fallback: show the canned serotype hint so
              //     the row never reads as a bare title.
              const subtitle = isNewsLead
                ? null
                : c.summary
                  ? c.summary
                  : isAndes
                    ? '安第斯型为唯一确认可人传人的汉坦病毒，需持续关注'
                    : '该血清型不具备人际传播能力';

              return (
                <li key={c.id} className={`flex gap-3 border-l-2 pl-4 -mx-2 px-4 py-2 rounded-r-lg ${accentClass}`}>
                  <div className="flex-1 min-w-0">
                    {/* Dual-timestamp row: distinguishes "when was this
                        announced" (🗓 from c.date, day-precision) from
                        "when did our collector last verify it" (🔄 from
                        c.source.retrievedAt, minute-precision). The
                        distinction matters on a monitoring tool —
                        otherwise users assume a 3-day-old WHO bulletin
                        means "the system is stale", but it's actually
                        "WHO hasn't issued a new bulletin in 3 days, and
                        we re-checked 5 minutes ago". */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1 text-[11px] text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <span className="font-medium text-gray-700 font-mono">{c.date}</span>
                        <span className="text-gray-300">·</span>
                        {/* suppressHydrationWarning: relativeTimeZh calls new Date()
                            which differs between SSR (build-time) and client (view-time).
                            Without this, React throws Error #425 and kills ALL useEffects
                            — including the /api/news-entries fetch that merges admin entries. */}
                        <span suppressHydrationWarning>🔄 系统核查 {relativeTimeZh(c.source.retrievedAt)}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${seroChipClass}`}>
                        {isAndes && <span className="mr-0.5">⚠</span>}
                        {sero?.nameZh ?? c.serotypeId}
                        {sero?.nameEn && <span className="ml-1 opacity-60 text-[9px]">{sero.nameEn}</span>}
                      </span>
                      {/* Link policy (see lib/link-policy.ts):
                          Only mainland sources get a clickable anchor.
                          Overseas sources (WHO, ECDC, Reuters, Taiwan CDC,
                          Swiss BAG, news.google.com tracker URLs, …) are
                          shown as plain text — the source-outlet name is
                          still visible so readers know *who* reported it,
                          but we don't aggregate outbound traffic to
                          overseas properties. */}
                      {isMainlandSource(c.source.url) ? (
                        <a
                          href={c.source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-gray-400 hover:text-brand-700 hover:underline truncate max-w-[200px]"
                          title={c.source.name}
                        >
                          {c.source.name} ↗
                        </a>
                      ) : (
                        <span className="text-[10px] text-gray-400 truncate max-w-[200px]">
                          {c.source.name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 font-medium leading-snug">{title}</p>
                    {subtitle && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{subtitle}</p>}
                  </div>
                  <span className={`badge text-[10px] self-start flex-shrink-0 ${scopeBadge.cls}`}>
                    {scopeBadge.label}
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
            数据每 6 小时自动抓取 WHO / ECDC 官方通报 +
            <strong className="text-amber-700">新闻线索</strong>（Google News 聚合，含 ProMED 与中英文主流媒体）；国内通报由人工核验后录入。
            <br />
            <span className="text-amber-700">新闻线索仅作早期信号</span>，与官方通报置信度不同，请以蓝色"官方通报"为准。
            血清型标签的红色仅用于安第斯型（唯一确认人传人的汉坦病毒），不代表事件严重程度。
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 5: Realtime feed (Tier-3, machine-translated, collapsed)  */}
      {/* Demoted below 最新通报 because it's lower-trust + previewCount=2   */}
      {/* keeps it from eating the screen. Click "展开剩余" to see all.      */}
      {/* ================================================================ */}
      <section className="container-page mt-6">
        <div className="card">
          {/* Compliance: no right-side "境外媒体" / outlet-name tag in the
              header. The disclaimer banner rendered inside the component
              already covers the AI-translation caveat. */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <span className="text-gray-500">🕐</span>
              实时动态
            </h2>
          </div>
          <RealtimeFeedSection feed={realtimeFeed} previewCount={2} />
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 6: HPI Transparency Panel                                */}
      {/* ================================================================ */}
      <section className="container-page mt-6">
        <div className="card">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Info className="h-4 w-4 text-brand-500" />
            HPI 指数分解（透明度面板）
          </h2>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500 text-xs">
                  <th className="pb-2 font-medium">因子</th>
                  <th className="pb-2 font-medium">权重</th>
                  <th className="pb-2 font-medium">原始值</th>
                  <th className="pb-2 font-medium">得分</th>
                  <th className="pb-2 font-medium">加权</th>
                </tr>
              </thead>
              <tbody className="divide-y text-xs">
                {[
                  ['距离因子', '30%', `${fmt(hpiFactors.distance.km)} km`, hpiFactors.distance.score, hpiFactors.distance.score * hpiFactors.distance.weight],
                  ['官方评估', '25%', `${hpiFactors.officialAssessment.level}`, hpiFactors.officialAssessment.score, hpiFactors.officialAssessment.score * hpiFactors.officialAssessment.weight],
                  ['血清型风险', '20%', SEROTYPES[hpiFactors.serotypeRisk.serotypeId]?.nameZh ?? hpiFactors.serotypeRisk.serotypeId, hpiFactors.serotypeRisk.score, hpiFactors.serotypeRisk.score * hpiFactors.serotypeRisk.weight],
                  ['旅行联通度', '15%', hpiFactors.travelConnectivity.level, hpiFactors.travelConnectivity.score, hpiFactors.travelConnectivity.score * hpiFactors.travelConnectivity.weight],
                  ['历史基线', '10%', hpiFactors.historicalBaseline.deviation, hpiFactors.historicalBaseline.score, hpiFactors.historicalBaseline.score * hpiFactors.historicalBaseline.weight],
                ].map(([factor, weight, raw, score, weighted]) => (
                  <tr key={factor}>
                    <td className="py-1.5 font-medium">{factor}</td>
                    <td className="py-1.5">{weight}</td>
                    <td className="py-1.5 text-gray-600">{raw}</td>
                    <td className="py-1.5">{score}</td>
                    <td className="py-1.5 font-mono">{(weighted as number).toFixed(1)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold text-sm">
                  <td className="py-2">合计</td>
                  <td className="py-2">100%</td>
                  <td className="py-2" />
                  <td className="py-2" />
                  <td className="py-2 text-brand-700 font-mono">{hpi.total}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-gray-400">
            算法公开，每个因子可独立验算。完整公式见 <a href="/about" className="text-brand-500 underline">关于页</a>。
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 6: Alert CTA + Feedback entry                             */}
      {/* ================================================================ */}
      <section className="container-page mt-6">
        <div className="card bg-gradient-to-r from-brand-50 to-blue-50 border-brand-100">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-brand-500" />
                订阅预警通知
              </h2>
              <p className="text-xs text-gray-600 mt-1">
                只在以下情况通知你：聚集地距离跨圈层 / HPI 跨阈值 / 官方发布新通报。
                <strong className="text-gray-700">不会发送日常推送。</strong>
              </p>
            </div>
            <SubscribeForm variant="inline" />
            <div className="flex items-center gap-3 pt-1 border-t border-brand-100">
              <a href="/feedback" className="text-xs text-gray-500 hover:text-brand-700">反馈建议 →</a>
              <span className="text-gray-300">·</span>
              <a href="/data" className="text-xs text-gray-500 hover:text-brand-700 inline-flex items-center gap-1">
                查看完整数据 <ChevronRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
