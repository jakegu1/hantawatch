/**
 * Taro port of apps/web/src/components/daily-brief-banner.tsx.
 *
 * Pure Taro components; the lucide-react icons used on web are replaced
 * with emoji to avoid pulling an icon font into the miniapp bundle.
 */

import { View, Text } from '@tarojs/components';
import type { DailyBrief } from '@/lib/data';

interface Props {
  brief: DailyBrief;
}

function formatDelta(n: number, unit = ''): { sign: 'flat' | 'up' | 'down'; abs: string } {
  if (n === 0) return { sign: 'flat', abs: '持平' };
  const magnitude = Math.abs(n).toLocaleString('zh-CN');
  return { sign: n > 0 ? 'up' : 'down', abs: `${magnitude}${unit}` };
}

const baselineLabel: Record<DailyBrief['domesticBaselineStatus'], { text: string; color: string }> = {
  normal: { text: '基线正常', color: '#86efac' },
  elevated: { text: '高于基线', color: '#fdba74' },
  below: { text: '低于基线', color: '#93c5fd' },
};

function arrow(sign: 'flat' | 'up' | 'down'): string {
  if (sign === 'up') return '↑';
  if (sign === 'down') return '↓';
  return '—';
}

export function DailyBriefBanner({ brief }: Props) {
  const distDelta = formatDelta(brief.distanceDeltaKm, ' km');
  const hpiDelta = formatDelta(brief.hpiDelta);
  const baseline = baselineLabel[brief.domesticBaselineStatus];

  const distColor =
    distDelta.sign === 'flat' ? '#dbeafe' : distDelta.sign === 'up' ? '#86efac' : '#fca5a5';
  const hpiColor =
    hpiDelta.sign === 'flat' ? '#dbeafe' : hpiDelta.sign === 'up' ? '#fca5a5' : '#86efac';

  return (
    <View
      style={{
        background: 'rgba(255,255,255,0.10)',
        border: '1rpx solid rgba(255,255,255,0.15)',
        borderRadius: '16rpx',
        padding: '14rpx 18rpx',
        marginBottom: '16rpx',
      }}
    >
      <View className="flex items-center gap-2 flex-wrap">
        <Text style={{ color: '#dbeafe', fontSize: '22rpx', fontWeight: 500 }}>
          📅 今日 {brief.date.slice(5)}
        </Text>
        <Text style={{ color: '#94a3b8', fontSize: '22rpx' }}>·</Text>
        <Text style={{ color: '#dbeafe', fontSize: '22rpx' }}>
          较昨 <Text style={{ color: distColor, fontWeight: 600 }}>{arrow(distDelta.sign)} {distDelta.abs}</Text>
        </Text>
        <Text style={{ color: '#94a3b8', fontSize: '22rpx' }}>·</Text>
        <Text style={{ color: '#dbeafe', fontSize: '22rpx' }}>
          HPI <Text style={{ color: hpiColor, fontWeight: 600 }}>{arrow(hpiDelta.sign)} {hpiDelta.abs}</Text>
        </Text>
      </View>
      <View className="mt-2 flex items-baseline" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '8rpx' }}>
        <Text style={{ color: 'rgba(219,234,254,0.9)', fontSize: '22rpx', flex: 1 }}>
          {brief.oneLine}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: '20rpx' }}>
          🟢 已 <Text style={{ color: '#86efac', fontWeight: 700 }}>{brief.daysSinceLastIntlAlert}</Text> 天无国际预警升级
        </Text>
      </View>
      <View className="mt-2">
        <Text style={{ color: baseline.color, fontSize: '20rpx', fontWeight: 600 }}>
          🛡️ 中国大陆 · {baseline.text}
        </Text>
      </View>
    </View>
  );
}
