'use client';

import { useMemo, useState } from 'react';
import { SEROTYPES } from '@hantawatch/shared';
import {
  buildTimelineRows,
  filterOfficialTimelineCases,
  type MonitoringLead,
  type TimelineRow,
} from '@hantawatch/shared/timeline';
import { isMainlandSource } from '@/lib/link-policy';
import { relativeTimeZh } from '@/lib/nearest-cluster';
import type { TimelineCase } from '@hantawatch/shared/timeline';

function fmtMonitoringTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const cn = new Date(d.getTime() + 8 * 3600_000);
    const m = String(cn.getUTCMonth() + 1).padStart(2, '0');
    const day = String(cn.getUTCDate()).padStart(2, '0');
    const hh = String(cn.getUTCHours()).padStart(2, '0');
    const mm = String(cn.getUTCMinutes()).padStart(2, '0');
    return `${m}-${day} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

interface RecentCasesTimelineProps {
  cases: TimelineCase[];
  monitoringLeads?: MonitoringLead[];
  maxRows?: number;
  showFilter?: boolean;
}

function CaseRow({ c }: { c: TimelineCase }) {
  const sero = SEROTYPES[c.serotypeId as keyof typeof SEROTYPES];
  const isAndes = c.serotypeId === 'andes';
  const isIntl = c.scope === 'international';
  const isNewsLead = c.source?.confidence === 'news';
  const isSurveillanceLead = c.source?.confidence === 'surveillance';
  const scopeBadge = isNewsLead
    ? { label: '新闻线索', cls: 'bg-amber-100 text-amber-800' }
    : isSurveillanceLead
      ? { label: '专业监测', cls: 'bg-purple-100 text-purple-800' }
      : isIntl
        ? { label: '官方通报', cls: isAndes ? 'badge-severe' : 'badge-elevated' }
        : { label: '国内通报', cls: 'badge-low' };

  const seroChipClass = isAndes
    ? 'bg-red-50 text-red-700 ring-red-200 font-semibold'
    : 'bg-gray-50 text-gray-600 ring-gray-200';

  const accentClass = isAndes
    ? 'border-l-red-500 bg-red-50/50'
    : isIntl
      ? 'border-l-brand-400 bg-brand-50/30'
      : 'border-l-gray-300';

  const title = c.title ?? c.notes ?? '';
  const subtitle = isNewsLead
    ? null
    : c.summary
      ? c.summary
      : isAndes
        ? '安第斯型为唯一确认可人传人的汉坦病毒，需持续关注'
        : '该血清型不具备人际传播能力';

  return (
    <li className={`flex gap-3 border-l-2 pl-4 -mx-2 px-4 py-2 rounded-r-lg ${accentClass}`}>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            <span className="font-medium text-gray-700 font-mono">{c.date}</span>
            <span className="text-gray-300">·</span>
            <span suppressHydrationWarning>🔄 系统核查 {relativeTimeZh(c.source.retrievedAt)}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${seroChipClass}`}>
            {isAndes && <span className="mr-0.5">⚠</span>}
            {sero?.nameZh ?? c.serotypeId}
          </span>
          {isMainlandSource(c.source.url) ? (
            <a
              href={c.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-gray-400 hover:text-brand-700 hover:underline truncate max-w-[200px]"
            >
              {c.source.name} ↗
            </a>
          ) : (
            <span className="text-[10px] text-gray-400 truncate max-w-[200px]">{c.source.name}</span>
          )}
        </div>
        <p className="text-sm text-gray-800 font-medium leading-snug">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{subtitle}</p>}
      </div>
      <span className={`badge text-[10px] self-start flex-shrink-0 ${scopeBadge.cls}`}>{scopeBadge.label}</span>
    </li>
  );
}

