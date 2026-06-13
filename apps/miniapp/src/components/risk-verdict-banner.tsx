/**
 * Hero reassurance — first visual element after the date banner on miniapp home.
 * Copy from shared deriveRiskVerdict (reads realtimeSituation.state only).
 */
import { View, Text } from '@tarojs/components';
import type { RiskVerdict } from '@hantawatch/shared/risk-verdict';

const LEVEL_SURFACE: Record<
  RiskVerdict['level'],
  { border: string; bg: string; icon: string; title: string; detail: string }
> = {
  calm: {
    border: '#a7f3d0',
    bg: 'rgba(236, 253, 245, 0.95)',
    icon: '#059669',
    title: '#022c22',
    detail: '#064e3b',
  },
  remote: {
    border: '#bae6fd',
    bg: 'rgba(240, 249, 255, 0.95)',
    icon: '#0284c7',
    title: '#0c4a6e',
    detail: '#075985',
  },
  near: {
    border: '#fde68a',
    bg: 'rgba(255, 251, 235, 0.95)',
    icon: '#d97706',
    title: '#78350f',
    detail: '#92400e',
  },
  domestic: {
    border: '#fecdd3',
    bg: 'rgba(255, 241, 242, 0.95)',
    icon: '#e11d48',
    title: '#881337',
    detail: '#9f1239',
  },
  pending: {
    border: '#e2e8f0',
    bg: 'rgba(248, 250, 252, 0.95)',
    icon: '#64748b',
    title: '#0f172a',
    detail: '#475569',
  },
};

interface RiskVerdictBannerProps {
  verdict: RiskVerdict;
}

export function RiskVerdictBanner({ verdict }: RiskVerdictBannerProps) {
  const surface = LEVEL_SURFACE[verdict.level];

  return (
    <View
      style={{
        marginBottom: '24rpx',
        borderRadius: '24rpx',
        borderWidth: '2rpx',
        borderStyle: 'solid',
        borderColor: surface.border,
        background: surface.bg,
        padding: '32rpx 28rpx',
        boxShadow: '0 8rpx 28rpx rgba(3, 12, 38, 0.18)',
      }}
    >
      <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
        <Text
          style={{
            fontSize: '36rpx',
            lineHeight: '44rpx',
            color: surface.icon,
            marginRight: '20rpx',
            flexShrink: 0,
          }}
        >
          ♥
        </Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              display: 'block',
              fontSize: '32rpx',
              fontWeight: 700,
              lineHeight: '44rpx',
              color: surface.title,
            }}
          >
            {verdict.titleZh}
          </Text>
          <Text
            style={{
              display: 'block',
              marginTop: '16rpx',
              fontSize: '26rpx',
              lineHeight: '40rpx',
              color: surface.detail,
            }}
          >
            {verdict.detailZh}
          </Text>
        </View>
      </View>
    </View>
  );
}
