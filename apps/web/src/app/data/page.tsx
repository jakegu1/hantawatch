import { SEROTYPES } from '@hantawatch/shared';
import { chinaProvinceCases, chinaHfrsHistory, recentCases } from '@/lib/mock-data';
import { calculateHpi } from '@/lib/hpi';
import { isMainlandSource } from '@/lib/link-policy';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '疫情数据',
  description: '汉坦病毒疫情数据查询。按血清型、地区、时间筛选。数据来源包括中国疾控中心、WHO、ECDC。',
};

export default function DataPage() {
  const hpi = calculateHpi({
    distanceKm: 18800,
    officialRiskLevel: 'low',
    serotypeId: 'andes',
    travelConnectivity: 'indirect',
    baselineDeviation: 'normal',
  });

  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-bold mb-2">疫情数据</h1>
      <p className="text-gray-500 text-sm mb-8">汉坦病毒疫情数据总览。数据来源均标注出处，更新时间：2026-05-12。</p>

      {/* HPI Summary */}
      <div className="card mb-6">
        <h2 className="font-semibold text-lg mb-3">HPI 汉坦逼近指数</h2>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-4xl font-extrabold" style={{ color: hpi.color }}>{hpi.total}</div>
            <div className="text-sm font-medium" style={{ color: hpi.color }}>{hpi.gradeZh}</div>
          </div>
          <div className="flex-1 text-sm text-gray-600">
            <p>基于距离、官方评估、血清型风险、旅行联通度、历史基线五因子加权计算。</p>
            <p className="mt-1">
              <a href="/about" className="text-brand-500 underline">查看完整计算方法和因子明细</a>
            </p>
          </div>
        </div>
      </div>

      {/* China HFRS (肾综合征出血热) Trend */}
      <div className="card mb-6">
        <h2 className="font-semibold text-lg mb-4">中国 HFRS（肾综合征出血热）年度趋势</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 font-medium">年度</th>
                <th className="pb-2 font-medium">报告病例</th>
                <th className="pb-2 font-medium">死亡</th>
                <th className="pb-2 font-medium">趋势</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {chinaHfrsHistory.map((d) => (
                <tr key={d.year}>
                  <td className="py-2 font-medium">{d.year}</td>
                  <td className="py-2">{d.cases.toLocaleString('zh-CN')}</td>
                  <td className="py-2">{d.deaths}</td>
                  <td className="py-2 text-gray-400">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-400">数据来源：中国疾控中心传染病月报及年度报告。HFRS（肾综合征出血热）在中国属地方性流行，发病率处于基线范围。</p>
      </div>

      {/* Serotype overview */}
      <div className="card mb-6">
        <h2 className="font-semibold text-lg mb-4">按血清型分类</h2>
        <div className="space-y-4">
          {Object.values(SEROTYPES).map((s) => (
            <div key={s.id} className="flex items-start gap-4 p-3 rounded-lg border border-gray-100">
              <div className="h-4 w-4 mt-1 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">{s.nameZh} <span className="text-gray-400 font-normal text-xs">({s.nameEn})</span></h3>
                <p className="text-xs text-gray-500 mt-1">{s.description.slice(0, 80)}...</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={`badge text-[10px] ${s.humanToHuman ? 'badge-severe' : 'badge-low'}`}>
                    {s.humanToHuman ? '⚠ 可人际传播' : '无人际传播'}
                  </span>
                  <span className="badge bg-gray-100 text-gray-700 text-[10px]">宿主: {s.primaryHost.split('(')[0].trim()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent cases */}
      <div className="card">
        <h2 className="font-semibold text-lg mb-4">最新通报</h2>
        <div className="space-y-4">
          {recentCases.map((c) => {
            // International records carry `title` (+ optional `summary`);
            // domestic records carry `notes`. Fall through both so the row
            // is never empty. For news-confidence entries we skip the
            // summary block entirely — see lib/news-format.ts for why.
            const isNewsLead = c.source?.confidence === 'news';
            const bodyText = c.title ?? c.notes ?? '';
            const summaryText = !isNewsLead && c.summary ? c.summary : '';
            return (
            <div key={c.id} className="flex gap-3 border-l-2 border-brand-200 pl-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-brand-700">{c.date}</span>
                  <span className="text-xs text-gray-400">{c.source.name} · {c.source.confidence === 'official' ? '官方通报' : '新闻线索'}</span>
                </div>
                <p className="text-sm text-gray-700">{bodyText}</p>
                {summaryText && (
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{summaryText}</p>
                )}
                {/* Link policy (see lib/link-policy.ts): mainland sources
                    render as anchor; overseas (incl. Taiwan/HK/WHO/ECDC/
                    Reuters/news.google.com …) render as plain text so we
                    don't funnel a mainland audience to overseas outbound
                    links. */}
                {c.source.url && isMainlandSource(c.source.url) && (
                  <a
                    href={c.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-500 hover:underline mt-1 inline-block"
                  >
                    查看原始来源 →
                  </a>
                )}
                {c.source.url && !isMainlandSource(c.source.url) && (
                  <span
                    className="text-xs text-gray-400 mt-1 inline-block"
                    title="境外来源不提供外链"
                  >
                    来源：{c.source.name}
                  </span>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
