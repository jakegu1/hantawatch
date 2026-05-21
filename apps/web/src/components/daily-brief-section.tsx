'use client';

import Link from 'next/link';
import { ChevronRight, Radio, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { BriefSectionContent } from '@hantawatch/shared/daily-brief-display';
import { MV_HONDIUS_EVENT_PATH } from '@hantawatch/shared/mv-hondius-event';

interface DailyBriefSectionProps {
  briefDate: string;
  hpiTotal: number;
  hpiGradeZh: string;
  hpiColor: string;
  content: BriefSectionContent;
  highRiskDistanceText: string;
  highRiskDistanceContext: string;
}

const HPI_SCALE = [
  { upTo: 20, color: '#16a34a', label: '低关注' },
  { upTo: 40, color: '#0891b2', label: '一般关注' },
  { upTo: 60, color: '#ca8a04', label: '中等关注' },
  { upTo: 80, color: '#ea580c', label: '高度关注' },
  { upTo: 100, color: '#dc2626', label: '严重关注' },
];

function HpiScaleBar({ total, color }: { total: number; color: string }) {
  const pct = Math.min(100, Math.max(0, total));
  const stops = HPI_SCALE.map((s, i) => {
    const prev = i === 0 ? 0 : HPI_SCALE[i - 1].upTo;
    return `${s.color} ${prev}% ${s.upTo}%`;
  }).join(', ');
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-mono text-gray-400 tabular-nums">0</span>
      <div className="relative flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: `linear-gradient(to right, ${stops})` }}>
        <span className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white" style={{ left: `${pct}%`, marginLeft: '-4px', boxShadow: `0 0 0 2px ${color}` }} />
      </div>
      <span className="text-[10px] font-mono text-gray-400 tabular-nums">100</span>
    </div>
  );
}