function GroupRow({ row }: { row: Extract<TimelineRow, { kind: 'group' }> }) {
  const [open, setOpen] = useState(false);
  const latest = row.cases[0];
  const isAndes = latest.serotypeId === 'andes';

  return (
    <li className="border-l-2 border-l-red-500 bg-red-50/40 -mx-2 px-4 py-2 rounded-r-lg">
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1 text-[11px] text-gray-500">
            <span className="font-mono font-medium text-gray-700">{row.latestDate}</span>
            <span className="text-gray-400">WHO 共 {row.cases.length} 次更新</span>
          </div>
          <p className="text-sm font-semibold text-gray-900">{row.title}</p>
          {row.latestSummary && (
            <p className="text-xs text-gray-600 mt-1 leading-relaxed line-clamp-3">{row.latestSummary}</p>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 text-[11px] text-brand-600 hover:underline"
          >
            {open ? '收起历次 WHO 更新' : `展开历次 WHO 更新（${row.cases.length}）`}
          </button>
          {open && (
            <ul className="mt-2 space-y-2 border-t border-red-100 pt-2">
              {row.cases.map((c) => (
                <li key={c.id} className="text-xs text-gray-600">
                  <span className="font-mono text-gray-800">{c.date}</span>
                  <span className="mx-1">·</span>
                  {c.summary ? c.summary.slice(0, 120) + (c.summary.length > 120 ? '…' : '') : c.title}
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className={`badge text-[10px] self-start ${isAndes ? 'badge-severe' : 'badge-elevated'}`}>官方通报</span>
      </div>
    </li>
  );
}

export function RecentCasesTimeline({
  cases,
  monitoringLeads = [],
  maxRows,
  showFilter = true,
}: RecentCasesTimelineProps) {
  const [officialOnly, setOfficialOnly] = useState(false);

  const filteredCases = useMemo(
    () => (officialOnly ? filterOfficialTimelineCases(cases) : cases),
    [cases, officialOnly],
  );

  const rows = useMemo(() => buildTimelineRows(filteredCases), [filteredCases]);
  const displayRows = maxRows ? rows.slice(0, maxRows) : rows;

  return (
    <div>
      {showFilter && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => setOfficialOnly(false)}
            className={`text-[10px] px-2.5 py-1 rounded-full ring-1 ${
              !officialOnly ? 'bg-brand-50 text-brand-800 ring-brand-200 font-medium' : 'bg-gray-50 text-gray-500 ring-gray-200'
            }`}
          >
            全部（按日期）
          </button>
          <button
            type="button"
            onClick={() => setOfficialOnly(true)}
            className={`text-[10px] px-2.5 py-1 rounded-full ring-1 ${
              officialOnly ? 'bg-brand-50 text-brand-800 ring-brand-200 font-medium' : 'bg-gray-50 text-gray-500 ring-gray-200'
            }`}
          >
            仅官方 + 国内
          </button>
        </div>
      )}

      {monitoringLeads.length > 0 && (
        <ul className="space-y-2 mb-4">
          {monitoringLeads.map((lead) => (
            <li
              key={lead.id}
              className="flex gap-3 border-l-2 border-l-purple-400 bg-purple-50/60 pl-4 py-2 rounded-r-lg -mx-2 px-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1 text-[10px] text-purple-800">
                  <span className="font-mono">{fmtMonitoringTime(lead.time)}</span>
                  <span className="badge bg-purple-100 text-purple-800 text-[10px]">监测动态（待官方确认）</span>
                </div>
                <p className="text-sm font-medium text-gray-900 leading-snug">{lead.summary_zh}</p>
                {lead.key_facts_zh.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {lead.key_facts_zh.map((tag) => (
                      <span key={tag} className="text-[10px] bg-white/80 text-purple-700 px-1.5 py-0.5 rounded-full ring-1 ring-purple-100">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ol className="space-y-3">
        {displayRows.map((row) =>
          row.kind === 'group' ? <GroupRow key={row.groupId} row={row} /> : <CaseRow key={row.case.id} c={row.case} />,
        )}
      </ol>
    </div>
  );
}
