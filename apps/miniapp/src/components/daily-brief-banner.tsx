/**
 * Taro port of apps/web/src/components/daily-brief-banner.tsx — keep in sync.
 */
import { View, Text } from '@tarojs/components';
import type { DailyBrief } from '@/lib/data';

interface Props {
  brief: DailyBrief;
  headline24h: string;
  alertLabel: string;
}

const baselineLabel: Record<DailyBrief['domesticBaselineStatus'], { text: string; color: string }> = {
  normal: { text: '基线正常', color: '#86efac' },
  elevated: { text: '高于基线', color: '#fdba74' },
  below: { text: '低于基线', color: '#93c5fd' },
};

function formatDelta(n: number, unit = ''): { sign: 'flat' | 'up' | 'down'; abs: string } {
  if (n === 0) return { sign: 'flat', abs: '持平' };
  const magnitude = Math.abs(n).toLocaleString('zh-CN');
  return { sign: n > 0 ? 'up' : 'down', abs: `${magnitude}${unit}` };
}

export function DailyBriefBanner({ brief, headline24h, alertLabel }: Props) {
  const distDelta = formatDelta(brief.distanceDeltaKm, ' km');
  const hpiDelta = formatDelta(brief.hpiDelta);
  const baseline = baselineLabel[brief.domesticBaselineStatus];

  const distArrow = distDelta.sign === 'up' ? '↑' : distDelta.sign === 'down' ? '↓' : '—';
  const hpiArrow = hpiDelta.sign === 'up' ? '↑' : hpiDelta.sign === 'down' ? '↓' : '—';

  return (
    <View
      style={{
        background: 'rgba(255,255,255,0.10)',
        border: '1rpx solid rgba(255,255,255,0.15)',
        borderRadius: '16rpx',
        padding: '16rpx 20rpx',
        marginBottom: '16rpx',
      }}
    >
      <View className="flex items-center gap-2 mb-2">
        <Text style={{ fontSize: '22rpx', color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
          今日 {brief.date.slice(5)}
        </Text>
        <Text style={{ fontSize: '18rpx', color: 'rgba(255,255,255,0.5)' }}>24h 要点</Text>
      </View>

      <Text style={{ fontSize: '26rpx', color: '#fff', fontWeight: 600, lineHeight: 1.45, display: 'block', marginBottom: '12rpx' }}>
        {headline24h}
      </Text>

      <View className="flex flex-wrap items-center gap-2" style={{ fontSize: '20rpx', color: 'rgba(255,255,255,0.75)' }}>
        <Text style={{ opacity: 0.6 }}>结构指标</Text>
        <Text>
          距 {distArrow} {distDelta.abs}
        </Text>
        <Text style={{ opacity: 0.4 }}>·</Text>
        <Text>
          HPI {hpiArrow} {hpiDelta.abs}
        </Text>
        <Text style={{ opacity: 0.4 }}>·</Text>
        <Text style={{ color: baseline.color, fontWeight: 600 }}>{baseline.text}</Text>
      </View>

      <Text style={{ fontSize: '20rpx', color: 'rgba(219,234,254,0.85)', marginTop: '10rpx', display: 'block', lineHeight: 1.5 }}>
        {alertLabel}
      </Text>
    </View>
  );
}
