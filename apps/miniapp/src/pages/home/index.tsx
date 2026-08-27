import './index.scss';
import { View, Text } from '@tarojs/components';
import Taro, { useLoad, usePullDownRefresh, useShareAppMessage, useShareTimeline } from '@tarojs/taro';
import { useEffect, useMemo, useState } from 'react';
import { SEROTYPES } from '@hantawatch/shared';
import { filterOfficialTimelineCases } from '@hantawatch/shared/timeline';
import type { ActiveCluster } from '@hantawatch/shared/types';
import { buildBriefSectionContent } from '@hantawatch/shared/daily-brief-display';
import { deriveRiskVerdict } from '@hantawatch/shared/risk-verdict';
import { useAppData, useRefreshAppData } from '@/lib/data-provider';
import { findNearestAndes } from '@/lib/nearest-cluster';
import { buildRiskSnapshot } from '@/lib/risk-snapshot';
import { fetchClusters, fetchHondiusImports, trackPageView } from '@/utils/api';
import type { MvHondiusImport } from '@hantawatch/shared/types';
import { useLiveRecentCases } from '@/lib/use-live-recent-cases';
import { DailyBriefBanner } from '@/components/daily-brief-banner';
import { RiskVerdictBanner } from '@/components/risk-verdict-banner';
import { DiseaseWatchSection } from '@/components/disease-watch-section';
import { RealtimeSituationSection } from '@/components/realtime-situation-section';
import { FeedLegend } from '@/components/feed-legend';
import { DataFreshness } from '@/components/data-freshness';
import { NearestAndesCard } from '@/components/nearest-andes-card';
import { Sparkline } from '@/components/sparkline';
import { TrendBar } from '@/components/trend-bar';
import { RecentCasesList } from '@/components/recent-cases-list';
import { RealtimeFeedSection } from '@/components/realtime-feed-section';
import { HpiBreakdown } from '@/components/hpi-breakdown';

function fmt(n: number): string {
  return n.toLocaleString('zh-CN');
}

function distanceRingBg(km: number): { bg: string; border: string; color: string } {
  if (km > 10000) return { bg: '#f0fdf4', border: '#86efac', color: '#16a34a' };
  if (km > 3000) return { bg: '#fefce8', border: '#fde047', color: '#ca8a04' };
  if (km > 500) return { bg: '#fff7ed', border: '#fdba74', color: '#ea580c' };
  return { bg: '#fef2f2', border: '#fca5a5', color: '#dc2626' };
}

const ASSESSMENT_TONE: Record<string, { bg: string; color: string }> = {
  low: { bg: '#dcfce7', color: '#166534' },
  moderate: { bg: '#fef9c3', color: '#a16207' },
  high: { bg: '#fee2e2', color: '#b91c1c' },
};


