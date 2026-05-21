import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import type { BriefSectionContent } from '@hantawatch/shared/daily-brief-display';

interface Props {
  briefDate: string;
  hpiTotal: number;
  hpiGradeZh: string;
  hpiColor: string;
  content: BriefSectionContent;
  highRiskDistanceText: string;
  highRiskDistanceContext: string;
}

const HPI_SCALE = [
  { upTo: 20, color: '#16a34a', label: '' },
  { upTo: 40, color: '#0891b2', label: '' },
  { upTo: 60, color: '#ca8a04', label: '' },
  { upTo: 80, color: '#ea580c', label: '' },
  { upTo: 100, color: '#dc2626', label: '' },
];

export function DailyBriefSection({
  briefDate,
  hpiTotal,
  hpiGradeZh,
  hpiColor,
  content,
  highRiskDistanceText,
  highRiskDistanceContext,
}: Props) {
  const { metrics, briefTakeaway, briefNewCases, briefSituation, briefRiskJudgment, briefShareLine, domesticBaselineText, structuralMetricsLine, officialExcerpt, userActionHint } = content;
  const [showDetails, setShowDetails] = useState(false);

  const pct = Math.min(100, Math.max(0, hpiTotal));
  const stops = HPI_SCALE.map((s, i) => {
    const prev = i === 0 ? 0 : HPI_SCALE[i - 1].upTo;
    return `${s.color} ${prev}% ${s.upTo}%`;
  }).join(', ');

  return (
    <View style={{ padding: '0 24rpx', marginTop: '16rpx' }}>
      <View style={{ borderRadius: '16rpx', overflow: 'hidden', border: '2rpx solid #93c5fd', background: '#fff' }}>
        {/* Header */}
        <View style={{ background: '#0f172a', padding: '16rpx 20rpx' }}>
          <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: '20rpx', fontWeight: 600, color: '#cbd5e1' }}>每日简报</Text>
            <Text style={{ fontSize: '22rpx', fontWeight: 700, color: '#fff' }}>HPI {hpiTotal} · {hpiGradeZh}</Text>
          </View>
        </View>

        {/* ① Hero conclusion */}
        <View style={{ background: '#1e293b', padding: '16rpx 20rpx' }}>
          <Text style={{ fontSize: '28rpx', fontWeight: 800, color: '#fff', display: 'block', lineHeight: 1.4 }}>
            {briefTakeaway || briefNewCases || '今日无新增官方通报或监测信号。'}
          </Text>
        </View>

        {/* ② HPI scale bar */}
        <View style={{ padding: '12rpx 20rpx', borderBottom: '1rpx solid #f1f5f9' }}>
          <View style={{ display: 'flex', alignItems: 'center', gap: '4rpx' }}>
            <Text style={{ fontSize: '18rpx', color: '#94a3b8' }}>0</Text>
            <View style={{ flex: 1, height: '6rpx', borderRadius: '3rpx', overflow: 'hidden', position: 'relative', background: `linear-gradient(to right, ${stops})` }}>
              <View style={{ position: 'absolute', top: '-4rpx', width: '14rpx', height: '14rpx', borderRadius: '7rpx', background: '#fff', border: `2rpx solid ${hpiColor}`, left: `${pct}%`, marginLeft: '-7rpx' }} />
            </View>
            <Text style={{ fontSize: '18rpx', color: '#94a3b8' }}>100</Text>
          </View>
        </View>

        {/* ③ Core metrics */}
        <View style={{ display: 'flex', borderBottom: '1rpx solid #f1f5f9' }}>
          <View style={{ flex: 1, padding: '12rpx 8rpx', textAlign: 'center', borderRight: '1rpx solid #f1f5f9' }}>
            <Text style={{ fontSize: '18rpx', color: '#6b7280' }}>最近威胁距离</Text>
            <Text style={{ fontSize: '24rpx', fontWeight: 800, color: '#dc2626', marginTop: '4rpx', display: 'block' }}>{highRiskDistanceText}</Text>
          </View>
          <View style={{ flex: 1, padding: '12rpx 8rpx', textAlign: 'center', borderRight: '1rpx solid #f1f5f9' }}>
            <Text style={{ fontSize: '18rpx', color: '#6b7280' }}>国内基线</Text>
            <Text style={{ fontSize: '24rpx', fontWeight: 800, color: '#111827', marginTop: '4rpx', display: 'block' }}>{domesticBaselineText}</Text>
          </View>
          <View style={{ flex: 1, padding: '12rpx 8rpx', textAlign: 'center' }}>
            <Text style={{ fontSize: '18rpx', color: '#6b7280' }}>WHO 更新</Text>
            <Text style={{ fontSize: '24rpx', fontWeight: 800, color: '#111827', marginTop: '4rpx', display: 'block' }}>{metrics.whoDaysSinceOfficialUpdate} 天前</Text>
            <Text style={{ fontSize: '16rpx', color: '#94a3b8', marginTop: '2rpx' }}>间隔属正常</Text>
          </View>
        </View>

        {/* ④ Monitoring leads */}
        {metrics.monitoringLeads.length > 0 && (
          <View style={{ padding: '12rpx 20rpx', borderBottom: '1rpx solid #f1f5f9', background: '#faf5ff' }}>
            <Text style={{ fontSize: '18rpx', fontWeight: 600, color: '#7c3aed' }}>待官方确认的监测动态</Text>
            {metrics.monitoringLeads.map((lead) => (
              <View key={lead.id} style={{ marginTop: '8rpx' }}>
                <Text style={{ fontSize: '22rpx', color: '#374151', display: 'block', lineHeight: 1.5 }}>{lead.summary_zh}</Text>
                {lead.key_facts_zh?.length > 0 && (
                  <View style={{ display: 'flex', flexWrap: 'wrap', gap: '4rpx', marginTop: '4rpx' }}>
                    {lead.key_facts_zh.slice(0, 3).map((f) => (
                      <Text key={f} style={{ fontSize: '18rpx', color: '#7c3aed', background: '#f5f3ff', borderRadius: '8rpx', padding: '2rpx 8rpx' }}>{f}</Text>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ⑤ Action */}
        {userActionHint && (
          <View style={{ padding: '12rpx 20rpx', borderBottom: '1rpx solid #f1f5f9', background: '#ecfdf5' }}>
            <Text style={{ fontSize: '18rpx', fontWeight: 600, color: '#047857' }}>行动建议</Text>
            <Text style={{ fontSize: '22rpx', fontWeight: 600, color: '#065f46', marginTop: '4rpx', display: 'block', lineHeight: 1.45 }}>{userActionHint}</Text>
          </View>
        )}

        {/* ⑥ Details toggle */}
        <View style={{ padding: '8rpx 20rpx' }} onClick={() => setShowDetails((v) => !v)}>
          <Text style={{ fontSize: '20rpx', color: '#6b7280' }}>{showDetails ? '收起详情 ▲' : '查看数据溯源与综合判断 ▼'}</Text>
        </View>

        {showDetails && (
          <View style={{ padding: '0 20rpx 16rpx 20rpx' }}>
            {officialExcerpt && (
              <View style={{ marginTop: '8rpx', background: '#f9fafb', borderRadius: '8rpx', padding: '8rpx' }}>
                <Text style={{ fontSize: '18rpx', color: '#6b7280' }}>事件摘要</Text>
                <Text style={{ fontSize: '20rpx', color: '#374151', marginTop: '4rpx', display: 'block' }}>{officialExcerpt}</Text>
              </View>
            )}
            <View style={{ marginTop: '8rpx', background: '#f8fafc', borderRadius: '8rpx', padding: '8rpx' }}>
              <Text style={{ fontSize: '18rpx', color: '#64748b' }}>结构指标</Text>
              <Text style={{ fontSize: '20rpx', color: '#475569', marginTop: '4rpx', display: 'block' }}>{structuralMetricsLine}</Text>
            </View>
            <View style={{ marginTop: '8rpx', display: 'flex', gap: '8rpx' }}>
              <View style={{ flex: 1, background: '#fff7ed', borderRadius: '8rpx', padding: '8rpx' }}>
                <Text style={{ fontSize: '18rpx', fontWeight: 600, color: '#c2410c' }}>态势综合</Text>
                <Text style={{ fontSize: '20rpx', fontWeight: 600, color: '#431407', marginTop: '4rpx', display: 'block' }}>{briefSituation}</Text>
              </View>
              <View style={{ flex: 1, background: '#eff6ff', borderRadius: '8rpx', padding: '8rpx' }}>
                <Text style={{ fontSize: '18rpx', fontWeight: 600, color: '#1d4ed8' }}>中国风险</Text>
                <Text style={{ fontSize: '20rpx', fontWeight: 600, color: '#1e3a8a', marginTop: '4rpx', display: 'block' }}>{briefRiskJudgment}</Text>
              </View>
            </View>
            <View style={{ marginTop: '8rpx', background: '#0f172a', borderRadius: '8rpx', padding: '12rpx' }}>
              <Text style={{ fontSize: '18rpx', fontWeight: 600, color: '#93c5fd' }}>综合判断</Text>
              <Text style={{ fontSize: '22rpx', fontWeight: 600, color: '#fff', marginTop: '4rpx', display: 'block', lineHeight: 1.45 }}>{briefShareLine}</Text>
            </View>
            <View style={{ marginTop: '8rpx', background: '#eff6ff', borderRadius: '8rpx', padding: '12rpx' }}
              onClick={() => Taro.navigateTo({ url: '/pages/events/mv-hondius/index' })}>
              <Text style={{ fontSize: '22rpx', fontWeight: 600, color: '#1e40af' }}>查看 MV Hondius 完整事件 →</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
