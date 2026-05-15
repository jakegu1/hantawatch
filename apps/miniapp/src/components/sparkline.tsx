/**
 * Bar-based sparkline for the miniapp. Web uses an SVG polyline; Taro
 * doesn't render inline SVG reliably across all weapp versions, so we
 * stack thin `<View>` columns scaled to the data range.
 *
 * Each bar carries:
 *   - the numeric value above the bar (small label)
 *   - the bar itself (height proportional to value relative to the data
 *     range, with a 20% floor so a zero bar is still visible)
 *   - the x-axis label below
 *
 * The last bar (most recent value) is fully opaque + slightly thicker
 * border to draw the eye to "today".
 */

import { View, Text } from '@tarojs/components';

interface Props {
  values: number[];
  labels?: string[];
  color?: string;
  /** Visual height of the bar area, in CSS px (will be x2 for rpx). */
  height?: number;
  /** Show numeric value labels above each bar. Default true. */
  showValues?: boolean;
}

export function Sparkline({
  values,
  labels,
  color = '#1e40af',
  height = 64,
  showValues = true,
}: Props) {
  if (values.length === 0) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const lastIdx = values.length - 1;

  return (
    <View>
      {/* Row 1 — value labels, one per column, uniformly aligned to the
          top of the bar area. Keeps each numeric label readable
          regardless of the underlying bar height. */}
      {showValues && (
        <View style={{ display: 'flex', gap: '6rpx', marginBottom: '4rpx' }}>
          {values.map((v, i) => {
            const isLast = i === lastIdx;
            return (
              <Text
                key={i}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: '20rpx',
                  fontWeight: isLast ? 700 : 500,
                  color: isLast ? color : '#6b7280',
                  fontFamily: 'monospace',
                  lineHeight: 1.2,
                }}
              >
                {v}
              </Text>
            );
          })}
        </View>
      )}

      {/* Row 2 — bars, height proportional to value with a 20% floor so
          the smallest bar is still visibly drawn. */}
      <View
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '6rpx',
          height: `${height * 2}rpx`,
        }}
      >
        {values.map((v, i) => {
          const pct = ((v - min) / range) * 0.8 + 0.2;
          const isLast = i === lastIdx;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: `${pct * 100}%`,
                background: color,
                borderRadius: '4rpx',
                opacity: isLast ? 1 : 0.55,
                border: isLast ? `2rpx solid ${color}` : 'none',
                boxSizing: 'border-box',
              }}
            />
          );
        })}
      </View>

      {/* Row 3 — x-axis labels (dates) */}
      {labels && labels.length > 0 && (
        <View style={{ display: 'flex', gap: '6rpx', marginTop: '6rpx' }}>
          {labels.map((l, i) => (
            <Text
              key={i}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '20rpx',
                fontFamily: 'monospace',
                color: i === lastIdx ? '#374151' : '#9ca3af',
                fontWeight: i === lastIdx ? 600 : 400,
              }}
            >
              {l}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
