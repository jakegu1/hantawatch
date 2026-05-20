/**
 * 最新通报时间线 — 与 apps/web RecentCasesTimeline 共用 @hantawatch/shared/timeline 规则。
 */

import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { SEROTYPES } from '@hantawatch/shared';
import { buildTimelineRows, type MonitoringLead, type TimelineRow } from '@hantawatch/shared/timeline';
import { isMainlandSource } from '@/lib/link-policy';
import type { RecentCase } from '@/lib/data';

interface Props {
  cases: RecentCase[];
  monitoringLeads?: MonitoringLead[];
  maxRows?: number;
}

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

function copyUrl(url: string) {
  if (!url) return;
  Taro.setClipboardData({ data: url })
    .then(() => Taro.showToast({ title: '链接已复制', icon: 'success', duration: 1500 }))
    .catch(() => {});
}

function CaseRow({ c }: { c: RecentCase }) {
  const sero = SEROTYPES[c.serotypeId];
  const isAndes = c.serotypeId === 'andes';
  const isIntl = c.scope === 'international';
  const isNewsLead = c.source?.confidence === 'news';
  const isSurveillanceLead = c.source?.confidence === 'surveillance';

  const accentColor = isAndes ? '#ef4444' : isIntl ? '#60a5fa' : '#d1d5db';
  const accentBg = isAndes ? 'rgba(254, 226, 226, 0.5)' : isIntl ? 'rgba(219, 234, 254, 0.3)' : 'transparent';

  const scopeBadge = isNewsLead
    ? { label: '新闻线索', bg: '#fef3c7', color: '#b45309' }
    : isSurveillanceLead
      ? { label: '专业监测', bg: '#f3e8ff', color: '#7c3aed' }
      : isIntl
        ? { label: '官方通报', bg: isAndes ? '#fee2e2' : '#dbeafe', color: isAndes ? '#991b1b' : '#1e40af' }
        : { label: '国内通报', bg: '#dcfce7', color: '#166534' };

  const title = c.title ?? c.notes ?? '';
  const subtitle = isNewsLead
    ? null
    : c.summary
      ? c.summary
      : isAndes
        ? '安第斯型为唯一确认可人传人的汉坦病毒，需持续关注'
        : '该血清型不具备人际传播能力';

  const canLink = c.source?.url && isMainlandSource(c.source.url);

  return (
    <View
      style={{
        borderLeft: `4rpx solid ${accentColor}`,
        background: accentBg,
        padding: '12rpx 16rpx',
        marginBottom: '12rpx',
        borderRadius: '0 8rpx 8rpx 0',
      }}
    >
      <View className="flex flex-wrap items-center gap-2 mb-1">
        <Text style={{ fontSize: '22rpx', fontWeight: 500, color: '#374151', fontFamily: 'monospace' }}>{c.date}</Text>
        <Text
          style={{
            background: isAndes ? '#fef2f2' : '#f9fafb',
            color: isAndes ? '#b91c1c' : '#4b5563',
            borderRadius: '100rpx',
            padding: '2rpx 10rpx',
            fontSize: '20rpx',
            fontWeight: isAndes ? 600 : 400,
          }}
        >
          {isAndes && '⚠ '}{sero?.nameZh ?? c.serotypeId}
        </Text>
        <View style={{ marginLeft: 'auto' }}>
          <Text style={{ background: scopeBadge.bg, color: scopeBadge.color, borderRadius: '100rpx', padding: '2rpx 12rpx', fontSize: '20rpx', fontWeight: 500 }}>
            {scopeBadge.label}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: '26rpx', color: '#1f2937', fontWeight: 500, lineHeight: 1.4, display: 'block' }}>{title}</Text>
      {subtitle && (
        <Text style={{ fontSize: '22rpx', color: '#6b7280', marginTop: '4rpx', lineHeight: 1.6, display: 'block' }}>{subtitle}</Text>
      )}
      {canLink && (
        <View className="mt-1" onClick={() => copyUrl(c.source.url)}>
          <Text style={{ fontSize: '20rpx', color: '#1e40af' }}>🔗 查看原文（点击复制链接）</Text>
        </View>
      )}
    </View>
  );
}