export default function HomePage() {
  const {
    activeClusters: baselineClusters,
    arcgisCases,
    baseHpi,
    hpi7DayHistory,
    todayBrief,
    chinaHfrsHistory,
    chinaHfrsMonthly2026,
    chinaBaselineProvenance,
    chinaBaselineMonthlyYear,
    dataMeta,
    hondiusImports,
    hondiusImportSummaries,
    officialAssessments,
    outbreakStatus,
    realtimeFeed,
    realtimeSituation,
    diseaseWatch,
  } = useAppData();
  const refreshAppData = useRefreshAppData();

  // Cluster rows for NearestAndesCard: baseline comes from DataProvider
  // (/api/miniapp-snapshot, updates after upload without republish). Optional
  // /api/clusters overlay adds Supabase editorial overrides. Do NOT keep a
  // separate useState seeded only at mount — that was the 12 vs 13 bug.
  const [apiClusters, setApiClusters] = useState<ActiveCluster[] | null>(null);
  const liveClusters = useMemo(
    () => (apiClusters?.length ? apiClusters : baselineClusters),
    [apiClusters, baselineClusters],
  );
  const liveRecentCases = useLiveRecentCases();

  // 口径 B intake values for the DailyBriefBanner — derived from the live
  // realtime-situation snapshot. DataProvider refreshes it at runtime from
  // /api/miniapp-snapshot; falls back to the build-time bundle until then.
  const situationSnapshot = realtimeSituation;
  const intakeStats = useMemo(() => {
    const head = situationSnapshot.headline as Record<string, unknown>;
    const intake = (situationSnapshot as { intake?: { last24hCount?: number; highConfidencePicks?: number } }).intake;
    return {
      whoDaysAgo: typeof head.whoDaysAgo === 'number' ? head.whoDaysAgo : undefined,
      intake24hCount: intake?.last24hCount,
      highConfidencePicks: intake?.highConfidencePicks,
      currentReportedCases:
        typeof head.currentReportedCases === 'number' ? head.currentReportedCases : undefined,
    };
  }, [situationSnapshot]);

  /** Shared 口径 B ledger — keeps NearestAndesCard in sync with RealtimeSituation. */
  const andesCaseLedger = useMemo(() => {
    const head = situationSnapshot.headline as Record<string, unknown>;
    const totals = outbreakStatus[0]?.totals;
    return {
      reportedTotal:
        typeof head.currentReportedCases === 'number'
          ? head.currentReportedCases
          : totals?.all,
      confirmed: totals?.confirmed,
      suspected: totals?.indeterminate,
      deaths: totals?.deaths,
      whoDaysAgo: typeof head.whoDaysAgo === 'number' ? head.whoDaysAgo : undefined,
      whoLastUpdateZh:
        typeof head.whoLastUpdateZh === 'string' ? head.whoLastUpdateZh : undefined,
    };
  }, [situationSnapshot, outbreakStatus]);

  // RecentCasesList: filter to authoritative sources only (audit #13).
  const officialRecentCases = useMemo(
    () => filterOfficialTimelineCases(liveRecentCases),
    [liveRecentCases],
  );

  useLoad(() => {
    trackPageView('pages/home/index');
  });

  useEffect(() => {
    let cancelled = false;
    fetchClusters()
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) setApiClusters(data);
      })
      .catch((err) => {
        console.error('[HantaWatch] fetchClusters failed, keeping bundled baseline:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // WeChat native share — replaces the web app's /share poster page.
  //
  // The title used to be the raw distance ("汉坦距中国大陆 8,400 km"). That
  // worked while the outbreak was live, but a bare number carried into a
  // friend's chat reads as an alarm, and it says nothing once the cluster has
  // gone quiet. Share the verdict line instead — it is the product, and it is
  // the same sentence the recipient sees at the top of the page they land on.
  useShareAppMessage(() => ({
    title: `${riskVerdict.titleZh} · 病毒观察`,
    path: '/pages/home/index',
  }));
  useShareTimeline(() => ({
    title: `${riskVerdict.titleZh} · 病毒观察`,
  }));

  // Live overlay: fetch baseline ∪ approved Supabase additions from
  // /api/hondius-imports. Initial render uses the bundled JSON for instant
  // paint; after mount we swap in the merged list so editor-added events
  // (e.g. US-LA new monitoring case) reflect without redeploying the
  // miniapp. Mirror of web page.tsx.
  const [liveImports, setLiveImports] = useState<MvHondiusImport[] | null>(null);
  // Live overlay is a silent best-effort enhancement: on failure we keep the
  // bundled deploy-time snapshot (the miniapp's real source of truth). The
  // honest freshness signal is the DataFreshness pill (collected-at), so we no
  // longer surface a separate "离线" pill that only reflected this optional fetch.
  useEffect(() => {
    let cancelled = false;
    fetchHondiusImports()
      .then((payload) => {
        if (cancelled) return;
        if (payload && Array.isArray(payload.imports)) setLiveImports(payload.imports);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Pull-to-refresh: re-pull both live feeds, then stop the spinner.
  // Each promise catches its own error so Promise.all never rejects (avoids
  // Promise.allSettled, which isn't in the miniapp's TS lib target).
  usePullDownRefresh(() => {
    const p1 = fetchClusters()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setApiClusters(data);
      })
      .catch(() => {});
    const p2 = fetchHondiusImports()
      .then((payload) => {
        if (payload && Array.isArray(payload.imports)) setLiveImports(payload.imports);
      })
      .catch(() => {});
    const p3 = refreshAppData();
    Promise.all([p1, p2, p3]).then(() => Taro.stopPullDownRefresh());
  });

  // Compute the nearest import + import-aware HPI frontend-side so cityZh /
  // lat / lon edits in mv-hondius-imports.json (and Supabase-added rows)
  // reflect immediately. Mirror of web page.tsx — passes `baseHpi` (NOT
  // `currentHpi`) so the collector's import bump isn't double-applied.
  const mergedHondiusImports = liveImports ?? hondiusImports;
  const liveRiskSnapshot = useMemo(
    () => buildRiskSnapshot(baseHpi, mergedHondiusImports),
    [baseHpi, mergedHondiusImports],
  );
  const nearestImport = liveRiskSnapshot.nearestImport;
  const hpi = liveRiskSnapshot.hpi;
  const dynamicHpi7DayHistory = useMemo(() => {
    if (hpi7DayHistory.length === 0) return hpi7DayHistory;
    const importBump = hpi.total - baseHpi.total;
    if (importBump === 0) return hpi7DayHistory;
    return hpi7DayHistory.map((point) => ({
      ...point,
      value: Math.max(0, Math.min(100, point.value + importBump)),
    }));
  }, [hpi.total, baseHpi.total]);

  const nearestAndes = useMemo(() => findNearestAndes(liveClusters), [liveClusters]);
  const cluster = nearestAndes.nearest ?? liveClusters[0];

  // When a confirmed/quarantined import is closer than the outbreak source,
  // we show the import distance (e.g. France ~8,400 km) instead of the source
  // distance (Ushuaia ~16,500 km). Mirrors web page.tsx with the new
  // frontend-computed nearestImport.
  const sourceDistanceKm = cluster?.distanceFromChinaKm ?? 0;
  const hasImportDistance = nearestImport != null && nearestImport.distanceKm < sourceDistanceKm;
  const displayedDistanceKm = hasImportDistance ? nearestImport!.distanceKm : sourceDistanceKm;
  const distTone = distanceRingBg(displayedDistanceKm);

  // City-precise label: "法国 尼斯" when cityZh present, else just "法国".
  const importLocZh = nearestImport
    ? nearestImport.cityZh
      ? `${nearestImport.nameZh} ${nearestImport.cityZh}`
      : nearestImport.nameZh
    : '';
  const highRiskDistanceText = hasImportDistance && nearestImport
    ? `约 ${fmt(displayedDistanceKm)} km（${importLocZh}，${nearestImport.statusZh}）`
    : `约 ${fmt(displayedDistanceKm)} km（${cluster?.location?.name ?? '当前重点疫情'}）`;
  const highRiskDistanceContext = hasImportDistance && nearestImport
    ? `源头疫情距中国大陆约 ${fmt(sourceDistanceKm)} km；当前按地理距离最近的输入病例展示。`
    : '按当前最近 Andes 型重点疫情距离展示。';

  // Chart captions were hardcoded and went stale silently. Derive them.
  const chinaYearlyRangeLabel =
    chinaHfrsHistory.length > 0
      ? `${chinaHfrsHistory[0].year}-${chinaHfrsHistory[chinaHfrsHistory.length - 1].year}`
      : '—';
  const chinaLatestMonthLabel =
    chinaHfrsMonthly2026.length > 0
      ? chinaHfrsMonthly2026[chinaHfrsMonthly2026.length - 1].month
      : '—';

  /** Same state code as RealtimeSituationSection — no second risk engine. */
  const riskVerdict = useMemo(
    () =>
      deriveRiskVerdict({
        stateCode: realtimeSituation.state?.code,
        domesticBaselineStatus: todayBrief.domesticBaselineStatus,
        displayedDistanceKm,
        communityTransmissionCount: 0,
        nearestImport: nearestImport
          ? {
              nameZh: nearestImport.nameZh,
              distanceKm: nearestImport.distanceKm,
              cityZh: nearestImport.cityZh,
            }
          : null,
        sourceDistanceKm: liveRiskSnapshot.sourceDistanceKm,
        // Streak + WHO age power the `resolved` copy ("已经 N 天没有新增确诊").
        daysWithoutNewConfirmed: situationSnapshot.daysWithoutNewConfirmed,
        whoDaysAgo: intakeStats.whoDaysAgo,
        whoLastUpdateZh:
          typeof situationSnapshot.headline.whoLastUpdateZh === 'string'
            ? situationSnapshot.headline.whoLastUpdateZh
            : undefined,
      }),
    [
      realtimeSituation.state?.code,
      todayBrief.domesticBaselineStatus,
      displayedDistanceKm,
      nearestImport,
      liveRiskSnapshot.sourceDistanceKm,
      situationSnapshot,
      intakeStats.whoDaysAgo,
    ],
  );

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
        structuralLine: todayBrief.structuralLine,
        outbreakStatus,
        hpiTotal: hpi.total,
      }),
    [liveRecentCases, cluster?.lastUpdate, hpi.total, outbreakStatus],
  );

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
          background: 'radial-gradient(130% 78% at 50% -12%, rgba(96,165,250,0.42) 0%, rgba(96,165,250,0) 55%), linear-gradient(180deg, #163b80 0%, #0f2a5e 52%, #0a1e47 100%)',
          color: '#fff',
          padding: '24rpx 24rpx 36rpx 24rpx',
        }}
      >
        {/* Data freshness pill — right aligned */}
        <View className="flex items-center" style={{ justifyContent: 'flex-end', gap: '8rpx', marginBottom: '8rpx' }}>
          <DataFreshness meta={dataMeta} />
        </View>

        {/* Everything from here to the end of the hero is Andes/MV-Hondius
            specific. Labelled so it reads as one tracked event rather than
            as the whole tool. */}
        <View
          className="flex items-center"
          style={{ gap: '10rpx', marginBottom: '12rpx', flexWrap: 'wrap' }}
        >
          <Text style={{ fontSize: '24rpx', fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
            深度追踪：汉坦 / 安第斯型
          </Text>
          <Text style={{ fontSize: '20rpx', color: 'rgba(255,255,255,0.6)' }}>
            本站唯一逐国核对病例的疫情
          </Text>
        </View>

        <DailyBriefBanner
          brief={todayBrief}
          headline24h={briefContent.metrics.headline24h}
          alertLabel={briefContent.metrics.alertLabel}
          whoDaysAgo={intakeStats.whoDaysAgo}
          intake24hCount={intakeStats.intake24hCount}
          highConfidencePicks={intakeStats.highConfidencePicks}
        />

        <RiskVerdictBanner verdict={riskVerdict} />

        {/* Distance + HPI 2-column grid */}
        {cluster && (
          <View className="flex gap-3 mb-3" style={{ alignItems: 'stretch' }}>
            <View
              style={{
                flexGrow: 1.5,
                flexShrink: 1,
                flexBasis: '0%',
                minWidth: 0,
                background: '#fff',
                borderRadius: '24rpx',
                padding: '24rpx 22rpx',
                boxShadow: '0 8rpx 28rpx rgba(3, 12, 38, 0.20)',
              }}
            >
              <Text style={{ color: '#6b7280', fontSize: '22rpx', fontWeight: 500, display: 'block' }}>
                {hasImportDistance ? '最近已确认输入距中国大陆' : '最近 Andes 疫情距中国大陆'}
              </Text>
              <View className="flex items-baseline gap-1 mt-1">
                <Text style={{ fontSize: '80rpx', fontWeight: 800, color: distTone.color, lineHeight: 1 }}>
                  {fmt(displayedDistanceKm)}
                </Text>
                <Text style={{ fontSize: '32rpx', fontWeight: 700, color: '#9ca3af' }}>km</Text>
              </View>
              <Text style={{ fontSize: '22rpx', color: '#6b7280', marginTop: '6rpx', display: 'block' }} className="truncate">
                {hasImportDistance ? `${nearestImport!.flag} ${importLocZh} · ${nearestImport!.statusZh}` : cluster?.location?.name ?? ''}
              </Text>
              {hasImportDistance && (
                <Text style={{ fontSize: '22rpx', color: '#9ca3af', marginTop: '4rpx', display: 'block' }}>
                  疫情源头: {cluster?.location?.name ?? ''}（{fmt(cluster?.distanceFromChinaKm ?? 0)} km）
                </Text>
              )}
              {/* Distance position bar — marker shows where the current
                  distance falls on a 0 → ~16,500 km scale (near = red/危险,
                  far = green/安全). Replaces the old purely-decorative ring. */}
              <View style={{ position: 'relative', height: '14rpx', marginTop: '12rpx' }}>
                <View style={{ display: 'flex', height: '6rpx', borderRadius: '3rpx', overflow: 'hidden', marginTop: '4rpx' }}>
                  <View style={{ flex: 1, background: '#f87171' }} />
                  <View style={{ flex: 1, background: '#fb923c' }} />
                  <View style={{ flex: 1, background: '#fbbf24' }} />
                  <View style={{ flex: 1, background: '#22c55e' }} />
                </View>
                <View
                  style={{
                    position: 'absolute',
                    top: '0',
                    left: `${Math.min(100, Math.max(0, (displayedDistanceKm / 16500) * 100))}%`,
                    width: '14rpx',
                    height: '14rpx',
                    borderRadius: '7rpx',
                    background: distTone.color,
                    border: '2rpx solid #fff',
                    boxShadow: '0 1rpx 4rpx rgba(15,23,42,0.35)',
                    marginLeft: '-7rpx',
                  }}
                />
              </View>
            </View>

            <View
              style={{
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: '0%',
                minWidth: 0,
                background: '#fff',
                borderRadius: '24rpx',
                padding: '24rpx 22rpx',
                boxShadow: '0 8rpx 28rpx rgba(3, 12, 38, 0.20)',
              }}
            >
              <View className="flex items-center gap-1">
                <Text style={{ fontSize: '22rpx', fontWeight: 600, color: '#111827' }}>📈 HPI 逼近指数</Text>
              </View>
              <View className="flex items-baseline gap-2 mt-1">
                <Text style={{ fontSize: '56rpx', fontWeight: 800, color: hpi.color, lineHeight: 1 }}>{hpi.total}</Text>
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
              <Text style={{ fontSize: '22rpx', color: '#9ca3af', marginTop: '4rpx', display: 'block' }}>
                中国大陆视角 · 满分 100
              </Text>
            </View>
          </View>
        )}

        {/* Atomic stats — unified into one white strip (3 columns) to match
            the white-card system; replaces the old translucent glass tiles. */}
        <View
          className="flex"
          style={{
            background: '#fff',
            borderRadius: '24rpx',
            padding: '18rpx 6rpx',
            marginBottom: '16rpx',
            boxShadow: '0 8rpx 28rpx rgba(3, 12, 38, 0.20)',
          }}
        >
          {[
            {
              // Connected to realtime situation: prefer 口径 B currentReported
              // so this card and the RealtimeSituationSection headline match.
              v: intakeStats.currentReportedCases ?? nearestAndes.totalReported,
              label: `Andes 现报全球${nearestAndes.count > 1 ? ` · ${nearestAndes.count} 起` : ''}`,
              color: '#1e3a8a',
            },
            { v: 0, label: '中国大陆社区传播', color: '#16a34a' },
            { v: fmt(displayedDistanceKm), label: hasImportDistance ? `距最近输入 ${importLocZh} (km)` : '距中国大陆 (km)', color: '#1e3a8a' },
          ].map((m, i) => (
            <View
              key={i}
              className="flex-1"
              style={{
                textAlign: 'center',
                padding: '0 8rpx',
                borderLeft: i > 0 ? '1rpx solid #eef2f7' : 'none',
              }}
            >
              <Text style={{ fontSize: '34rpx', fontWeight: 700, color: m.color, lineHeight: 1, display: 'block' }}>
                {m.v}
              </Text>
              <Text style={{ fontSize: '22rpx', color: '#6b7280', marginTop: '6rpx', display: 'block', lineHeight: 1.3 }}>
                {m.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Official risk 4-row card */}
        <View
          style={{
            background: '#fff',
            borderRadius: '24rpx',
            padding: '24rpx',
            boxShadow: '0 8rpx 28rpx rgba(3, 12, 38, 0.20)',
            marginBottom: '16rpx',
          }}
        >
          <View className="flex items-center gap-2 mb-2">
            <Text style={{ fontSize: '22rpx', fontWeight: 600, color: '#1e3a8a' }}>🛡️ 官方风险评估</Text>
            <Text style={{ fontSize: '22rpx', color: '#9ca3af', marginLeft: 'auto' }}>
              {officialAssessments.asOf ? `评估于 ${officialAssessments.asOf}` : 'WHO / CDC'}
            </Text>
          </View>
          {officialAssessments.assessments.map((a) => {
            const tone = ASSESSMENT_TONE[a.tone] ?? ASSESSMENT_TONE.low;
            return (
              <View
                key={a.body}
                className="flex items-center"
                style={{ justifyContent: 'space-between', padding: '8rpx 0' }}
              >
                <Text style={{ fontSize: '24rpx', color: '#4b5563' }}>{a.body}</Text>
                <Text
                  style={{
                    background: tone.bg,
                    color: tone.color,
                    borderRadius: '100rpx',
                    padding: '2rpx 16rpx',
                    fontSize: '22rpx',
                    fontWeight: 500,
                  }}
                >
                  {a.level}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Nearest Andes card */}
        <View style={{ marginBottom: '16rpx' }}>
          <NearestAndesCard
            result={nearestAndes}
            lastCheckedAt={dataMeta.lastCollectedAtCn ?? dataMeta.lastCollectedAt}
            importProximity={hasImportDistance ? nearestImport : null}
            caseLedger={andesCaseLedger}
          />
        </View>

        {/* 7-day HPI sparkline */}
        <View
          style={{
            background: '#fff',
            borderRadius: '24rpx',
            padding: '24rpx',
            boxShadow: '0 8rpx 28rpx rgba(3, 12, 38, 0.20)',
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
          <Text style={{ fontSize: '22rpx', color: '#9ca3af', marginTop: '8rpx', display: 'block', lineHeight: 1.5 }}>
            分数主要来自病毒本身的高危属性、输入监测距离、交通连接和国内基线状态。
          </Text>
        </View>

      </View>

      {/* ============================================================ */}
      {/* 传言体温计 — the page's primary answer (2026-08-28).           */}
      {/* Sits directly under the hero because it answers the question  */}
      {/* that does not expire: "I saw a scary post about X — is there  */}
      {/* anything behind it?" The hantavirus blocks above and below    */}
      {/* keep their full depth but are now one tracked event, not the  */}
      {/* whole product. See docs/strategy-post-hanta.md §4.            */}
      {/* This also replaces the old static 其他关注疫情 teaser card —   */}
      {/* 埃博拉 and Mpox are now real rows backed by WHO DON dates.     */}
      {/* ============================================================ */}
      <View className="container-page" style={{ padding: '0 24rpx', marginTop: '24rpx' }}>
        <DiseaseWatchSection data={diseaseWatch} />
      </View>

      <RealtimeSituationSection data={realtimeSituation} />

      {/* ============================================================ */}
      {/* SECTION 2 · 各血清型关注等级                                   */}
      {/* ============================================================ */}
      <View className="container-page" style={{ padding: '24rpx', marginTop: '8rpx' }}>
        <View className="flex items-center gap-2 mb-2">
          <Text style={{ fontSize: '22rpx', color: '#ef4444' }}>⚠️</Text>
          <Text style={{ fontSize: '26rpx', fontWeight: 600, color: '#374151' }}>各血清型关注等级</Text>
          <Text style={{ fontSize: '22rpx', color: '#9ca3af', marginLeft: 'auto' }}>按威胁程度排序</Text>
        </View>
        {/* Compressed (audit #11): smaller circle, tighter padding, single-row
            description. All 5 stay visible but take ~half the vertical space. */}
        {ranking.map((r, i) => {
          const s = SEROTYPES[r.id];
          return (
            <View
              key={r.id}
              className="flex items-center"
              style={{
                background: r.bg,
                border: `1rpx solid ${r.border}`,
                borderRadius: '10rpx',
                padding: '10rpx 14rpx',
                marginBottom: '6rpx',
              }}
            >
              <View
                style={{
                  width: '32rpx',
                  height: '32rpx',
                  borderRadius: '16rpx',
                  background: s.color + '22',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginRight: '16rpx',
                }}
              >
                <Text style={{ fontSize: '22rpx', fontWeight: 700, color: s.color }}>{i + 1}</Text>
              </View>
              <View className="flex-1 min-w-0">
                <View className="flex items-center flex-wrap" style={{ gap: '8rpx' }}>
                  <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#111827' }}>{s.nameZh}</Text>
                  <Text style={{ fontSize: '22rpx', color: s.color, fontWeight: 500 }}>{r.label}</Text>
                </View>
                <Text
                  style={{ fontSize: '22rpx', color: '#6b7280', marginTop: '2rpx', display: 'block', lineHeight: 1.3 }}
                  className="truncate"
                >
                  {s.humanToHuman ? '⚠ 可人传 · ' : ''}{s.primaryHost.split('(')[0].trim()} · 病死率 {s.fatalityRate}
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
        <View className="card" style={{ background: '#f9fafb', border: '1rpx solid #e5e7eb', borderRadius: '20rpx' }}>
          <View className="flex items-center gap-2 mb-1">
            <Text style={{ fontSize: '24rpx' }}>ℹ️</Text>
            <Text style={{ fontSize: '28rpx', fontWeight: 600, color: '#4b5563' }}>
              中国大陆 HFRS 地方性流行概况
            </Text>
          </View>
          <Text style={{ fontSize: '22rpx', color: '#9ca3af', marginBottom: '16rpx', display: 'block', lineHeight: 1.5 }}>
            以下为每年常规报告的 HFRS 病例（地方性流行基线），并非新兴疫情。
          </Text>

          {/* Numbers gated on file-level provenance — mirrors web. An
              unsourced chart reads as authoritative, which is exactly what
              铁律 #2/#3 exist to prevent. */}
          {chinaBaselineProvenance.isSourced ? (
            <>
              <Text style={{ fontSize: '22rpx', fontWeight: 500, color: '#6b7280', marginBottom: '8rpx', display: 'block' }}>
                年度趋势（{chinaYearlyRangeLabel}）
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
                  {chinaBaselineMonthlyYear}年月度数据（截至{chinaLatestMonthLabel}）
                </Text>
                <TrendBar
                  data={chinaHfrsMonthly2026.map((d) => ({ label: d.month, value: d.cases }))}
                  color="#0891b2"
                  unit="例"
                  showDelta
                />
              </View>

              <Text style={{ fontSize: '22rpx', color: '#9ca3af', marginTop: '12rpx', display: 'block', lineHeight: 1.6 }}>
                数据来源：{chinaBaselineProvenance.sourceName ?? '官方月报'}（截至 {chinaBaselineProvenance.asOf}）。
                HFRS 主要由汉滩型和汉城型引起，均不具备人际传播能力。
              </Text>
            </>
          ) : (
            <View
              style={{
                border: '2rpx dashed #cbd5e1',
                background: '#f8fafc',
                borderRadius: '16rpx',
                padding: '24rpx 20rpx',
              }}
            >
              <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#334155', display: 'block' }}>
                暂无可溯源的国内基线数字
              </Text>
              <Text style={{ fontSize: '22rpx', color: '#64748b', display: 'block', marginTop: '10rpx', lineHeight: 1.6 }}>
                中国疾控没有公开 API，年度 / 月度 HFRS 数字需人工从月报抄录。在补齐来源链接与截止日期之前，
                我们选择不显示这些数字——宁可留白，也不给你一个无法核对的图表。
              </Text>
              <Text style={{ fontSize: '22rpx', color: '#64748b', display: 'block', marginTop: '10rpx', lineHeight: 1.6 }}>
                不变的事实：HFRS 在中国大陆属于地方性流行，主要由汉滩型和汉城型引起，两者均不具备人际传播能力，
                与本站追踪的安第斯型不同。
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ============================================================ */}
      {/* SECTION 4 · 最新通报 (authoritative — WHO / ECDC / 中疾控)     */}
      {/* Moved ABOVE the realtime feed (was Section 5) so the highest- */}
      {/* trust source surfaces first (2026-05-15 trust-order fix).     */}
      {/* ============================================================ */}
      <View className="container-page" style={{ padding: '0 24rpx', marginTop: '24rpx' }}>
        <View className="card" style={{ border: '1rpx solid #e5e7eb', borderRadius: '20rpx', boxShadow: '0 6rpx 18rpx rgba(15,23,42,0.05)' }}>
          <View className="flex items-center mb-3" style={{ justifyContent: 'space-between' }}>
            <View className="flex items-center gap-2">
              <Text style={{ fontSize: '24rpx', color: '#1e40af' }}>🔔</Text>
              <Text style={{ fontSize: '28rpx', fontWeight: 600 }}>最新通报</Text>
            </View>
            <Text style={{ fontSize: '22rpx', color: '#9ca3af' }}>国际 + 国内 · 按日期倒序</Text>
          </View>
          <FeedLegend feedId="recent-cases" />
          {/* Filtered to official sources only per audit — see web mirror. */}
          <RecentCasesList
            cases={officialRecentCases}
            monitoringLeads={briefContent.metrics.monitoringLeads}
            maxRows={12}
          />
        </View>
      </View>

      {/* ============================================================ */}
      {/* SECTION 5 · 实时动态 (Tier-3, machine-translated, collapsed)  */}
      {/* Demoted below 最新通报 because it's lower-trust + previewCount=2  */}
      {/* keeps it from eating the screen. 4b 各国入口 已撤除（晋升 tabBar）.*/}
      {/* ============================================================ */}
      <View className="container-page" style={{ padding: '0 24rpx', marginTop: '24rpx' }}>
        <View className="card" style={{ border: '1rpx solid #e5e7eb', borderRadius: '20rpx', boxShadow: '0 6rpx 18rpx rgba(15,23,42,0.05)' }}>
          {/* Compliance: no right-side "境外媒体" / outlet-name tag in the
              header. The disclaimer banner rendered inside the component
              already covers the AI-translation caveat. */}
          <View className="flex items-center mb-3" style={{ justifyContent: 'space-between' }}>
            <View className="flex items-center gap-2">
              <Text style={{ fontSize: '24rpx', color: '#6b7280' }}>🕐</Text>
              <Text style={{ fontSize: '28rpx', fontWeight: 600 }}>实时动态</Text>
            </View>
          </View>
          <FeedLegend feedId="realtime" />
          <RealtimeFeedSection feed={realtimeFeed} previewCount={10} />
        </View>
      </View>

      {/* ============================================================ */}
      {/* SECTION 5 · HPI 透明度面板                                    */}
      {/* ============================================================ */}
      <View className="container-page" style={{ padding: '0 24rpx', marginTop: '24rpx' }}>
        <View className="card" style={{ border: '1rpx solid #e5e7eb', borderRadius: '20rpx', boxShadow: '0 6rpx 18rpx rgba(15,23,42,0.05)' }}>
          <View className="flex items-center gap-2 mb-3">
            <Text style={{ fontSize: '24rpx', color: '#1e40af' }}>ℹ️</Text>
            <Text style={{ fontSize: '28rpx', fontWeight: 600 }}>HPI 指数分解（透明度面板）</Text>
          </View>
          <HpiBreakdown hpi={hpi} />
        </View>
      </View>

      {/* ============================================================ */}
      {/* SECTION 7 · 导航 footer                                        */}
      {/*                                                                */}
      {/* The subscribe-alerts CTA was removed from miniapp on 2026-05-27 */}
      {/* (audit #16): WeChat reviewers reject email-capture flows as PII */}
      {/* collection. As of 2026-08-27 the web form is gone too, so both  */}
      {/* surfaces are now consistently zero-PII — see docs/PRD.md        */}
      {/* OUT-OF-SCOPE #2/#3 and apps/web/src/app/api/alert/subscribe.    */}
      {/* ============================================================ */}
      <View className="container-page" style={{ padding: '0 24rpx', marginTop: '24rpx', marginBottom: '32rpx' }}>
        <View
          className="flex items-center"
          style={{
            justifyContent: 'center',
            gap: '12rpx',
            padding: '20rpx 0',
            borderTop: '1rpx solid #e5e7eb',
          }}
        >
          <Text
            style={{ fontSize: '22rpx', color: '#6b7280' }}
            onClick={() => Taro.switchTab({ url: '/pages/data/index' })}
          >
            查看完整数据 →
          </Text>
        </View>
      </View>
    </View>
  );
}
