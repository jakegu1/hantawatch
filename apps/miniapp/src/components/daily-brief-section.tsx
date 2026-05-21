import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { BriefSectionContent } from '@hantawatch/shared/daily-brief-display';
import { FeedLegend } from '@/components/feed-legend';

interface Props {
  briefDate: string;
  hpiTotal: number;
  hpiGradeZh: string;
  hpiColor: string;
  content: BriefSectionContent;
  highRiskDistanceText: string;
  highRiskDistanceContext: string;
}

export function DailyBriefSection({
  briefDate,
  hpiTotal,
  hpiGradeZh,
  hpiColor,
  content,
  highRiskDistanceText,
  highRiskDistanceContext,
}: Props) {
  const { metrics, briefTakeaway, briefNewCases, briefSituation, briefRiskJudgment, briefShareLine, domesticBaselineText, briefFocusSentence, structuralMetricsLine, officialExcerpt, userActionHint } = content;

  return (
    <View className="container-page" style={{ padding: '0 24rpx', marginTop: '16rpx' }}>
      <View
        style={{
          borderRadius: '16rpx',
          overflow: 'hidden',
          border: '2rpx solid #93c5fd',
          background: '#fff',
          boxShadow: '0 4rpx 16rpx rgba(30,64,175,0.12)',
        }}
      >
        <View style={{ background: '#0f172a', padding: '20rpx 24rpx' }}>
          <Text style={{ fontSize: '20rpx', color: '#cbd5e1', fontWeight: 600 }}>每日简报</Text>
          <Text style={{ fontSize: '30rpx', fontWeight: 800, color: '#ffffff', display: 'block', marginTop: '4rpx' }}>
            24 小时要点与风险判断
          </Text>
          <Text style={{ fontSize: '22rpx', color: '#f1f5f9', marginTop: '8rpx', display: 'block' }}>
            {briefDate} · HPI {hpiTotal} {hpiGradeZh}
          </Text>
          <Text style={{ fontSize: '22rpx', color: '#e2e8f0', marginTop: '6rpx', display: 'block', lineHeight: 1.5 }}>
            {metrics.alertLabel}
          </Text>
        </View>

        <View style={{ padding: '16rpx 20rpx' }}>
          <FeedLegend feedId="daily-brief" />

          <View style={{ background: '#f5f3ff', border: '2rpx solid #c4b5fd', borderRadius: '12rpx', padding: '16rpx' }}>
            <Text style={{ fontSize: '20rpx', fontWeight: 700, color: '#6d28d9' }}>24 小时要点</Text>
            <Text style={{ fontSize: '28rpx', fontWeight: 800, color: '#111827', marginTop: '8rpx', display: 'block', lineHeight: 1.4 }}>
              {briefTakeaway || briefNewCases}
            </Text>
          </View>

          {metrics.monitoringLeads.length > 0 && (
            <View style={{ marginTop: '12rpx', background: '#faf5ff', borderRadius: '12rpx', padding: '12rpx', border: '1rpx solid #e9d5ff' }}>
              <Text style={{ fontSize: '20rpx', fontWeight: 600, color: '#7c3aed' }}>待官方确认的监测动态</Text>
              {metrics.monitoringLeads.map((lead) => (
                <View key={lead.id} style={{ marginTop: '8rpx' }}>
                  <Text style={{ fontSize: '24rpx', color: '#374151', display: 'block' }}>
                    {lead.summary_zh}
                  </Text>
                  {lead.key_facts_zh?.length > 0 && (
                    <View className="flex flex-wrap gap-1 mt-1">
                      {lead.key_facts_zh.slice(0, 4).map((f) => (
                        <Text key={f} style={{ fontSize: '18rpx', color: '#7c3aed', background: '#f5f3ff', borderRadius: '8rpx', padding: '2rpx 8rpx' }}>
                          {f}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {officialExcerpt && (
            <View style={{ marginTop: '12rpx', background: '#f9fafb', borderRadius: '12rpx', padding: '12rpx' }}>
              <Text style={{ fontSize: '20rpx', color: '#6b7280' }}>事件摘要</Text>
              <Text style={{ fontSize: '22rpx', color: '#374151', marginTop: '4rpx', display: 'block' }}>{officialExcerpt}</Text>
            </View>
          )}

          <View style={{ marginTop: '12rpx', background: '#f8fafc', borderRadius: '12rpx', padding: '12rpx' }}>
            <Text style={{ fontSize: '20rpx', color: '#64748b' }}>结构指标</Text>
            <Text style={{ fontSize: '22rpx', color: '#475569', marginTop: '4rpx', display: 'block', lineHeight: 1.5 }}>
              {structuralMetricsLine}
            </Text>
            <Text style={{ fontSize: '18rpx', color: '#94a3b8', marginTop: '4rpx', display: 'block' }}>
              HPI / 距离均为 collector 原始值；前端 HPI 已基于输入监测动态调整。
            </Text>
          </View>

          <View className="flex gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: '45%', background: '#fef2f2', borderRadius: '12rpx', padding: '12rpx' }}>
              <Text style={{ fontSize: '20rpx', color: '#b91c1c' }}>最近高危活动</Text>
              <Text style={{ fontSize: '24rpx', fontWeight: 700, color: '#b91c1c', display: 'block', marginTop: '4rpx' }}>{highRiskDistanceText}</Text>
              <Text style={{ fontSize: '18rpx', color: '#6b7280', marginTop: '4rpx', display: 'block' }}>{highRiskDistanceContext}</Text>
            </View>
            <View style={{ flex: 1, minWidth: '45%', background: '#fff7ed', borderRadius: '12rpx', padding: '12rpx' }}>
              <Text style={{ fontSize: '20rpx', color: '#ea580c' }}>当前态势</Text>
              <Text style={{ fontSize: '22rpx', fontWeight: 600, display: 'block', marginTop: '4rpx' }}>{briefSituation}</Text>
            </View>
          </View>

          <View style={{ marginTop: '12rpx', background: '#111827', borderRadius: '12rpx', padding: '16rpx' }}>
            <Text style={{ fontSize: '20rpx', color: '#93c5fd' }}>综合判断</Text>
            <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#fff', marginTop: '8rpx', display: 'block', lineHeight: 1.45 }}>
              {briefShareLine}
            </Text>
          </View>

          {userActionHint && (
            <View style={{ marginTop: '16rpx', background: '#ecfdf5', border: '2rpx solid #a7f3d0', borderRadius: '12rpx', padding: '16rpx' }}>
              <Text style={{ fontSize: '20rpx', fontWeight: 600, color: '#047857' }}>行动建议</Text>
              <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#065f46', marginTop: '4rpx', display: 'block', lineHeight: 1.45 }}>
                {userActionHint}
              </Text>
            </View>
          )}

          <View
            style={{ marginTop: '16rpx', background: '#eff6ff', borderRadius: '12rpx', padding: '16rpx' }}
            onClick={() => Taro.navigateTo({ url: '/pages/events/mv-hondius/index' })}
          >
            <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#1e40af' }}>
              查看 MV Hondius 完整事件时间线与病例表 →
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
