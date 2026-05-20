import Link from 'next/link';
import { ArrowLeft, Ship } from 'lucide-react';
import {
  buildImportTable,
  buildOutbreakSummary,
  buildWhoTimeline,
} from '@hantawatch/shared/mv-hondius-event';
import {
  activeClusters,
  dataMeta,
  hondiusImports,
  hondiusOutbreakName,
  recentCases,
} from '@/lib/data';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MV Hondius 邮轮安第斯型聚集疫情',
  description:
    'MV Hondius 邮轮汉坦病毒（安第斯型）聚集性疫情完整时间线：WHO DON 历次更新、各国输入与监测病例表。',
};

export default function MvHondiusEventPage() {
  const cluster = activeClusters.find((c) => c.id === 'mv-hondius-2026') ?? activeClusters[0];
  const whoTimeline = buildWhoTimeline(recentCases);
  const importRows = buildImportTable(hondiusImports);
  const summary = buildOutbreakSummary(cluster, whoTimeline, importRows);
  const updatedAt = dataMeta.lastCollectedAtCn?.replace('T', ' ').slice(0, 19) ?? dataMeta.lastCollectedAt;

  return (
    <div className="container-page py-6 sm:py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        返回首页
      </Link>

      <div className="flex items-start gap-3 mb-6">
        <div className="rounded-xl bg-red-100 p-3 text-red-700">
          <Ship className="h-8 w-8" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">聚集性疫情事件页</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-0.5">{hondiusOutbreakName}</h1>
          <p className="text-sm text-gray-500 mt-1">
            安第斯型（Andes）· 唯一确认可人传人的汉坦病毒 · 数据更新 {updatedAt}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: '聚集确诊（官方）', value: summary.confirmedCases, sub: `+ 可能 ${summary.suspectedCases}` },
          { label: '死亡', value: summary.deaths, sub: 'WHO 通报口径' },
          { label: '距中国大陆', value: `${summary.distanceFromChinaKm.toLocaleString('zh-CN')} km`, sub: '疫情源头' },
          { label: 'WHO 更新', value: summary.whoUpdates, sub: `最近 ${summary.lastOfficialUpdate}` },
        ].map((s) => (
          <div key={s.label} className="card text-center py-4">
            <div className="text-2xl font-extrabold text-gray-900">{s.value}</div>
            <div className="text-xs font-medium text-gray-600 mt-1">{s.label}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      <section className="card mb-8">
        <h2 className="font-semibold text-lg mb-1">WHO 官方通报时间线</h2>
        <p className="text-xs text-gray-500 mb-4">按发布日期倒序；与首页「最新通报」中折叠的 MV Hondius 条目同源。</p>
        <ol className="space-y-4">
          {whoTimeline.map((entry, i) => (
            <li key={entry.id} className="relative pl-6 border-l-2 border-red-300 pb-4 last:pb-0">
              <span className="absolute -left-[7px] top-0 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />
              {i === 0 && (
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-wide">最近</span>
              )}
              <div className="font-mono text-xs text-gray-500">{entry.date}</div>
              <h3 className="font-semibold text-gray-900 mt-0.5">{entry.title}</h3>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">{entry.summary}</p>
              <p className="text-[10px] text-gray-400 mt-2">{entry.sourceName}</p>
            </li>
          ))}
        </ol>
        {whoTimeline.length === 0 && (
          <p className="text-sm text-gray-500">暂无 WHO DON 记录，请稍后刷新。</p>
        )}
      </section>

      <section className="card mb-8">
        <h2 className="font-semibold text-lg mb-1">各国输入与监测（病例表）</h2>
        <p className="text-xs text-gray-500 mb-4">
          人工维护清单（`mv-hondius-imports.json`），依据 WHO 与各国卫生机构公告更新。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b text-gray-500 text-xs">
                <th className="py-2 pr-3 font-medium">国家/地区</th>
                <th className="py-2 pr-3 font-medium">更新日</th>
                <th className="py-2 pr-3 font-medium">状态</th>
                <th className="py-2 pr-3 font-medium text-right">确诊输入</th>
                <th className="py-2 pr-3 font-medium text-right">监测/隔离</th>
                <th className="py-2 font-medium">摘要</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {importRows.map((row) => (
                <tr key={row.iso2} className="align-top">
                  <td className="py-3 pr-3 font-semibold text-gray-800">{row.iso2}</td>
                  <td className="py-3 pr-3 font-mono text-xs text-gray-600">{row.date}</td>
                  <td className="py-3 pr-3">
                    <span className="text-xs rounded-full bg-brand-50 text-brand-800 px-2 py-0.5 ring-1 ring-brand-100">
                      {row.statusZh}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right font-mono">{row.confirmedImports}</td>
                  <td className="py-3 pr-3 text-right text-xs text-gray-600">
                    {row.monitoringCount != null && `监测 ${row.monitoringCount}`}
                    {row.quarantineCount != null && ` · 隔离 ${row.quarantineCount}`}
                    {row.monitoringCount == null && row.quarantineCount == null && '—'}
                  </td>
                  <td className="py-3 text-gray-700 text-xs leading-relaxed max-w-md">{row.summary_zh}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {importRows.length === 0 && <p className="text-sm text-gray-500 mt-2">暂无各国输入记录。</p>}
      </section>

      <p className="text-xs text-gray-400 leading-relaxed">
        本页为事件专题归档，不构成医疗建议。关键判断请以 WHO 疾病暴发新闻（DON）为准。
        首页每日简报与本事件页数据同步，采集周期见{' '}
        <Link href="/about" className="text-brand-600 underline">
          关于页
        </Link>
        。
      </p>
    </div>
  );
}
