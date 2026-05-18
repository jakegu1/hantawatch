/**
 * 最新通报时间线 — Taro port of the recent-cases section from
 * apps/web/src/app/page.tsx.
 *
 * Visual rules:
 *   - Andes rows get a red left border
 *   - Other international rows get a brand-blue left border
 *   - Domestic rows get a neutral gray left border
 *   - "新闻线索" rows wear an amber chip
 *   - "官方通报" rows wear a blue/severity chip
 *
 * Click on the row's "来源" footer to copy the source URL to clipboard
 * (miniapps can't open arbitrary external URLs).
 */

import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { SEROTYPES } from '@hantawatch/shared';
import { isMainlandSource } from '@/lib/link-policy';
import type { RecentCase } from '@/lib/data';

interface Props {
  cases: RecentCase[];
}

function copyUrl(url: string) {
  if (!url) return;
  Taro.setClipboardData({ data: url })
    .then(() => Taro.showToast({ title: '链接已复制', icon: 'success', duration: 1500 }))
    .catch(() => {});
}

export function RecentCasesList({ cases }: Props) {
  return (
    <View>
      {/* Legend */}
      <View className="flex flex-wrap items-center gap-2 mb-3">
        <Text
          style={{
            background: '#fef2f2',
            color: '#b91c1c',
            border: '1rpx solid #fecaca',
            borderRadius: '100rpx',
            padding: '2rpx 12rpx',
            fontSize: '20rpx',
            fontWeight: 500,
          }}
        >
          ⚠ 安第斯型（人传人）
        </Text>
        <Text
          style={{
            background: '#f9fafb',
            color: '#4b5563',
            border: '1rpx solid #e5e7eb',
            borderRadius: '100rpx',
            padding: '2rpx 12rpx',
            fontSize: '20rpx',
          }}
        >
          其他血清型
        </Text>
        <Text style={{ color: '#d1d5db', fontSize: '20rpx' }}>·</Text>
        <Text
          style={{
            background: '#dbeafe',
            color: '#1e40af',
            borderRadius: '100rpx',
            padding: '2rpx 12rpx',
            fontSize: '20rpx',
            fontWeight: 500,
          }}
        >
          官方通报
        </Text>
        <Text
          style={{
            background: '#fef3c7',
            color: '#b45309',
            borderRadius: '100rpx',
            padding: '2rpx 12rpx',
            fontSize: '20rpx',
            fontWeight: 500,
          }}
        >
          新闻线索
        </Text>
      </View>

      {cases.map((c) => {
        const sero = SEROTYPES[c.serotypeId];
        const isAndes = c.serotypeId === 'andes';
        const isIntl = c.scope === 'international';
        const isNewsLead = c.source?.confidence === 'news';

        const accentColor = isAndes ? '#ef4444' : isIntl ? '#60a5fa' : '#d1d5db';
        const accentBg = isAndes
          ? 'rgba(254, 226, 226, 0.5)'
          : isIntl
            ? 'rgba(219, 234, 254, 0.3)'
            : 'transparent';

        const seroChipBg = isAndes ? '#fef2f2' : '#f9fafb';
        const seroChipColor = isAndes ? '#b91c1c' : '#4b5563';

        const scopeBadge = isNewsLead
          ? { label: '新闻线索', bg: '#fef3c7', color: '#b45309' }
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
            key={c.id}
            style={{
              borderLeft: `4rpx solid ${accentColor}`,
              background: accentBg,
              padding: '12rpx 16rpx',
              marginBottom: '12rpx',
              borderRadius: '0 8rpx 8rpx 0',
            }}
          >
            <View className="flex flex-wrap items-center gap-2 mb-1">
              <Text style={{ fontSize: '22rpx', fontWeight: 500, color: '#374151', fontFamily: 'monospace' }}>
                {c.date}
              </Text>
              <Text
                style={{
                  background: seroChipBg,
                  color: seroChipColor,
                  border: `1rpx solid ${isAndes ? '#fecaca' : '#e5e7eb'}`,
                  borderRadius: '100rpx',
                  padding: '2rpx 10rpx',
                  fontSize: '20rpx',
                  fontWeight: isAndes ? 600 : 400,
                }}
              >
                {isAndes && '⚠ '}{sero?.nameZh ?? c.serotypeId}
              </Text>
              <Text style={{ color: '#9ca3af', fontSize: '20rpx' }}>{c.source.name}</Text>
              <View style={{ marginLeft: 'auto' }}>
                <Text
                  style={{
                    background: scopeBadge.bg,
                    color: scopeBadge.color,
                    borderRadius: '100rpx',
                    padding: '2rpx 12rpx',
                    fontSize: '20rpx',
                    fontWeight: 500,
                  }}
                >
                  {scopeBadge.label}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: '26rpx', color: '#1f2937', fontWeight: 500, lineHeight: 1.4, display: 'block' }}>
              {title}
            </Text>
            {subtitle && (
              <Text style={{ fontSize: '22rpx', color: '#6b7280', marginTop: '4rpx', lineHeight: 1.6, display: 'block' }}>
                {subtitle}
              </Text>
            )}
            {c.source?.url && canLink && (
              <View className="mt-1" onClick={() => copyUrl(c.source.url)}>
                <Text style={{ fontSize: '20rpx', color: '#1e40af' }}>
                  🔗 查看原文（点击复制链接）
                </Text>
              </View>
            )}
          </View>
        );
      })}

      <Text className="text-xs text-gray-400 mt-3" style={{ display: 'block', lineHeight: 1.6 }}>
        数据每 6 小时自动抓取 WHO / ECDC 官方通报 + 新闻线索（Google News 聚合）。
        新闻线索仅作早期信号，请以蓝色"官方通报"为准。
      </Text>
    </View>
  );
}
