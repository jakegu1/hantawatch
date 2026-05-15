/**
 * HPI factor breakdown table — Taro port of the transparency panel from
 * apps/web/src/app/page.tsx. Renders the 5 factors with raw value, score,
 * weight and weighted contribution. Mobile-first: stacked rows instead of
 * a desktop-style table.
 */

import { View, Text } from '@tarojs/components';
import { SEROTYPES } from '@hantawatch/shared';
import type { HpiResult } from '@hantawatch/shared/types';

function fmt(n: number): string {
  return n.toLocaleString('zh-CN');
}

export function HpiBreakdown({ hpi }: { hpi: HpiResult }) {
  const f = hpi.factors;
  const rows = [
    {
      label: '距离因子',
      weight: '30%',
      raw: `${fmt(f.distance.km)} km`,
      score: f.distance.score,
      weighted: f.distance.score * f.distance.weight,
    },
    {
      label: '官方评估',
      weight: '25%',
      raw: f.officialAssessment.level,
      score: f.officialAssessment.score,
      weighted: f.officialAssessment.score * f.officialAssessment.weight,
    },
    {
      label: '血清型风险',
      weight: '20%',
      raw: SEROTYPES[f.serotypeRisk.serotypeId]?.nameZh ?? f.serotypeRisk.serotypeId,
      score: f.serotypeRisk.score,
      weighted: f.serotypeRisk.score * f.serotypeRisk.weight,
    },
    {
      label: '旅行联通度',
      weight: '15%',
      raw: f.travelConnectivity.level,
      score: f.travelConnectivity.score,
      weighted: f.travelConnectivity.score * f.travelConnectivity.weight,
    },
    {
      label: '历史基线',
      weight: '10%',
      raw: f.historicalBaseline.deviation,
      score: f.historicalBaseline.score,
      weighted: f.historicalBaseline.score * f.historicalBaseline.weight,
    },
  ];

  return (
    <View>
      {rows.map((r) => (
        <View
          key={r.label}
          className="flex items-center"
          style={{
            padding: '12rpx 0',
            borderBottom: '1rpx solid #f3f4f6',
            gap: '8rpx',
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: '26rpx', fontWeight: 500, display: 'block' }}>{r.label}</Text>
            <Text style={{ fontSize: '20rpx', color: '#9ca3af', marginTop: '2rpx', display: 'block' }}>
              {r.weight} · {r.raw}
            </Text>
          </View>
          <View style={{ width: '120rpx', textAlign: 'right' }}>
            <Text style={{ fontSize: '20rpx', color: '#6b7280', display: 'block' }}>得分</Text>
            <Text style={{ fontSize: '28rpx', fontWeight: 600, display: 'block' }}>{r.score}</Text>
          </View>
          <View style={{ width: '120rpx', textAlign: 'right' }}>
            <Text style={{ fontSize: '20rpx', color: '#6b7280', display: 'block' }}>加权</Text>
            <Text
              style={{
                fontSize: '28rpx',
                fontWeight: 700,
                color: '#1e40af',
                fontFamily: 'monospace',
                display: 'block',
              }}
            >
              {r.weighted.toFixed(1)}
            </Text>
          </View>
        </View>
      ))}
      <View
        className="flex items-center"
        style={{
          padding: '14rpx 0 0 0',
          gap: '8rpx',
        }}
      >
        <Text style={{ flex: 1, fontSize: '28rpx', fontWeight: 700 }}>合计</Text>
        <Text style={{ width: '120rpx', textAlign: 'right', fontSize: '24rpx', color: '#6b7280' }}>100%</Text>
        <Text
          style={{
            width: '120rpx',
            textAlign: 'right',
            fontSize: '36rpx',
            fontWeight: 800,
            color: hpi.color,
            fontFamily: 'monospace',
          }}
        >
          {hpi.total}
        </Text>
      </View>
      <Text className="text-xs text-gray-400 mt-2" style={{ display: 'block' }}>
        算法公开，每个因子可独立验算。完整公式见「关于」页。
      </Text>
    </View>
  );
}
