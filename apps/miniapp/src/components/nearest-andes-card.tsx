/**
 * Taro port of apps/web/src/components/nearest-andes-card.tsx.
 *
 * The web version uses lucide-react icons + outbound anchor tags. In
 * miniapp:
 *   - Icons are replaced with emoji.
 *   - URLs are shown as plain text (miniapps cannot open arbitrary
 *     external URLs; tapping copies to clipboard).
 */

import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { ActiveCluster } from '@hantawatch/shared/types';
import { SEROTYPES } from '@hantawatch/shared';
import { type NearestAndesResult, flagForLocation, relativeDateZh, relativeTimeZh } from '@/lib/nearest-cluster';
import { DistanceBar } from './distance-bar';

function fmt(n: number): string {
  return n.toLocaleString('zh-CN');
}

function copyUrl(url: string) {
  Taro.setClipboardData({ data: url }).catch(() => {});
}

interface Props {
  result: NearestAndesResult;
  /** ISO timestamp of the last collector run (from `meta.json#lastCollectedAt`).
   *  Shown as "系统核查 X 分钟前" so the user can tell the difference between
   *  "WHO hasn't published anything since 5/13" and "our collector is broken".
   *  Without this, those two states look identical from the UI alone. */
  lastCheckedAt?: string;
}

