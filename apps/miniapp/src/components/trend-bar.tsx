/**
 * Simplified bar chart for the miniapp (Web uses ECharts which is too
 * heavy/incompatible for weapp). Renders horizontal labelled bars scaled
 * to the maximum value, with an optional baseline marker.
 */

import { View, Text } from '@tarojs/components';

interface Props {
  data: { label: string; value: number }[];
  color?: string;
  baseline?: number;
  unit?: string;
  /** When true, displays a flat vs prev arrow next to each value. */
  showDelta?: boolean;
}

export function TrendBar({ data, color = '#1e40af', baseline, unit = '', showDelta = false }: Props) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), baseline ?? 0);
  return (
    <View>
      {data.map((d, i) => {
        const pct = max > 0 ? (d.value / max) * 100 : 0;
        const prev = i > 0 ? data[i - 1].value : null;
        let delta = '';
        if (showDelta && prev !== null) {
          const diff = d.value - prev;
          delta = diff > 0 ? `↑${diff}` : diff < 0 ? `↓${Math.abs(diff)}` : '—';
        }
        return (
          <View
            key={d.label}
            className="flex items-center"
            style={{ padding: '6rpx 0', gap: '12rpx' }}
          >
            <Text className="text-xs text-gray-600" style={{ width: '120rpx' }}>{d.label}</Text>
            <View style={{ flex: 1, position: 'relative', height: '28rpx', background: '#f3f4f6', borderRadius: '4rpx' }}>
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: `${pct}%`,
                  background: color,
                  borderRadius: '4rpx',
                }}
              />
              {baseline !== undefined && max > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -2,
                    bottom: -2,
                    left: `${(baseline / max) * 100}%`,
                    width: '2rpx',
                    background: '#dc2626',
                  }}
                />
              )}
            </View>
            <Text className="text-xs font-mono" style={{ width: '160rpx', textAlign: 'right', color: '#374151' }}>
              {d.value.toLocaleString('zh-CN')}{unit} {delta && <Text className="text-xs text-gray-400">{delta}</Text>}
            </Text>
          </View>
        );
      })}
      {baseline !== undefined && (
        <View className="flex items-center gap-2 mt-2">
          <View style={{ width: '24rpx', height: '4rpx', background: '#dc2626' }} />
          <Text className="text-xs text-gray-500">5 年均值：{baseline.toLocaleString('zh-CN')}{unit}</Text>
        </View>
      )}
    </View>
  );
}
