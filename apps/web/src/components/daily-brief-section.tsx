'use client';

import Link from 'next/link';
import { ChevronRight, Radio, Sparkles } from 'lucide-react';
import type { BriefSectionContent } from '@hantawatch/shared/daily-brief-display';
import { MV_HONDIUS_EVENT_PATH } from '@hantawatch/shared/mv-hondius-event';
import { FeedLegend } from '@/components/feed-legend';

interface DailyBriefSectionProps {
  briefDate: string;
  hpiTotal: number;
  hpiGradeZh: string;
  hpiColor: string;
  content: BriefSectionContent;
  highRiskDistanceText: string;
  highRiskDistanceContext: string;
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
    briefHeadline24h,
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

  return (
    <section className="container-page mt-4 sm:mt-6">
      <div className="overflow-hidden rounded-2xl border-2 border-brand-200 bg-white shadow-md ring-1 ring-brand-100/80">
        <div className="bg-slate-900 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">每日简报</p>
              <h2 className="mt-1 text-lg font-bold sm:text-xl text-white">24 小时要点与风险判断</h2>
            </div>
            <div className="text-right text-[11px] text-slate-200">
              <div className="font-medium text-white">{briefDate}</div>
              <div className="font-semibold text-white">
                HPI {hpiTotal} · {hpiGradeZh}
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-200 leading-relaxed">{metrics.alertLabel}</p>
        </div>

        <div className="px-4 py-3 sm:px-5 border-b border-brand-100 bg-white">
          <FeedLegend feedId="daily-brief" compact />
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <div className="rounded-xl border-2 border-violet-200 bg-gradient-to-r from-violet-50 to-white p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-violet-700">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              24 小时要点
              {metrics.cluesLast24h > 0 && (
                <span className="rounded-full bg-violet-600 text-white px-2 py-0.5 normal-case font-semibold">
                  {metrics.cluesLast24h} 条线索
                </span>
              )}
            </div>
            <p className="mt-2 text-base sm:text-lg font-bold leading-snug text-gray-950">{briefTakeaway || briefNewCases}</p>
            <p className="mt-2 text-[11px] text-gray-600">{briefSourceSummary}</p>
          </div>

          {metrics.monitoringLeads.length > 0 && (
            <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3">
              <p className="text-[10px] font-semibold text-purple-800 flex items-center gap-1">
                <Radio className="h-3 w-3" />
                待官方确认的监测动态
              </p>
              <ul className="mt-2 space-y-2">
                {metrics.monitoringLeads.map((lead) => (
                  <li key={lead.id} className="text-sm text-gray-800 leading-snug">
                    {lead.summary_zh}
                    {lead.key_facts_zh?.length > 0 && (
                      <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                        {lead.key_facts_zh.slice(0, 4).map((f) => (
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
          )}

          {officialExcerpt && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
              <p className="text-[10px] font-medium text-gray-500">事件摘要（collector）</p>
              <p className="mt-1 text-sm text-gray-700 leading-relaxed">{officialExcerpt}</p>
            </div>
          )}

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-[10px] font-medium text-slate-500">结构指标（较慢变化）</p>
            <p className="mt-1 text-xs text-slate-700 leading-relaxed">{structuralMetricsLine}</p>
            <p className="mt-1.5 text-[9px] text-slate-400">
              HPI / 距离均为 collector 原始值；
              前端 HPI 已基于输入监测动态调整（见顶部 Badge）。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-red-50 p-2.5 ring-1 ring-red-100">
              <div className="text-[10px] text-red-700 font-medium">最近高危病毒活动</div>
              <div className="mt-1 text-sm font-extrabold leading-tight text-red-700">{highRiskDistanceText}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-gray-600">{highRiskDistanceContext}</div>
            </div>
            <div className="rounded-xl bg-orange-50 p-2.5 ring-1 ring-orange-100 sm:col-span-1">
              <div className="text-[10px] text-orange-700 font-medium">当前态势</div>
              <div className="mt-1 text-sm font-bold leading-relaxed text-gray-900">{briefSituation}</div>
            </div>
            <div className="rounded-xl bg-green-50 p-2.5 ring-1 ring-green-100">
              <div className="text-[10px] text-green-700 font-medium">中国风险</div>
              <div className="mt-1 text-sm font-bold" style={{ color: hpiColor }}>
                {hpiTotal} · {hpiGradeZh}
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-gray-600">
                {domesticBaselineText}；{briefRiskJudgment}
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-2.5 ring-1 ring-gray-100">
              <div className="text-[10px] text-gray-500 font-medium">今日关注</div>
              <div className="mt-1 text-sm font-bold leading-relaxed text-gray-900">{briefFocusSentence}</div>
            </div>
          </div>

          <div className="rounded-xl bg-gray-900 p-4 text-white">
            <p className="text-[10px] font-medium text-blue-200">综合判断</p>
            <p className="mt-1 text-sm font-semibold leading-relaxed">{briefShareLine}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {briefWatchFocus.slice(0, 3).map((item) => (
                <span key={item} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-blue-50">
                  {item}
                </span>
              ))}
            </div>
          </div>

          {userActionHint && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
              <p className="text-[10px] font-medium text-emerald-700">行动建议</p>
              <p className="mt-1 text-sm font-semibold text-emerald-900 leading-snug">{userActionHint}</p>
            </div>
          )}

          <Link
            href={MV_HONDIUS_EVENT_PATH}
            className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800 hover:bg-brand-100 transition-colors"
          >
            <span>查看 MV Hondius 完整事件时间线与各国病例表</span>
            <ChevronRight className="h-4 w-4 flex-shrink-0" />
          </Link>
        </div>
      </div>
    </section>
  );
}