export function NearestAndesCard({ result, lastCheckedAt }: Props) {
  const { nearest, count, all } = result;

  if (!nearest) {
    return (
      <View className="card">
        <View className="flex items-center gap-2 mb-1">
          <Text style={{ color: '#16a34a' }}>📍</Text>
          <Text className="text-sm font-semibold">最近 Andes 型疫情</Text>
        </View>
        <Text className="text-xs text-gray-500">
          全球暂无活跃 Andes 型聚集疫情。汉滩 / 汉城型仍按地方性流行例行监测。
        </Text>
      </View>
    );
  }

  const km = nearest.distanceFromChinaKm > 0 ? nearest.distanceFromChinaKm : null;
  const flag = flagForLocation(nearest.location?.name);
  const ago = relativeDateZh(nearest.lastUpdate);
  const markerColor = SEROTYPES[nearest.serotypeId]?.color ?? '#dc2626';

  return (
    <View
      className="card"
      style={{ padding: 0, overflow: 'hidden' }}
    >
      {/* Header strip */}
      <View
        style={{
          padding: '20rpx 28rpx',
          background: 'linear-gradient(to right, #fef2f2, #fff7ed)',
          borderBottom: '1rpx solid #fed7aa',
        }}
      >
        <View className="flex items-center" style={{ justifyContent: 'space-between' }}>
          <View className="flex items-start gap-2 min-w-0">
            <Text style={{ fontSize: '32rpx', lineHeight: 1.2 }}>{flag}</Text>
            <View className="min-w-0 flex-1">
              <Text
                className="uppercase tracking-wider"
                style={{ color: '#c2410c', fontSize: '20rpx', fontWeight: 500, display: 'block' }}
              >
                最近 Andes 型疫情
              </Text>
              <Text
                style={{
                  fontSize: '26rpx',
                  fontWeight: 600,
                  color: '#111827',
                  display: 'block',
                  lineHeight: 1.4,
                  marginTop: '2rpx',
                }}
              >
                {nearest.name}
              </Text>
            </View>
          </View>
          {count > 1 && (
            <View
              className="badge"
              style={{ background: '#ffedd5', color: '#9a3412', flexShrink: 0 }}
            >
              <Text style={{ color: '#9a3412', fontSize: '20rpx' }}>全球 {count} 起活跃</Text>
            </View>
          )}
        </View>
      </View>

      {/* Body */}
      <View style={{ padding: '24rpx 28rpx' }}>
        {/* Distance — headline */}
        <View className="flex items-end gap-2 mb-2">
          {km !== null ? (
            <>
              <Text style={{ fontSize: '76rpx', fontWeight: 800, lineHeight: 1, color: '#111827' }}>
                {fmt(km)}
              </Text>
              <Text style={{ fontSize: '32rpx', fontWeight: 700, color: '#9ca3af', marginBottom: '8rpx' }}>
                km
              </Text>
              <Text className="text-xs text-gray-500 ml-auto" style={{ marginBottom: '8rpx' }}>
                距中国大陆
              </Text>
            </>
          ) : (
            <Text className="text-sm text-gray-400 italic">距离待评估</Text>
          )}
        </View>

        {/* Location row */}
        <View className="flex items-center gap-1" style={{ marginBottom: '6rpx' }}>
          <Text style={{ color: '#9ca3af', fontSize: '22rpx' }}>📌</Text>
          <Text className="text-xs text-gray-600 truncate flex-1">
            {nearest.location?.name || '位置待定位'}
          </Text>
        </View>

        {/* Dual-timestamp row — see apps/web/src/components/nearest-andes-card.tsx
            for the rationale. Splitting source-date from check-time prevents
            "WHO hasn't updated in 3 days" from being misread as "tool broken". */}
        <View
          className="flex items-center flex-wrap"
          style={{ gap: '8rpx', marginBottom: '18rpx' }}
        >
          <Text style={{ color: '#6b7280', fontSize: '20rpx' }}>
            🗓 WHO 通报 <Text style={{ color: '#374151', fontWeight: 600 }}>{ago}</Text>
          </Text>
          {lastCheckedAt && (
            <>
              <Text style={{ color: '#d1d5db', fontSize: '20rpx' }}>·</Text>
              <Text style={{ color: '#6b7280', fontSize: '20rpx' }}>
                � 系统核查 <Text style={{ color: '#374151', fontWeight: 600 }}>{relativeTimeZh(lastCheckedAt)}</Text>
              </Text>
            </>
          )}
        </View>

        {/* Distance bar */}
        {km !== null && (
          <View className="mb-3">
            <DistanceBar distanceKm={km} markerColor={markerColor} clusterLabel={nearest.location?.name} />
          </View>
        )}

        {/* Risk pills */}
        <View className="flex flex-wrap gap-2 mb-3">
          <View
            className="badge"
            style={{
              background: nearest.humanToHuman ? '#fee2e2' : '#f3f4f6',
              color: nearest.humanToHuman ? '#b91c1c' : '#9ca3af',
              border: `1rpx solid ${nearest.humanToHuman ? '#fecaca' : '#e5e7eb'}`,
            }}
          >
            <Text
              style={{
                color: nearest.humanToHuman ? '#b91c1c' : '#9ca3af',
                fontSize: '22rpx',
                fontWeight: 500,
              }}
            >
              👥 {nearest.humanToHuman ? '可人际传播' : '无人际传播'}
            </Text>
          </View>
          <View
            className="badge"
            style={{
              background: '#fef2f2',
              border: '1rpx solid #fee2e2',
            }}
          >
            <Text style={{ color: '#b91c1c', fontSize: '22rpx', fontWeight: 500 }}>
              💀 病死率 30-40%
            </Text>
          </View>
          <View
            className="badge"
            style={{
              background: '#fefce8',
              border: '1rpx solid #fef9c3',
            }}
          >
            <Text style={{ color: '#a16207', fontSize: '22rpx', fontWeight: 500 }}>
              ✈ 无直飞中国
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View
          className="pt-3"
          style={{
            borderTop: '1rpx solid #f3f4f6',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8rpx',
          }}
        >
          <Stat label="确诊" value={nearest.confirmedCases ?? 0} color="#111827" />
          <Stat label="疑似" value={nearest.suspectedCases ?? 0} color="#a16207" />
          <Stat label="死亡" value={nearest.deaths ?? 0} color="#b91c1c" />
        </View>

        {/* Source */}
        {nearest.source?.url && (
          <View
            className="mt-3"
            onClick={() => copyUrl(nearest.source.url)}
          >
            <Text style={{ color: '#1d4ed8', fontSize: '22rpx' }}>
              📋 来源：{nearest.source.name || 'WHO Disease Outbreak News'}（点击复制链接）
            </Text>
          </View>
        )}

        {/* Other clusters */}
        {count > 1 && <OtherClustersList clusters={all.slice(1)} />}
      </View>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ textAlign: 'center' }}>
      <Text
        style={{ fontSize: '36rpx', fontWeight: 700, lineHeight: 1, color, display: 'block' }}
      >
        {value}
      </Text>
      <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '4rpx' }}>{label}</Text>
    </View>
  );
}

function OtherClustersList({ clusters }: { clusters: ActiveCluster[] }) {
  return (
    <View className="mt-3 pt-3" style={{ borderTop: '1rpx solid #f3f4f6' }}>
      <Text
        className="uppercase tracking-wider"
        style={{ color: '#9ca3af', fontSize: '20rpx', fontWeight: 500, display: 'block', marginBottom: '6rpx' }}
      >
        其他活跃 Andes 聚集
      </Text>
      {clusters.map((c) => {
        const f = flagForLocation(c.location?.name);
        const km = c.distanceFromChinaKm > 0 ? `${fmt(c.distanceFromChinaKm)} km` : '距离待估';
        return (
          <View key={c.id} className="flex items-center gap-2" style={{ padding: '4rpx 0' }}>
            <Text style={{ fontSize: '22rpx' }}>{f}</Text>
            <Text className="text-xs flex-1 truncate" style={{ color: '#374151' }}>
              {c.name}
            </Text>
            <Text className="text-xs font-mono" style={{ color: '#6b7280' }}>{km}</Text>
          </View>
        );
      })}
    </View>
  );
}