function GroupRow({ row }: { row: Extract<TimelineRow, { kind: 'group' }> }) {
  const [open, setOpen] = useState(false);
  return (
    <View
      style={{
        borderLeft: '4rpx solid #ef4444',
        background: 'rgba(254, 226, 226, 0.45)',
        padding: '12rpx 16rpx',
        marginBottom: '12rpx',
        borderRadius: '0 8rpx 8rpx 0',
      }}
    >
      <View className="flex flex-wrap items-center gap-2 mb-1">
        <Text style={{ fontSize: '22rpx', fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>{row.latestDate}</Text>
        <Text style={{ fontSize: '20rpx', color: '#6b7280' }}>WHO 共 {row.cases.length} 次更新</Text>
        <View style={{ marginLeft: 'auto' }}>
          <Text style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '100rpx', padding: '2rpx 12rpx', fontSize: '20rpx' }}>官方通报</Text>
        </View>
      </View>
      <Text style={{ fontSize: '26rpx', fontWeight: 600, color: '#111827', display: 'block' }}>{row.title}</Text>
      {row.latestSummary && (
        <Text style={{ fontSize: '22rpx', color: '#4b5563', marginTop: '6rpx', lineHeight: 1.5, display: 'block' }}>{row.latestSummary}</Text>
      )}
      <View onClick={() => setOpen((v) => !v)}>
        <Text style={{ fontSize: '20rpx', color: '#1e40af', marginTop: '8rpx', display: 'block' }}>
          {open ? '收起历次 WHO 更新' : `展开历次 WHO 更新（${row.cases.length}）`}
        </Text>
      </View>
      {open &&
        row.cases.map((c) => (
          <Text key={c.id} style={{ fontSize: '20rpx', color: '#6b7280', marginTop: '6rpx', display: 'block' }}>
            {c.date} · {(c.summary ?? c.title ?? '').slice(0, 80)}
          </Text>
        ))}
    </View>
  );
}

export function RecentCasesList({ cases, monitoringLeads = [], maxRows }: Props) {
  const rows = useMemo(() => buildTimelineRows(cases), [cases]);
  const displayRows = maxRows ? rows.slice(0, maxRows) : rows;

  return (
    <View>
      <View className="flex flex-wrap items-center gap-2 mb-3">
        <Text style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: '100rpx', padding: '2rpx 12rpx', fontSize: '20rpx' }}>⚠ 安第斯型</Text>
        <Text style={{ background: '#dbeafe', color: '#1e40af', borderRadius: '100rpx', padding: '2rpx 12rpx', fontSize: '20rpx' }}>官方通报</Text>
        <Text style={{ background: '#f3e8ff', color: '#7c3aed', borderRadius: '100rpx', padding: '2rpx 12rpx', fontSize: '20rpx' }}>专业监测</Text>
        <Text style={{ background: '#fef3c7', color: '#b45309', borderRadius: '100rpx', padding: '2rpx 12rpx', fontSize: '20rpx' }}>新闻线索</Text>
        <Text style={{ background: '#faf5ff', color: '#7c3aed', borderRadius: '100rpx', padding: '2rpx 12rpx', fontSize: '20rpx' }}>监测动态</Text>
      </View>

      {monitoringLeads.map((lead) => (
        <View
          key={lead.id}
          style={{
            borderLeft: '4rpx solid #a855f7',
            background: 'rgba(243, 232, 255, 0.65)',
            padding: '12rpx 16rpx',
            marginBottom: '12rpx',
            borderRadius: '0 8rpx 8rpx 0',
          }}
        >
          <View className="flex flex-wrap items-center gap-2 mb-1">
            <Text style={{ fontSize: '20rpx', fontFamily: 'monospace', color: '#6b21a8' }}>{fmtMonitoringTime(lead.time)}</Text>
            <Text style={{ background: '#f3e8ff', color: '#7c3aed', borderRadius: '100rpx', padding: '2rpx 10rpx', fontSize: '18rpx' }}>
              监测动态（待官方确认）
            </Text>
          </View>
          <Text style={{ fontSize: '26rpx', fontWeight: 500, color: '#1f2937', display: 'block' }}>{lead.summary_zh}</Text>
        </View>
      ))}

      {displayRows.map((row) =>
        row.kind === 'group' ? <GroupRow key={row.groupId} row={row} /> : <CaseRow key={row.case.id} c={row.case} />,
      )}

      <Text className="text-xs text-gray-400 mt-3" style={{ display: 'block', lineHeight: 1.6 }}>
        默认按日期倒序；同一邮轮事件的多次 WHO 更新已折叠。监测动态来自实时抓取，请以蓝色「官方通报」为准。
      </Text>
    </View>
  );
}
