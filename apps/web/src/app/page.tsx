'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildBriefSectionContent } from '@hantawatch/shared/daily-brief-display';
import { currentHpi, baseHpi, activeClusters, chinaHfrsHistory, chinaHfrsMonthly2026, hpi7DayHistory, todayBrief } from '@/lib/mock-data';
import {
  dataMeta,
  hondiusImports,
  hondiusImportSummaries,
  realtimeFeed,
  riskSnapshot,
  arcgisCases,
  arcgisFetchedAt,
  outbreakStatus,
  officialAssessments,
} from '@/lib/data';
import { findNearestAndes } from '@/lib/nearest-cluster';
import { buildRiskSnapshot } from '@/lib/risk-snapshot';
import type { ActiveCluster, MvHondiusImport } from '@hantawatch/shared/types';
import { SEROTYPES } from '@hantawatch/shared';
import { filterOfficialTimelineCases } from '@hantawatch/shared/timeline';
import { Shield, TrendingUp, Bell, ChevronRight, Info, AlertTriangle } from 'lucide-react';
import { DataFreshness } from '@/components/data-freshness';
import { NearestAndesCard } from '@/components/nearest-andes-card';
import { TrendChart } from '@/components/trend-chart';
import { Sparkline } from '@/components/sparkline';
import { DailyBriefBanner } from '@/components/daily-brief-banner';
import { RealtimeSituationSection } from '@/components/realtime-situation-section';
import { loadRealtimeSituation } from '@/data/realtime-situation';
import { useLiveRealtimeSituation } from '@/lib/use-realtime-situation';
import { FeedLegend } from '@/components/feed-legend';
import { RecentCasesTimeline } from '@/components/recent-cases-timeline';
import { SubscribeForm } from '@/components/subscribe-form';
import { RealtimeFeedSection } from '@/components/realtime-feed-section';
import { useLiveRecentCases } from '@/lib/use-live-recent-cases';

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
  if (km > 10000) return 'text-emerald-600';
  if (km > 3000) return 'text-amber-600';
  if (km > 500) return 'text-orange-600';
  return 'text-rose-600';
}

