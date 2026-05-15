/**
 * Taro port of apps/web/src/components/distance-bar.tsx.
 *
 * Pure `<View>` rendering — no SVG, no MapLibre. The bar uses a CSS
 * gradient (4 colour bands) with an absolutely-positioned dot marker.
 */

import { View, Text } from '@tarojs/components';

interface DistanceBarProps {
  distanceKm: number;
  markerColor?: string;
  clusterLabel?: string;
}

const MAX_KM = 20000;

const ZONES = [
  { upTo: 500, fill: '#fecaca', label: '邻近', hint: '邻近高风险' },
  { upTo: 3000, fill: '#fed7aa', label: '同洲', hint: '同洲监测圈' },
  { upTo: 10000, fill: '#fef08a', label: '跨洲', hint: '跨洲低风险' },
  { upTo: MAX_KM, fill: '#bbf7d0', label: '跨洋安全', hint: '跨洋极远' },
] as const;

function fmt(n: number): string {
  return n.toLocaleString('zh-CN');
}

function zoneFor(km: number): (typeof ZONES)[number] {
  for (const z of ZONES) {
    if (km <= z.upTo) return z;
  }
  return ZONES[ZONES.length - 1];
}

export function DistanceBar({ distanceKm, markerColor, clusterLabel }: DistanceBarProps) {
  const known = distanceKm > 0;
  const clamped = known ? Math.min(distanceKm, MAX_KM) : 0;
  const GUTTER = 2.5;
  const usable = 100 - GUTTER * 2;
  const pct = known ? GUTTER + (clamped / MAX_KM) * usable : 50;

  const zone = zoneFor(clamped);
  const dotColor = markerColor || '#dc2626';

  const stops: string[] = [];
  let prevPct = 0;
  for (const z of ZONES) {
    const endPct = (z.upTo / MAX_KM) * 100;
    stops.push(`${z.fill} ${prevPct}%`);
    stops.push(`${z.fill} ${endPct}%`);
    prevPct = endPct;
  }
  const gradient = `linear-gradient(to right, ${stops.join(', ')})`;

  return (
    <View>
      {/* Row: [star] [bar] [chip] */}
      <View className="flex items-center gap-2">
        <View
          style={{
            flexShrink: 0,
            width: '40rpx',
            height: '40rpx',
            borderRadius: '20rpx',
            background: '#1e3a8a',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22rpx',
            fontWeight: 700,
          }}
        >
          <Text style={{ color: '#fff' }}>★</Text>
        </View>

        <View className="relative flex-1 min-w-0">
          <View
            style={{
              height: '18rpx',
              borderRadius: '9rpx',
              border: '1rpx solid #e5e7eb',
              background: gradient,
            }}
          />
          {known && (
            <View
              style={{
                position: 'absolute',
                top: '50%',
                left: `${pct}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <View
                style={{
                  width: '24rpx',
                  height: '24rpx',
                  borderRadius: '12rpx',
                  background: dotColor,
                  border: '3rpx solid #fff',
                  boxShadow: '0 1rpx 2rpx rgba(0,0,0,0.15)',
                }}
              />
            </View>
          )}
        </View>

        {known ? (
          <View
            style={{
              flexShrink: 0,
              borderRadius: '8rpx',
              padding: '4rpx 12rpx',
              background: dotColor,
              color: '#fff',
            }}
          >
            <Text style={{ color: '#fff', fontSize: '22rpx', fontWeight: 700 }}>
              {fmt(distanceKm)} km
            </Text>
          </View>
        ) : (
          <Text className="text-xs text-gray-400 italic flex-shrink-0">距离待估</Text>
        )}
      </View>

      {/* Scale ticks */}
      <View
        className="flex mt-1"
        style={{
          justifyContent: 'space-between',
          paddingLeft: '48rpx',
          paddingRight: '120rpx',
        }}
      >
        <Text className="text-xs text-gray-500 tabular-nums">0</Text>
        <Text className="text-xs text-gray-500 tabular-nums">3千</Text>
        <Text className="text-xs text-gray-500 tabular-nums">1万</Text>
        <Text className="text-xs text-gray-500 tabular-nums">2万 km</Text>
      </View>

      {/* Zone summary */}
      <View className="mt-2 flex items-center gap-2 flex-wrap">
        <Text className="text-xs text-gray-700">当前位于</Text>
        <View
          style={{
            padding: '4rpx 12rpx',
            borderRadius: '6rpx',
            background: zone.fill,
          }}
        >
          <Text style={{ fontSize: '22rpx', fontWeight: 600, color: '#374151' }}>{zone.label}</Text>
        </View>
        <Text className="text-xs text-gray-700">区间</Text>
        {clusterLabel && <Text className="text-xs text-gray-500 truncate">· {clusterLabel}</Text>}
      </View>
    </View>
  );
}
