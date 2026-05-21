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

/** Color stops for the 0–100 HPI scale */
const HPI_SCALE = [
  { upTo: 20, color: '#16a34a', label: '低关注' },
  { upTo: 40, color: '#0891b2', label: '一般关注' },
  { upTo: 60, color: '#ca8a04', label: '中等关注' },
  { upTo: 80, color: '#ea580c', label: '高度关注' },
  { upTo: 100, color: '#dc2626', label: '严重关注' },
];

function HpiScaleBar({ total, color }: { total: number; color: string }) {
  const pct = Math.min(100, Math.max(0, total));
  const grade = HPI_SCALE.find((g) => total <= g.upTo) ?? HPI_SCALE[HPI_SCALE.length - 1];
  const stops = HPI_SCALE.map((s, i) => {
    const prev = i === 0 ? 0 : HPI_SCALE[i - 1].upTo;
    return `${s.color} ${prev}% ${s.upTo}%`;
  }).join(', ');
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-mono text-gray-400 tabular-nums">0</span>
      <div
        className="relative flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: `linear-gradient(to right, ${stops})` }}
      >
        <span
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white"
          style={{ left: `${pct}%`, marginLeft: '-4px', boxShadow: `0 0 0 2px ${color}` }}
        />
      </div>
      <span className="text-[10px] font-mono text-gray-400 tabular-nums">100</span>
      <span className="text-[9px] text-gray-500 ml-1">{grade.label}</span>
    </div>
  );
}

export function DailyBriefSection({
  briefDate,
  hpiTotal,
  hpiGradeZh,
  hpiColor,
  content,
  highRiskDistanceText,
  highRiskDistanceContext,
}: DailyBriefSectionProps) {
  const {
    metrics,
    briefTakeaway,
    briefNewCases,
    briefSituation,
    briefRiskJudgment,
    briefSourceSummary,
    briefWatchFocus,
    briefShareLine,
    domesticBaselineText,
    briefFocusSentence,
    structuralMetricsLine,
    officialExcerpt,
    userActionHint,
  } = content;

  const [showDetails, setShowDetails] = useState(false);

  return (
    <section className="container-page mt-4 sm:mt-6">
      <div className="overflow-hidden rounded-2xl border-2 border-brand-200 bg-white shadow-md ring-1 ring-brand-100/80">
        {/* ─── Header ─── */}
        <div className="bg-slate-900 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">每日简报</p>
              <span className="text-[10px] text-slate-400">{briefDate}</span>
            </div>
            <span className="text-[11px] font-semibold text-white">
              HPI {hpiTotal} · {hpiGradeZh}
            </span>
          </div>
        </div>

        {/* ─── ① Hero: 一句话结论 ─── */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-4 sm:px-5">
          <p className="text-base sm:text-lg font-extrabold leading-snug text-white">
            {briefTakeaway || briefNewCases || '今日无新增官方通报或监测信号。'}
          </p>
          {briefSourceSummary && (
            <p className="mt-1.5 text-[10px] text-slate-400">{briefSourceSummary}</p>
          )}
        </div>

        {/* ─── ② HPI 刻度带 ─── */}
        <div className="px-4 py-2.5 sm:px-5 border-b border-gray-100">
          <HpiScaleBar total={hpiTotal} color={hpiColor} />
        </div>

        {/* ─── ③ 三列核心指标 ─── */}
        <div className="grid grid-cols-3 text-center border-b border-gray-100">
          <div className="px-2 py-3 border-r border-gray-100">
            <div className="text-[9px] text-gray-500 mb-0.5">最近威胁距离</div>
            <div className="text-sm font-extrabold text-red-700 leading-tight">{highRiskDistanceText}</div>
          </div>
          <div className="px-2 py-3 border-r border-gray-100">
            <div className="text-[9px] text-gray-500 mb-0.5">国内基线</div>
            <div className="text-sm font-extrabold text-gray-900 leading-tight">{domesticBaselineText}</div>
          </div>
          <div className="px-2 py-3">
            <div className="text-[9px] text-gray-500 mb-0.5">WHO 更新</div>
            <div className="text-sm font-extrabold text-gray-900 leading-tight">{metrics.whoDaysSinceOfficialUpdate} 天前</div>
            <p className="mt-0.5 text-[8px] text-gray-400 leading-tight">间隔属正常，本工具每日补采监测数据</p>
          </div>
        </div>

        {/* ─── ④ 24h 事件 ─── */}
        {metrics.monitoringLeads.length > 0 && (
          <div className="border-b border-gray-100">
            <div className="px-4 py-2.5 sm:px-5">
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-purple-700 mb-2">
                <Radio className="h-3 w-3" />
                待官方确认的监测动态
                <span className="rounded-full bg-purple-100 text-purple-700 px-1.5 py-0.5 normal-case font-medium">
                  {metrics.cluesLast24h} 条新信号
                </span>
              </div>
              <ul className="space-y-2">
                {metrics.monitoringLeads.map((lead) => (
                  <li key={lead.id} className="text-sm text-gray-800 leading-snug">
                    {lead.summary_zh}
                    {lead.key_facts_zh?.length > 0 && (
                      <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
                        {lead.key_facts_zh.slice(0, 3).map((f) => (
                          <span key={f} className="inline-block rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] text-purple-700">
                            {f}
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ─── ⑤ 行动建议 ─── */}
        {userActionHint && (
          <div className="px-4 py-3 sm:px-5 border-b border-gray-100 bg-emerald-50/50">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 mb-1">
              <Sparkles className="h-3 w-3" />
              行动建议
            </div>
            <p className="text-sm font-semibold text-emerald-900 leading-snug">{userActionHint}</p>
          </div>
        )}

        {/* ─── ⑥ 详情展开 ─── */}
        <div className="px-4 py-2 sm:px-5">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 py-1"
          >
            {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showDetails ? '收起详情' : '查看数据溯源与综合判断'}
          </button>
        </div>

        {showDetails && (
          <div className="px-4 pb-4 sm:px-5 space-y-3 border-t border-gray-100 pt-3">
            {officialExcerpt && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-2.5">
                <p className="text-[9px] font-medium text-gray-500 mb-1">事件摘要（collector）</p>
                <p className="text-xs text-gray-700 leading-relaxed">{officialExcerpt}</p>
              </div>
            )}

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
              <p className="text-[9px] font-medium text-slate-500 mb-1">结构指标</p>
              <p className="text-xs text-slate-700 leading-relaxed">{structuralMetricsLine}</p>
            </div>

            <div className="rounded-lg bg-gray-900 p-3 text-white">
              <p className="text-[9px] font-medium text-blue-200 mb-0.5">综合判断与风险</p>
              <p className="text-xs font-semibold leading-relaxed">{briefShareLine}</p>
              <p className="mt-1 text-[9px] text-slate-400 leading-relaxed">{briefRiskJudgment}</p>
            </div>

            <Link
              href={MV_HONDIUS_EVENT_PATH}
              className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs font-semibold text-brand-800 hover:bg-brand-100 transition-colors"
            >
              <span>查看 MV Hondius 完整事件时间线</span>
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