// Visual upgrade: drop the heavy border-{tint}-300 in favour of card-premium's
// hairline. Keep a very subtle background tint so the safety status is
// glanceable without dominating the surface (Linear/Vercel "soft hint" pattern).
function distanceRingBg(km: number): string {
  if (km > 10000) return '!bg-emerald-50/40';
  if (km > 3000) return '!bg-amber-50/40';
  if (km > 500) return '!bg-orange-50/40';
  return '!bg-rose-50/40';
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

  const liveRecentCases = useLiveRecentCases();
  const liveSituation = useLiveRealtimeSituation(loadRealtimeSituation());

  // 口径 B intake values for the DailyBriefBanner — derived from the live
  // situation so the banner text matches the realtime-situation card.
  const intakeStats = useMemo(() => {
    const head = liveSituation.headline as Record<string, unknown>;
    const intake = (liveSituation as { intake?: { last24hCount?: number; highConfidencePicks?: number } }).intake;
    return {
      whoDaysAgo: typeof head.whoDaysAgo === 'number' ? head.whoDaysAgo : undefined,
      intake24hCount: intake?.last24hCount,
      highConfidencePicks: intake?.highConfidencePicks,
      currentReportedCases:
        typeof head.currentReportedCases === 'number' ? head.currentReportedCases : undefined,
    };
  }, [liveSituation]);

  // RecentCasesTimeline: filter to authoritative sources only (Jake's audit
  // #13 — cut the news-tier noise from the homepage; the realtime feed below
  // is the dedicated surface for non-official signals).
  const officialRecentCases = useMemo(
    () => filterOfficialTimelineCases(liveRecentCases),
    [liveRecentCases],
  );

  // The hero now centres on the *nearest active Andes cluster*, not
  // "liveClusters[0]" (which is just whatever the collector happened to
  // sort first). See lib/nearest-cluster.ts for the rationale. Memoised so
  // the heavy filter+sort doesn't run on every state tick.
  const nearestAndes = useMemo(() => findNearestAndes(liveClusters), [liveClusters]);

  // Live overlay of editor-added imports from Supabase
  // (`mv_hondius_imports_additions`). On initial SSR this is null and the
  // page uses the baseline JSON; after mount, we fetch the merged list from
  // /api/hondius-imports and re-render. Result: editor adds an event in
  // /admin → homepage reflects within one render cycle, no JSON commit.
  const [liveImports, setLiveImports] = useState<MvHondiusImport[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/hondius-imports', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { imports?: MvHondiusImport[] } | null) => {
        if (cancelled) return;
        if (j && Array.isArray(j.imports)) setLiveImports(j.imports);
      })
      .catch(() => {/* fall back to baseline silently */});
    return () => { cancelled = true; };
  }, []);

  // Compute the risk snapshot frontend-side rather than reading the static
  // collector output. Why: it lets per-event city/lat/lon edits in
  // mv-hondius-imports.json (baseline) AND any editor-added rows from
  // Supabase reflect immediately in the homepage distance card without
  // waiting for the next collector run. Returned `nearestImport` includes
  // cityZh + distanceIsCityPrecise so the UI can show "🇫🇷 法国 尼斯
  // (精确至城市)". Falls through to country-capital distance when records
  // lack lat/lon, identical to the previous behaviour. */
  const mergedHondiusImports = liveImports ?? hondiusImports;
  // Feed the *pre-import-adjustment* baseHpi into buildRiskSnapshot — the
  // collector's `currentHpi` already bakes in the import distance bump for
  // the imports it saw, so passing `currentHpi` here would double-count the
  // bump (e.g. 31 → 34 for France 8400 km × 0.5 status × 0.3 weight = 3).
  const liveRiskSnapshot = useMemo(
    () => buildRiskSnapshot(baseHpi, mergedHondiusImports),
    [mergedHondiusImports],
  );
  const nearestImport = liveRiskSnapshot.nearestImport;
  const hpi = liveRiskSnapshot.hpi;

  // The hero still needs a *single* cluster object for the distance card +
  // map. Fall back to liveClusters[0] when no Andes cluster exists at all
  // (e.g. test fixtures with non-Andes data), so the page never crashes.
  const cluster = nearestAndes.nearest ?? liveClusters[0];

  const hpiFactors = hpi.factors;
  const hasImportDistance = liveRiskSnapshot.hasImportDistance;
  const displayedDistanceKm = liveRiskSnapshot.displayedDistanceKm ?? cluster.distanceFromChinaKm;
  const dynamicHpi7DayHistory = useMemo(() => {
    if (hpi7DayHistory.length === 0) return hpi7DayHistory;
    return hpi7DayHistory.map((point, index) =>
      index === hpi7DayHistory.length - 1 ? { ...point, value: hpi.total } : point,
    );
  }, [hpi.total]);
  const briefContent = useMemo(
    () =>
      buildBriefSectionContent({
        briefDate: todayBrief.date,
        oneLine: todayBrief.oneLine,
        latestChange: todayBrief.latestChange,
        situation: todayBrief.situation,
        riskJudgment: todayBrief.riskJudgment,
        newCases: todayBrief.newCases,
        sourceSummary: todayBrief.sourceSummary,
        watchFocus: todayBrief.watchFocus,
        evidence: todayBrief.evidence,
        shareLine: todayBrief.shareLine,
        daysSinceLastIntlAlert: todayBrief.daysSinceLastIntlAlert,
        clusterLastUpdate: cluster?.lastUpdate,
        domesticBaselineStatus: todayBrief.domesticBaselineStatus,
        recentCases: liveRecentCases,
        realtimeUpdates: realtimeFeed.updates,
        importSummaries: hondiusImportSummaries,
        arcgisCases: arcgisCases,
        arcgisFetchedAt: arcgisFetchedAt || undefined,
        structuralLine: todayBrief.structuralLine,
        outbreakStatus,
        hpiTotal: hpi.total,
      }),
    [liveRecentCases, cluster?.lastUpdate, hpi.total, outbreakStatus],
  );

  const { metrics: briefMetrics } = briefContent;

  // City-precise label: when cityZh is set, render "法国 尼斯" instead of
  // just "法国". Keeps the country-only fallback when no city is known.
  const importLocZh = nearestImport
    ? nearestImport.cityZh
      ? `${nearestImport.nameZh} ${nearestImport.cityZh}`
      : nearestImport.nameZh
    : '';
  const highRiskDistanceText = hasImportDistance && nearestImport
    ? `约 ${fmt(displayedDistanceKm)} km（${importLocZh}，${nearestImport.statusZh}）`
    : `约 ${fmt(displayedDistanceKm)} km（${cluster.location?.name ?? '当前重点疫情'}）`;
  const highRiskDistanceContext = hasImportDistance && nearestImport
    ? `源头疫情距中国大陆约 ${fmt(liveRiskSnapshot.sourceDistanceKm ?? cluster.distanceFromChinaKm)} km；当前按地理距离最近的输入病例展示。`
    : '按当前最近 Andes 型重点疫情距离展示。';
  return (
    <div className="pb-16">
      {/* ================================================================ */}
      {/* SECTION 1: Hero — mobile-first "everything important above fold"  */}
      {/*                                                                  */}
      {/* Visual upgrade 2026-05-28: switched from deep-blue brand gradient */}
      {/* to soft slate/blue wash. Linear/Vercel-style "clinical dashboard" */}
      {/* aesthetic — calm surfaces, hairline borders, layered shadows.    */}
      {/*                                                                  */}
      {/* Iteration 2: hero now uses a top-down white-to-transparent wash  */}
      {/* so the body's dot texture peeks at the bottom edge. This gives   */}
      {/* the hero its own surface (clean, slightly elevated) while still  */}
      {/* connecting visually to the textured sections that follow.       */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden">
        {/* White wash — fades to body bg at the bottom so the texture
            peeks through and the hero feels visually "on top" of the page. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white via-white/95 to-white/40"
        />
        {/* Subtle radial accents — unobtrusive depth without screaming. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 0% 0%, rgba(13, 148, 136, 0.07) 0%, transparent 35%),' +
              ' radial-gradient(circle at 100% 0%, rgba(2, 132, 199, 0.07) 0%, transparent 35%)',
          }}
        />
        <div className="relative container-page py-4 sm:py-8">
          {/* Data freshness pill — visible affirmation that data is recent.
              Built from meta.json so the user can spot stale dashboards
              without needing to check admin. */}
          <div className="mb-2 flex justify-end">
            <DataFreshness meta={dataMeta} variant="pill" />
          </div>

          {/* Daily brief banner — 口径 B: prominent date + intake summary. */}
          <DailyBriefBanner
            brief={todayBrief}
            headline24h={briefMetrics.headline24h}
            alertLabel={briefMetrics.alertLabel}
            whoDaysAgo={intakeStats.whoDaysAgo}
            intake24hCount={intakeStats.intake24hCount}
            highConfidencePicks={intakeStats.highConfidencePicks}
          />

          {/* (DELETED 2026-05-27 audit) — Andes 警告条 (red gradient) was an
              identical-information duplicate of RealtimeSituationSection's
              outbreakName + state.labelZh, and its red 30-40% 病死率 framing
              violated the "warn without panic" principle. The realtime card
              below carries the same factual signal in a calmer surface. */}

          {/* ─── Above-the-fold metrics: Distance + HPI on one row ─── */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
            {/* Distance card — uses nearest import distance when a confirmed/
                quarantined import is closer than the outbreak source. */}
            {(() => {
              const hasImport = nearestImport != null && nearestImport.distanceKm < cluster.distanceFromChinaKm;
              const dKm = hasImport ? nearestImport!.distanceKm : cluster.distanceFromChinaKm;
              // Compose "🇫🇷 法国 尼斯（确诊输入）" when the import has a city,
              // else fall back to country-only "🇫🇷 法国（确诊输入）".
              const dLabel = hasImport
                ? `${nearestImport!.flag} ${nearestImport!.cityZh ? `${nearestImport!.nameZh} ${nearestImport!.cityZh}` : nearestImport!.nameZh}（${nearestImport!.statusZh}）`
                : cluster.location.name;
              return (
                <div className={`card-premium !p-3 sm:!p-4 ${distanceRingBg(dKm)}`}>
                  <p className="text-[10px] sm:text-xs font-medium text-slate-500 leading-tight">
                    {hasImport ? '最近 Andes 型活动距中国' : '最近 Andes 疫情距中国大陆'}
                  </p>
                  <div className="flex items-baseline gap-1 mt-1.5">
                    <span className={`hw-num-hero text-3xl sm:text-5xl font-bold ${distanceRingColor(dKm)}`}>
                      {hasImport ? '~' : ''}{fmt(dKm)}
                    </span>
                    <span className="text-sm sm:text-lg font-semibold text-slate-400">km</span>
                  </div>
                  <p className="mt-1 text-[10px] sm:text-xs text-slate-600 truncate">
                    {dLabel}
                  </p>
                  {/* Distance ring — compact 4-segment ladder, light theme. */}
                  <div className="mt-2.5 flex gap-1" aria-label="距离圈层">
                    <div className={`flex-1 h-1 rounded-full transition-opacity ${dKm > 10000 ? 'bg-emerald-500' : 'bg-emerald-500 opacity-25'}`} title=">10,000 km" />
                    <div className={`flex-1 h-1 rounded-full transition-opacity ${dKm > 3000 && dKm <= 10000 ? 'bg-amber-400' : 'bg-amber-400 opacity-25'}`} />
                    <div className={`flex-1 h-1 rounded-full transition-opacity ${dKm > 500 && dKm <= 3000 ? 'bg-orange-400' : 'bg-orange-400 opacity-25'}`} />
                    <div className={`w-3 h-1 rounded-full transition-opacity ${dKm <= 500 ? 'bg-rose-500' : 'bg-rose-500 opacity-20'}`} />
                  </div>
                </div>
              );
            })()}

            {/* HPI card — premium surface with coloured progress bar. */}
            <div className="card-premium !p-3 sm:!p-4">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-600 flex-shrink-0" />
                <span className="font-semibold text-[10px] sm:text-xs leading-tight text-slate-900">
                  HPI 逼近指数
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="hw-num-hero text-3xl sm:text-5xl font-bold" style={{ color: hpi.color }}>
                  {hpi.total}
                </span>
                <span className="text-xs sm:text-sm font-semibold" style={{ color: hpi.color }}>
                  {hpi.gradeZh}
                </span>
              </div>
              <div className="mt-2.5 h-1 sm:h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${hpi.total}%`, backgroundColor: hpi.color }} />
              </div>
              <p className="mt-1.5 text-[10px] text-slate-500 leading-tight">
                中国大陆视角 · 满分 100
              </p>
            </div>
          </div>

          {/* ─── Number cards row — 3 atomic numbers always visible ───
              Visual upgrade: now solid white cards on the light hero with
              coloured numerals (sky/emerald/slate) instead of weak glass
              cards on dark gradient. The leading number connects to 口径 B
              currentReported so it never drifts from the realtime card. */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="card-premium text-center !p-3 sm:!p-3.5">
              <div className="hw-num-hero text-2xl sm:text-3xl font-bold text-sky-700">
                {intakeStats.currentReportedCases ?? nearestAndes.totalConfirmed}
              </div>
              <div className="mt-1.5 text-[10px] sm:text-[11px] text-slate-500 leading-tight">
                Andes 现报全球
                {nearestAndes.count > 1 && ` · ${nearestAndes.count} 起`}
              </div>
            </div>
            <div className="card-premium text-center !p-3 sm:!p-3.5">
              <div className="hw-num-hero text-2xl sm:text-3xl font-bold text-emerald-600">0</div>
              <div className="mt-1.5 text-[10px] sm:text-[11px] text-slate-500 leading-tight">
                中国大陆社区传播
              </div>
            </div>
            <div className="card-premium text-center !p-3 sm:!p-3.5">
              <div className="hw-num-hero text-2xl sm:text-3xl font-bold text-slate-900">
                {fmt(displayedDistanceKm)}
              </div>
              <div className="mt-1.5 text-[10px] sm:text-[11px] text-slate-500 leading-tight">
                {hasImportDistance ? `距最近输入 (km)` : '距中国大陆 (km)'}
              </div>
            </div>
          </div>

          {/* ─── Official risk — single-row strip on desktop, 2-col grid
              on mobile. Visual upgrade collapses the previous 4-row table
              into one compact reassurance line. */}
          <div className="card-premium !p-3 sm:!p-4 mb-3 sm:mb-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-2.5">
              <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-600" />
              <span className="font-semibold text-xs sm:text-sm text-slate-900">官方风险评估</span>
              <span className="ml-auto text-[10px] text-slate-400">
                {officialAssessments.asOf ? `评估于 ${officialAssessments.asOf}` : 'WHO / 各国 CDC'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] sm:text-xs">
              {officialAssessments.assessments.map((a) => {
                const badgeClass =
                  a.tone === 'high' ? 'badge-high' : a.tone === 'moderate' ? 'badge-moderate' : 'badge-low';
                return (
                  <div key={a.body} className="inline-flex items-center gap-1.5">
                    <span className="text-slate-500">{a.body}</span>
                    <span className={`badge ${badgeClass} !px-2 !py-0`}>{a.level}</span>
                  </div>
                );
              })}
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
          <div className="hidden sm:block card-premium mt-4">
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

      <RealtimeSituationSection data={liveSituation} />

      {/* ================================================================ */}
      {/* SECTION 2: Serotype status — ranked by concern level             */}
      {/* ================================================================ */}
      <section className="container-page mt-10 relative z-10">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-500" />
          <h2 className="text-sm font-semibold text-slate-700">各血清型关注等级</h2>
          <span className="text-[10px] text-slate-400 ml-auto">按威胁程度排序</span>
        </div>
        {/* Iter 2: 卸掋硬色 border-{tint}-300 + bg-{tint}-50 组合，改用
            ring-1 + bg-{tint}-50/60 软环，与新 design tokens 同步。 */}
        <div className="space-y-1.5">
          {(['andes', 'sin_nombre', 'hantaan', 'seoul', 'puumala'] as const).map((id, i) => {
            const s = SEROTYPES[id];
            const rankRing = [
              'bg-rose-50/60 ring-1 ring-rose-200/70',
              'bg-orange-50/60 ring-1 ring-orange-200/70',
              'bg-amber-50/60 ring-1 ring-amber-200/70',
              'bg-white ring-1 ring-slate-200/70',
              'bg-white ring-1 ring-slate-200/50',
            ];
            const rankLabels = ['🔴 高危关注', '🟠 警惕', '🟡 地方性流行', '🟢 常规监测', '⚪ 低风险'];
            return (
              <div
                key={id}
                className={`rounded-xl ${rankRing[i]} flex items-center gap-2.5 px-3 py-2 shadow-sm`}
              >
                <div
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                  style={{ backgroundColor: s.color + '1f', color: s.color }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-semibold text-[13px] leading-tight text-slate-900">{s.nameZh}</h3>
                    <span className="text-[10px] font-medium" style={{ color: s.color }}>
                      {rankLabels[i]}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate leading-tight">
                    {s.humanToHuman ? '⚠ 可人传 · ' : ''}{s.primaryHost.split('(')[0].trim()} · 病死率 {s.fatalityRate}
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
      <section className="container-page mt-10">
        <div className="card-quiet">
          <h2 className="font-semibold text-base mb-1 flex items-center gap-2 text-slate-700">
            <Info className="h-4 w-4 text-slate-500" />
            中国大陆 HFRS（肾综合征出血热）地方性流行概况
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            以下为中国大陆每年常规报告的 HFRS 病例（地方性流行基线），<strong className="text-slate-700">并非新兴疫情</strong>。
          </p>

          {/* Yearly trend — ECharts bar with 5y mean baseline */}
          <div className="mb-6">
            <p className="text-xs font-medium text-slate-500 mb-2">年度趋势（2020-2025）</p>
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
            <p className="text-xs font-medium text-slate-500 mb-2">
              2026年月度数据 <span className="text-slate-400 font-normal">（截至5月）</span>
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

          <p className="mt-3 text-[10px] text-slate-500 leading-relaxed">
            数据来源：中国疾控中心传染病月报。HFRS 在中国大陆属于地方性流行（endemic），每年报告约 1-2 万例，
            主要由汉滩型和汉城型引起，均<strong className="text-slate-700">不具备人际传播能力</strong>。
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
      <section className="container-page mt-10">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base flex items-center gap-2 text-slate-900">
              <Bell className="h-4 w-4 text-sky-600" />
              最新通报
            </h2>
            <span className="text-[11px] text-slate-400">国际 + 国内 · 按日期倒序</span>
          </div>

          <FeedLegend feedId="recent-cases" compact />

          {/* Legend — unified soft-ring badge style (iter 2) for visual
              consistency with the new design tokens. */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 px-2 py-0.5 font-medium ring-1 ring-rose-200/60">
              ⚠ 安第斯型（人传人）
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 text-slate-600 px-2 py-0.5 ring-1 ring-slate-200/60">
              其他血清型
            </span>
            <span className="mx-1 text-slate-300">·</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 px-2 py-0.5 font-medium ring-1 ring-sky-200/60">官方通报</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 px-2 py-0.5 font-medium ring-1 ring-violet-200/60">专业监测</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 font-medium ring-1 ring-amber-200/60">新闻线索</span>
          </div>

          {/* Filtered to official sources only (WHO / ECDC / 中国 CDC) per
              Jake's audit. The news-tier signals live below in 实时动态. */}
          <RecentCasesTimeline
            cases={officialRecentCases}
            monitoringLeads={briefMetrics.monitoringLeads}
          />

          <p className="mt-3 text-[10px] text-slate-500 leading-relaxed">
            数据每 6 小时自动抓取 WHO / ECDC 官方通报 +
            <strong className="text-violet-700">专业监测</strong> +
            <strong className="text-amber-700">新闻线索</strong>；国内通报由人工核验后录入。
            <br />
            <span className="text-violet-700">专业监测</span>介于官方通报与新闻线索之间；
            <span className="text-amber-700">新闻线索仅作早期信号</span>，请优先参考蓝色"官方通报"。
            血清型标签的红色仅用于安第斯型（唯一确认人传人的汉坦病毒），不代表事件严重程度。
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 5: Realtime feed (Tier-3, machine-translated, collapsed)  */}
      {/* Demoted below 最新通报 because it's lower-trust + previewCount=2   */}
      {/* keeps it from eating the screen. Click "展开剩余" to see all.      */}
      {/* ================================================================ */}
      <section className="container-page mt-10">
        <div className="card">
          {/* Compliance: no right-side "境外媒体" / outlet-name tag in the
              header. The disclaimer banner rendered inside the component
              already covers the AI-translation caveat. */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base flex items-center gap-2 text-slate-900">
              <span className="text-slate-400">🕐</span>
              实时动态
            </h2>
          </div>
          <FeedLegend feedId="realtime" compact />
          <RealtimeFeedSection feed={realtimeFeed} previewCount={10} />
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 6: HPI Transparency Panel                                */}
      {/* ================================================================ */}
      <section className="container-page mt-10">
        <div className="card">
          <h2 className="font-semibold text-base mb-3 flex items-center gap-2 text-slate-900">
            <Info className="h-4 w-4 text-sky-600" />
            HPI 指数分解（透明度面板）
          </h2>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200/60 text-left text-slate-500 text-xs">
                  <th className="pb-2 font-medium">因子</th>
                  <th className="pb-2 font-medium">权重</th>
                  <th className="pb-2 font-medium">原始值</th>
                  <th className="pb-2 font-medium">得分</th>
                  <th className="pb-2 font-medium">加权</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {[
                  ['距离因子', '30%', `${fmt(hpiFactors.distance.km)} km`, hpiFactors.distance.score, hpiFactors.distance.score * hpiFactors.distance.weight],
                  ['官方评估', '25%', `${hpiFactors.officialAssessment.level}`, hpiFactors.officialAssessment.score, hpiFactors.officialAssessment.score * hpiFactors.officialAssessment.weight],
                  ['血清型风险', '20%', SEROTYPES[hpiFactors.serotypeRisk.serotypeId]?.nameZh ?? hpiFactors.serotypeRisk.serotypeId, hpiFactors.serotypeRisk.score, hpiFactors.serotypeRisk.score * hpiFactors.serotypeRisk.weight],
                  ['旅行联通度', '15%', hpiFactors.travelConnectivity.level, hpiFactors.travelConnectivity.score, hpiFactors.travelConnectivity.score * hpiFactors.travelConnectivity.weight],
                  ['历史基线', '10%', hpiFactors.historicalBaseline.deviation, hpiFactors.historicalBaseline.score, hpiFactors.historicalBaseline.score * hpiFactors.historicalBaseline.weight],
                ].map(([factor, weight, raw, score, weighted]) => (
                  <tr key={factor}>
                    <td className="py-1.5 font-medium text-slate-700">{factor}</td>
                    <td className="py-1.5 text-slate-600">{weight}</td>
                    <td className="py-1.5 text-slate-600">{raw}</td>
                    <td className="py-1.5 text-slate-700">{score}</td>
                    <td className="py-1.5 font-mono text-slate-700">{(weighted as number).toFixed(1)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold text-sm">
                  <td className="py-2 text-slate-900">合计</td>
                  <td className="py-2 text-slate-700">100%</td>
                  <td className="py-2" />
                  <td className="py-2" />
                  <td className="py-2 text-sky-700 font-mono">{hpi.total}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            算法公开，每个因子可独立验算。完整公式见 <a href="/about" className="text-sky-700 underline">关于页</a>。
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 7: Alert CTA + Feedback entry                             */}
      {/* Iter 2: switch from blue brand gradient to soft sky/teal wash to  */}
      {/* match new design tokens.                                          */}
      {/* ================================================================ */}
      <section className="container-page mt-10">
        <div className="card !bg-gradient-to-br !from-sky-50/70 !via-white !to-teal-50/40 !border-sky-100/60">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-semibold text-base flex items-center gap-2 text-slate-900">
                <Bell className="h-4 w-4 text-sky-600" />
                订阅预警通知
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                只在以下情况通知你：聚集地距离跨圈层 / HPI 跨阈值 / 官方发布新通报。
                <strong className="text-slate-800">不会发送日常推送。</strong>
              </p>
            </div>
            <SubscribeForm variant="inline" />
            <div className="flex items-center gap-3 pt-3 border-t border-sky-100/60">
              <a href="/feedback" className="text-xs text-slate-500 hover:text-sky-700 transition-colors">反馈建议 →</a>
              <span className="text-slate-300">·</span>
              <a href="/data" className="text-xs text-slate-500 hover:text-sky-700 transition-colors inline-flex items-center gap-1">
                查看完整数据 <ChevronRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
