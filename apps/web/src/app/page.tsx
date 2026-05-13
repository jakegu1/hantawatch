'use client';

import { currentHpi, activeClusters, chinaHfrsHistory, chinaHfrsMonthly2026, recentCases, hpi7DayHistory, todayBrief } from '@/lib/mock-data';
import { calculateHpi } from '@/lib/hpi';
import { SEROTYPES } from '@hantawatch/shared';
import { Shield, MapPin, TrendingUp, Bell, ChevronRight, Info, AlertTriangle } from 'lucide-react';
import { TrendChart } from '@/components/trend-chart';
import { Sparkline } from '@/components/sparkline';
import { DailyBriefBanner } from '@/components/daily-brief-banner';
import { SubscribeForm } from '@/components/subscribe-form';
import dynamic from 'next/dynamic';

// MapLibre is heavy and references `window` — load only on the client.
const DistanceMap = dynamic(
  () => import('@/components/distance-map').then((m) => m.DistanceMap),
  { ssr: false, loading: () => <div className="h-[280px] rounded-xl bg-gray-100 animate-pulse" /> },
);

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
  const hpi = currentHpi;
  const cluster = activeClusters[0];

  const liveHpi = calculateHpi({
    distanceKm: cluster.distanceFromChinaKm,
    officialRiskLevel: 'low',
    serotypeId: 'andes',
    travelConnectivity: 'indirect',
    baselineDeviation: 'normal',
  });

  return (
    <div className="pb-16">
      {/* ================================================================ */}
      {/* SECTION 1: Hero — mobile-first "everything important above fold"  */}
      {/* ================================================================ */}
      <section className="bg-gradient-to-b from-brand-900 via-brand-700 to-brand-500 text-white">
        <div className="container-page py-4 sm:py-8">
          {/* Daily brief banner */}
          <DailyBriefBanner brief={todayBrief} />

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
                  <span className="rounded-full bg-red-400/25 px-3 py-1 text-red-100">7例确诊 · 3例死亡</span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Above-the-fold metrics: Distance + HPI on one row ─── */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
            {/* Distance card */}
            <div className={`rounded-xl border-2 p-3 sm:p-4 ${distanceRingBg(cluster.distanceFromChinaKm)}`}>
              <p className="text-[10px] sm:text-xs font-medium text-gray-500 leading-tight">
                聚集地距中国大陆
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-3xl sm:text-5xl font-extrabold leading-none ${distanceRingColor(cluster.distanceFromChinaKm)}`}>
                  {fmt(cluster.distanceFromChinaKm)}
                </span>
                <span className="text-sm sm:text-xl font-bold text-gray-400">km</span>
              </div>
              <p className="mt-1 text-[10px] sm:text-xs text-gray-600 truncate">
                {cluster.location.name}
              </p>
              {/* Distance ring — compact on mobile */}
              <div className="mt-2 flex gap-0.5" aria-label="距离圈层">
                <div className="flex-1 h-1 rounded-full bg-green-500" title=">10,000 km" />
                <div className="flex-1 h-1 rounded-full bg-yellow-400 opacity-60" />
                <div className="flex-1 h-1 rounded-full bg-orange-400 opacity-40" />
                <div className="w-2 h-1 rounded-full bg-red-400 opacity-30" />
              </div>
            </div>

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
                {activeClusters.reduce((s, c) => s + c.confirmedCases, 0)}
              </div>
              <div className="mt-1 text-[10px] sm:text-[11px] opacity-70 leading-tight">全球活跃确诊</div>
            </div>
            <div className="rounded-lg sm:rounded-xl bg-white/10 backdrop-blur px-2 py-2 sm:p-3 text-center">
              <div className="text-base sm:text-xl font-bold leading-none text-green-300">0</div>
              <div className="mt-1 text-[10px] sm:text-[11px] opacity-70 leading-tight">中国大陆社区传播</div>
            </div>
            <div className="rounded-lg sm:rounded-xl bg-white/10 backdrop-blur px-2 py-2 sm:p-3 text-center">
              <div className="text-base sm:text-xl font-bold leading-none">{fmt(cluster.distanceFromChinaKm)}</div>
              <div className="mt-1 text-[10px] sm:text-[11px] opacity-70 leading-tight">距中国大陆 (km)</div>
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

          {/* ─── Map (below the fold on mobile — secondary affordance) ─── */}
          <details className="group rounded-xl bg-white/5 backdrop-blur border border-white/10 mb-3 sm:mb-0" open>
            <summary className="cursor-pointer list-none sm:hidden flex items-center justify-between px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                查看距离地图
              </span>
              <span className="text-[10px] opacity-70 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="p-2 sm:p-0">
              <DistanceMap
                cluster={{
                  lat: cluster.location.lat,
                  lng: cluster.location.lng,
                  name: `${cluster.name} · ${cluster.location.name}`,
                  serotypeColor: SEROTYPES[cluster.serotypeId]?.color ?? '#dc2626',
                }}
                distanceLabel={`${fmt(cluster.distanceFromChinaKm)} km`}
                height={260}
              />
            </div>
            <p className="px-3 py-2 text-[10px] sm:text-xs text-green-300 font-medium">
              ✅ 距离极远（绿色安全区域），对中国大陆直接威胁有限
            </p>
          </details>

          {/* ─── 7-day HPI sparkline + explanation (desktop only — mobile users
                can scroll for this) ─── */}
          <div className="hidden sm:block rounded-xl bg-white text-gray-900 shadow-md p-5 mt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span className="font-medium">HPI 近 7 天趋势</span>
              <span className="font-mono">
                {hpi7DayHistory[0].value} → <b style={{ color: hpi.color }}>{hpi7DayHistory[hpi7DayHistory.length - 1].value}</b>
              </span>
            </div>
            <Sparkline
              values={hpi7DayHistory.map((d) => d.value)}
              labels={hpi7DayHistory.map((d) => d.date.slice(5))}
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
      {/* SECTION 4: Recent timeline                                        */}
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
            {recentCases.map((c) => {
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
              const subtitle = c.summary ?? (isAndes ? '安第斯型为唯一确认可人传人的汉坦病毒，需持续关注' : '该血清型不具备人际传播能力');

              return (
                <li key={c.id} className={`flex gap-3 border-l-2 pl-4 -mx-2 px-4 py-2 rounded-r-lg ${accentClass}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                      <span className="text-xs font-medium text-gray-700 font-mono">{c.date}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${seroChipClass}`}>
                        {isAndes && <span className="mr-0.5">⚠</span>}
                        {sero?.nameZh ?? c.serotypeId}
                        {sero?.nameEn && <span className="ml-1 opacity-60 text-[9px]">{sero.nameEn}</span>}
                      </span>
                      <a
                        href={c.source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-gray-400 hover:text-brand-700 hover:underline truncate max-w-[200px]"
                        title={c.source.name}
                      >
                        {c.source.name} ↗
                      </a>
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
      {/* SECTION 5: HPI Transparency Panel                                */}
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
                  ['距离因子', '30%', `${fmt(liveHpi.breakdown.distance.raw)} km`, liveHpi.breakdown.distance.score, liveHpi.breakdown.distance.weighted],
                  ['官方评估', '25%', '低风险（WHO）', liveHpi.breakdown.official.score, liveHpi.breakdown.official.weighted],
                  ['血清型风险', '20%', 'Andes（人传人+高病死率）', liveHpi.breakdown.serotype.score, liveHpi.breakdown.serotype.weighted],
                  ['旅行联通度', '15%', '需2次转机', liveHpi.breakdown.travel.score, liveHpi.breakdown.travel.weighted],
                  ['历史基线', '10%', '中国大陆 HFRS 正常范围', liveHpi.breakdown.baseline.score, liveHpi.breakdown.baseline.weighted],
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
                  <td className="py-2 text-brand-700 font-mono">{liveHpi.total}</td>
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
