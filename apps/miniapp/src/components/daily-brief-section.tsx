import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import type { BriefSectionContent } from '@hantawatch/shared/daily-brief-display';

interface Props {
  briefDate: string; hpiTotal: number; hpiGradeZh: string; hpiColor: string;
  content: BriefSectionContent; highRiskDistanceText: string; highRiskDistanceContext: string;
}

const HPI_SCALE = [
  { upTo: 20, color: '#16a34a' }, { upTo: 40, color: '#0891b2' },
  { upTo: 60, color: '#ca8a04' }, { upTo: 80, color: '#ea580c' }, { upTo: 100, color: '#dc2626' },
];

export function DailyBriefSection({ briefDate, hpiTotal, hpiGradeZh, hpiColor, content, highRiskDistanceText }: Props) {
  const { metrics, briefTakeaway, briefNewCases, briefSituation, briefShareLine, domesticBaselineText, structuralMetricsLine, officialExcerpt, userActionHint, caseTable, caseTableSummary } = content;
  const [showDetails, setShowDetails] = useState(false);
  const pct = Math.min(100, Math.max(0, hpiTotal));
  const stops = HPI_SCALE.map((s, i) => { const prev = i === 0 ? 0 : HPI_SCALE[i - 1].upTo; return `${s.color} ${prev}% ${s.upTo}%`; }).join(', ');

  return (
    <View style={{ padding: '0 24rpx', marginTop: '16rpx' }}>
      <View style={{ borderRadius: '16rpx', overflow: 'hidden', border: '2rpx solid #93c5fd', background: '#fff' }}>
        {/* Header */}
        <View style={{ background: '#0f172a', padding: '16rpx 20rpx', flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: '8rpx' }}>
            <Text style={{ fontSize: '20rpx', fontWeight: 600, color: '#cbd5e1' }}>每日简报</Text>
          </View>
          <Text style={{ fontSize: '22rpx', fontWeight: 700, color: '#fff' }}>HPI {hpiTotal} · {hpiGradeZh}</Text>
        </View>

        {/* ① Narrative */}
        <View style={{ background: '#1e293b', padding: '16rpx 20rpx' }}>
          <Text style={{ fontSize: '26rpx', fontWeight: 700, color: '#fff', display: 'block', lineHeight: 1.45 }}>
            {briefShareLine || briefTakeaway || briefNewCases}
          </Text>
          <Text style={{ fontSize: '22rpx', color: '#cbd5e1', marginTop: '8rpx', display: 'block', lineHeight: 1.5 }}>{briefSituation}</Text>
          <Text style={{ fontSize: '18rpx', color: '#94a3b8', marginTop: '6rpx', display: 'block' }}>{metrics.alertLabel}</Text>
        </View>

        {/* ② HPI scale */}
        <View style={{ padding: '12rpx 20rpx', borderBottom: '1rpx solid #f1f5f9' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: '4rpx' }}>
            <Text style={{ fontSize: '18rpx', color: '#94a3b8' }}>0</Text>
            <View style={{ flex: 1, height: '6rpx', borderRadius: '3rpx', overflow: 'hidden', background: `linear-gradient(to right, ${stops})` }}>
              <View style={{ position: 'absolute', top: '-4rpx', width: '14rpx', height: '14rpx', borderRadius: '7rpx', background: '#fff', border: `2rpx solid ${hpiColor}`, left: `${pct}%`, marginLeft: '-7rpx' }} />
            </View>
            <Text style={{ fontSize: '18rpx', color: '#94a3b8' }}>100</Text>
          </View>
        </View>

        {/* ③ Metrics */}
        <View style={{ flexDirection: 'row', borderBottom: '1rpx solid #f1f5f9' }}>
          {[['最近威胁距离', highRiskDistanceText, '#dc2626'], ['国内基线', domesticBaselineText, '#111827'], ['WHO更新', `${metrics.whoDaysSinceOfficialUpdate}天前`, '#111827']].map(([label, val, clr], i) => (
            <View key={i} style={{ flex: 1, padding: '12rpx 6rpx', textAlign: 'center', borderRightWidth: i < 2 ? '1rpx' : 0, borderColor: '#f1f5f9' }}>
              <Text style={{ fontSize: '18rpx', color: '#6b7280' }}>{label}</Text>
              <Text style={{ fontSize: '24rpx', fontWeight: 800, color: clr, marginTop: '4rpx', display: 'block' }}>{val}</Text>
            </View>
          ))}
        </View>

        {/* ④ Case cards */}
        <View style={{ padding: '12rpx 20rpx', borderBottom: '1rpx solid #f1f5f9' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: '8rpx' }}>
            <Text style={{ fontSize: '18rpx', fontWeight: 600, color: '#6b7280' }}>病例与监测动态</Text>
            <Text style={{ fontSize: '16rpx', color: '#9ca3af' }}>
              确诊{caseTableSummary.totalConfirmed} · 监测{caseTableSummary.totalMonitoring} · 死亡{caseTableSummary.totalDeaths}
            </Text>
          </View>
          {caseTable.slice(0, 7).map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', paddingTop: '6rpx', paddingBottom: '6rpx', borderBottom: '1rpx solid #f9fafb' }}>
              <Text style={{ width: '56rpx', fontSize: '18rpx', color: '#9ca3af' }}>{row.date.slice(5)}</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: '6rpx' }}>
                  <Text style={{ fontSize: '20rpx', fontWeight: 600, color: '#111827' }}>{row.countryNameZh}</Text>
                  <Text style={{ fontSize: '16rpx', color: '#9ca3af' }}>{row.serotypeLabel}</Text>
                  <View style={{ borderRadius: '6rpx', background: '#f3f4f6', padding: '2rpx 6rpx' }}>
                    <Text style={{ fontSize: '14rpx', color: '#6b7280' }}>{row.sourceType}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: '16rpx', color: '#9ca3af', marginTop: '2rpx' }}>{row.sourceName}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: '6rpx', alignItems: 'center' }}>
                {row.totalConfirmed > 0 && <Text style={{ fontSize: '18rpx', fontWeight: 700, color: '#dc2626' }}>{row.totalConfirmed}确诊</Text>}
                {row.monitoring > 0 && <Text style={{ fontSize: '18rpx', color: '#2563eb' }}>{row.monitoring}监测</Text>}
                {row.deaths > 0 && <Text style={{ fontSize: '18rpx', fontWeight: 700, color: '#374151' }}>{row.deaths}死亡</Text>}
              </View>
            </View>
          ))}
        </View>

        {/* ⑤ Monitoring leads */}
        {metrics.monitoringLeads.length > 0 && (
          <View style={{ padding: '12rpx 20rpx', borderBottom: '1rpx solid #f1f5f9', background: '#faf5ff' }}>
            <Text style={{ fontSize: '18rpx', fontWeight: 600, color: '#7c3aed', marginBottom: '6rpx' }}>待官方确认的监测动态</Text>
            {metrics.monitoringLeads.map((lead) => (
              <View key={lead.id} style={{ marginTop: '6rpx' }}>
                <Text style={{ fontSize: '20rpx', color: '#374151', display: 'block', lineHeight: 1.5 }}>{lead.summary_zh}</Text>
                {lead.key_facts_zh?.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '4rpx', marginTop: '4rpx' }}>
                    {lead.key_facts_zh.slice(0, 3).map((f) => <Text key={f} style={{ fontSize: '16rpx', color: '#7c3aed', background: '#f5f3ff', borderRadius: '6rpx', padding: '2rpx 6rpx' }}>{f}</Text>)}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ⑥ Action */}
        {userActionHint && (
          <View style={{ padding: '12rpx 20rpx', borderBottom: '1rpx solid #f1f5f9', background: '#ecfdf5' }}>
            <Text style={{ fontSize: '18rpx', fontWeight: 600, color: '#047857' }}>行动建议</Text>
            <Text style={{ fontSize: '20rpx', fontWeight: 600, color: '#065f46', marginTop: '4rpx', display: 'block' }}>{userActionHint}</Text>
          </View>
        )}

        <View style={{ padding: '8rpx 20rpx' }} onClick={() => setShowDetails(v => !v)}>
          <Text style={{ fontSize: '18rpx', color: '#6b7280' }}>{showDetails ? '收起 ▲' : '数据溯源 ▼'}</Text>
        </View>
        {showDetails && (
          <View style={{ padding: '0 20rpx 16rpx 20rpx' }}>
            {officialExcerpt && <View style={{ marginTop: '8rpx', background: '#f9fafb', borderRadius: '8rpx', padding: '8rpx' }}><Text style={{ fontSize: '16rpx', color: '#6b7280' }}>事件摘要</Text><Text style={{ fontSize: '18rpx', color: '#374151', marginTop: '4rpx', display: 'block' }}>{officialExcerpt}</Text></View>}
            <View style={{ marginTop: '8rpx', background: '#f8fafc', borderRadius: '8rpx', padding: '8rpx' }}><Text style={{ fontSize: '16rpx', color: '#64748b' }}>结构指标</Text><Text style={{ fontSize: '18rpx', color: '#475569', marginTop: '4rpx', display: 'block' }}>{structuralMetricsLine}</Text></View>
            <View style={{ marginTop: '8rpx', background: '#eff6ff', borderRadius: '8rpx', padding: '12rpx' }} onClick={() => Taro.navigateTo({ url: '/pages/events/mv-hondius/index' })}><Text style={{ fontSize: '20rpx', fontWeight: 600, color: '#1e40af' }}>查看 MV Hondius 完整事件 →</Text></View>
          </View>
        )}
      </View>
    </View>
  );
}