export function DailyBriefSection({
  briefDate, hpiTotal, hpiGradeZh, hpiColor,
  content, highRiskDistanceText, highRiskDistanceContext,
}: DailyBriefSectionProps) {
  const {
    metrics, briefTakeaway, briefNewCases, briefSituation,
    briefRiskJudgment, briefShareLine, domesticBaselineText,
    structuralMetricsLine, officialExcerpt, userActionHint,
    caseTable, caseTableSummary,
  } = content;
  const [showDetails, setShowDetails] = useState(false);

  return (
    <section className="container-page mt-4 sm:mt-6">
      <div className="overflow-hidden rounded-2xl border-2 border-brand-200 bg-white shadow-md">
        {/* ─── Header ─── */}
        <div className="bg-slate-900 px-4 py-3 sm:px-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">每日简报</p>
            <span className="text-[10px] text-slate-400">{briefDate}</span>
          </div>
          <span className="text-[11px] font-semibold text-white">HPI {hpiTotal} · {hpiGradeZh}</span>
        </div>

        {/* ─── ① Google AI Mode narrative: 当前态势总结 ─── */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-4 sm:px-5 space-y-2">
          <p className="text-sm sm:text-base font-semibold leading-relaxed text-white">
            {briefShareLine || briefTakeaway || briefNewCases}
          </p>
          <p className="text-[11px] text-slate-300 leading-relaxed">{briefSituation}</p>
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span>{metrics.alertLabel}</span>
            <span className="text-slate-500">|</span>
            <span>WHO / ECDC：对公众风险极低</span>
          </div>
        </div>

        {/* ─── ② HPI + 三指标 ─── */}
        <div className="px-4 py-2.5 sm:px-5 border-b border-gray-100"><HpiScaleBar total={hpiTotal} color={hpiColor} /></div>
        <div className="grid grid-cols-3 text-center border-b border-gray-100">
          {[['最近威胁距离', highRiskDistanceText, 'text-red-700'],
            ['国内基线', domesticBaselineText, 'text-gray-900'],
            ['WHO 更新', `${metrics.whoDaysSinceOfficialUpdate} 天前`, 'text-gray-900']].map(([label, val, cls], i) => (
            <div key={i} className={`px-2 py-3 ${i < 2 ? 'border-r border-gray-100' : ''}`}>
              <div className="text-[9px] text-gray-500 mb-0.5">{label}</div>
              <div className={`text-sm font-extrabold leading-tight ${cls}`}>{val}</div>
            </div>
          ))}
        </div>

        {/* ─── ③ 病例动态 — 按国家/事件分列（Google AI Mode 风格） ─── */}
        <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">病例与监测动态</p>
            <span className="text-[9px] text-gray-400">
              安第斯确诊 {caseTableSummary.totalConfirmed} · 监测 {caseTableSummary.totalMonitoring} · 死亡 {caseTableSummary.totalDeaths}
            </span>
          </div>
          <div className="space-y-2">
            {caseTable.slice(0, 7).map((row, i) => (
              <div key={i} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-[10px] font-mono text-gray-400 w-8 flex-shrink-0 pt-0.5">{row.date.slice(5)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-900">{row.countryNameZh}</span>
                    <span className="text-[9px] text-gray-400">{row.serotypeLabel}</span>
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[8px] text-gray-500">{row.sourceType}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">{row.sourceName}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 text-right">
                  {row.totalConfirmed > 0 && (
                    <span className="text-[10px] font-mono font-bold text-red-600">{row.totalConfirmed} 确诊</span>
                  )}
                  {row.monitoring > 0 && (
                    <span className="text-[10px] font-mono text-blue-600">{row.monitoring} 监测</span>
                  )}
                  {row.deaths > 0 && (
                    <span className="text-[10px] font-mono font-bold text-gray-900">{row.deaths} 死亡</span>
                  )}
                  {row.totalConfirmed === 0 && row.monitoring === 0 && row.deaths === 0 && (
                    <span className="text-[10px] text-gray-300">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── ④ 监测动态 ─── */}
        {metrics.monitoringLeads.length > 0 && (
          <div className="border-b border-gray-100 px-4 py-2.5 sm:px-5 bg-purple-50/30">
            <p className="text-[10px] font-semibold text-purple-700 mb-2 flex items-center gap-1">
              <Radio className="h-3 w-3" /> 待官方确认的监测动态
            </p>
            {metrics.monitoringLeads.map((lead) => (
              <div key={lead.id} className="text-xs text-gray-800 leading-snug mb-1">
                {lead.summary_zh}
                {lead.key_facts_zh?.length > 0 && (
                  <span className="ml-1.5 inline-flex flex-wrap gap-1">
                    {lead.key_facts_zh.slice(0, 3).map((f) => (
                      <span key={f} className="inline-block rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] text-purple-700">{f}</span>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ─── ⑤ 行动建议 ─── */}
        {userActionHint && (
          <div className="px-4 py-3 sm:px-5 border-b border-gray-100 bg-emerald-50/50">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 mb-1">
              <Sparkles className="h-3 w-3" /> 行动建议
            </div>
            <p className="text-sm font-semibold text-emerald-900 leading-snug">{userActionHint}</p>
          </div>
        )}

        {/* ─── ⑥ 展开详情 ─── */}
        <div className="px-4 py-2 sm:px-5">
          <button type="button" onClick={() => setShowDetails(v => !v)} className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 py-1">
            {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showDetails ? '收起' : '数据溯源与综合判断'}
          </button>
        </div>
        {showDetails && (
          <div className="px-4 pb-4 sm:px-5 space-y-3 border-t border-gray-100 pt-3">
            {officialExcerpt && (
              <div className="rounded-lg bg-gray-50 p-2.5"><p className="text-[9px] text-gray-500 mb-1">事件摘要</p><p className="text-xs text-gray-700">{officialExcerpt}</p></div>
            )}
            <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-[9px] text-slate-500 mb-1">结构指标</p><p className="text-xs text-slate-700">{structuralMetricsLine}</p></div>
            <Link href={MV_HONDIUS_EVENT_PATH} className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs font-semibold text-brand-800">
              <span>查看 MV Hondius 完整事件时间线</span><ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
