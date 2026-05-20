'use client';

import { Bell } from 'lucide-react';
import { buildBriefSectionContent } from '@hantawatch/shared/daily-brief-display';
import { useMemo } from 'react';
import {
  activeClusters,
  dataMeta,
  hondiusImportSummaries,
  realtimeFeed,
  todayBrief,
} from '@/lib/data';
import { useLiveRecentCases } from '@/lib/use-live-recent-cases';
import { RecentCasesTimeline } from '@/components/recent-cases-timeline';

export function DataRecentCasesSection() {
  const liveRecentCases = useLiveRecentCases();
  const cluster = activeClusters[0];

  const briefContent = useMemo(
    () =>
      buildBriefSectionContent({
        briefDate: todayBrief.date,
        oneLine: todayBrief.oneLine,
        latestChange: todayBrief.latestChange,
        daysSinceLastIntlAlert: todayBrief.daysSinceLastIntlAlert,
        clusterLastUpdate: cluster?.lastUpdate,
        domesticBaselineStatus: todayBrief.domesticBaselineStatus,
        recentCases: liveRecentCases,
        realtimeUpdates: realtimeFeed.updates,
        importSummaries: hondiusImportSummaries,
        hpiTotal: 0,
      }),
    [liveRecentCases, cluster?.lastUpdate],
  );

  const metrics = briefContent.metrics;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Bell className="h-4 w-4 text-brand-500" />
          最新通报
        </h2>
        <span className="text-[11px] text-gray-400">与首页同步 · 按日期倒序</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        数据更新：{dataMeta.lastCollectedAtCn?.replace('T', ' ').slice(0, 19) ?? dataMeta.lastCollectedAt} · {metrics.alertLabel}
      </p>
      <RecentCasesTimeline cases={liveRecentCases} monitoringLeads={metrics.monitoringLeads} showFilter />
      <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
        与首页「最新通报」使用相同排序与折叠规则；管理后台增删条目无需重新部署即可在此看到。
      </p>
    </div>
  );
}
