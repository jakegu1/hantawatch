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

function HpiScaleBar({ total, color }: { total: number; color: string }) {
  const pct = Math.min(100, Math.max(0, total));
  const stops = HPI_SCALE.map((s, i) => {
    const prev = i === 0 ? 0 : HPI_SCALE[i - 1].upTo;
    return `${s.color} ${prev}% ${s.upTo}%`;
  }).join(', ');
  return (
    <View style={{ display: 'flex', alignItems: 'center', gap: '6rpx' }}>
      <Text style={{ fontSize: '18rpx', color: '#9ca3af' }}>0</Text>
      <View style={{ flex: 1, height: '6rpx', borderRadius: '3rpx', overflow: 'hidden', position: 'relative', background: `linear-gradient(to right, ${stops})` }}>
        <View style={{ position: 'absolute', top: '-4rpx', left: `${pct}%`, marginLeft: '-7rpx', width: '14rpx', height: '14rpx', borderRadius: '7rpx', background: '#fff', boxShadow: `0 0 0 4rpx ${color}` }} />
      </View>
      <Text style={{ fontSize: '18rpx', color: '#9ca3af' }}>100</Text>
    </View>
  );
}

export function DailyBriefSection({ briefDate, hpiTotal, hpiGradeZh, hpiColor, content, highRiskDistanceText, highRiskDistanceContext }: Props) {
  const { metrics, briefTakeaway, briefNewCases, briefSituation, briefShareLine, domesticBaselineText, structuralMetricsLine, officialExcerpt, userActionHint, caseTable, caseTableSummary } = content;
  const [showDetails, setShowDetails] = useState(false);

  return (
    <View style={{ padding: '0 24rpx', marginTop: '16rpx' }}>
      <View style={{ borderRadius: '16rpx', overflow: 'hidden', border: '2rpx solid #93c5fd', background: '#fff', boxShadow: '0 4rpx 12rpx rgba(0,0,0,0.06)' }}>

        {/* ─── Header ─── */}
        <View style={{ background: '#0f172a', padding: '16rpx 24rpx', display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8rpx' }}>
            <Text style={{ fontSize: '20rpx', fontWeight: 600, color: '#cbd5e1', letterSpacing: '0.2em' }}>每日简报</Text>
            <Text style={{ fontSize: '18rpx', color: '#94a3b8' }}>{briefDate}</Text>
          </View>
          <Text style={{ fontSize: '22rpx', fontWeight: 700, color: '#fff' }}>HPI {hpiTotal} · {hpiGradeZh}</Text>
        </View>

        {/* ─── ① Narrative ─── */}
        <View style={{ background: 'linear-gradient(to right, #1e293b, #0f172a)', padding: '20rpx 24rpx' }}>
          <Text style={{ fontSize: '28rpx', fontWeight: 700, color: '#fff', display: 'block', lineHeight: 1.45 }}>
            {briefShareLine || briefTakeaway || briefNewCases}
          </Text>
          <Text style={{ fontSize: '22rpx', color: '#cbd5e1', marginTop: '10rpx', display: 'block', lineHeight: 1.55 }}>{briefSituation}</Text>
          <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8rpx', marginTop: '10rpx' }}>
            <Text style={{ fontSize: '18rpx', color: '#94a3b8' }}>{metrics.alertLabel}</Text>
            <Text style={{ fontSize: '18rpx', color: '#64748b' }}>|</Text>
            <Text style={{ fontSize: '18rpx', color: '#94a3b8' }}>WHO / ECDC：对公众风险极低</Text>
          </View>
        </View>

        {/* ─── ② HPI scale bar ─── */}
        <View style={{ padding: '12rpx 24rpx', borderBottom: '1rpx solid #f1f5f9' }}>
          <HpiScaleBar total={hpiTotal} color={hpiColor} />
        </View>

        {/* ─── ③ Three-column metrics ─── */}
        <View style={{ display: 'flex', flexDirection: 'row', borderBottom: '1rpx solid #f1f5f9' }}>
          {[
            ['最近威胁距离', highRiskDistanceText, '#dc2626'],
            ['国内基线', domesticBaselineText, '#111827'],
            ['WHO 更新', `${metrics.whoDaysSinceOfficialUpdate} 天前`, '#111827'],
          ].map(([label, val, clr], i) => (
            <View key={i} style={{ flex: 1, padding: '16rpx 8rpx', textAlign: 'center', borderRightWidth: i < 2 ? '1rpx' : 0, borderColor: '#f1f5f9' }}>
              <Text style={{ fontSize: '16rpx', color: '#6b7280' }}>{label}</Text>
              <Text style={{ fontSize: '26rpx', fontWeight: 800, color: clr, marginTop: '4rpx', display: 'block' }}>{val}</Text>
            </View>
          ))}
        </View>

        {/* ─── ④ Case cards ─── */}
        <View style={{ padding: '16rpx 24rpx', borderBottom: '1rpx solid #f1f5f9' }}>
          <View style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12rpx' }}>
            <Text style={{ fontSize: '18rpx', fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em' }}>病例与监测动态</Text>
            <Text style={{ fontSize: '16rpx', color: '#9ca3af' }}>
              安第斯确诊 {caseTableSummary.totalConfirmed} · 监测 {caseTableSummary.totalMonitoring} · 死亡 {caseTableSummary.totalDeaths}
            </Text>
          </View>
          {caseTable.slice(0, 7).map((row, i) => (
            <View key={i} style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: '8rpx', paddingTop: '8rpx', paddingBottom: '8rpx', borderBottom: i < caseTable.slice(0, 7).length - 1 ? '1rpx solid #f9fafb' : 'none' }}>
              <Text style={{ width: '56rpx', fontSize: '18rpx', color: '#9ca3af', flexShrink: 0, paddingTop: '2rpx' }}>{row.date.slice(5)}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6rpx', flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: '22rpx', fontWeight: 600, color: '#111827' }}>{row.countryNameZh}</Text>
                  <Text style={{ fontSize: '16rpx', color: '#9ca3af' }}>{row.serotypeLabel}</Text>
                  <View style={{ borderRadius: '100rpx', background: '#f3f4f6', padding: '2rpx 10rpx' }}>
                    <Text style={{ fontSize: '16rpx', color: '#6b7280' }}>{row.sourceType}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: '18rpx', color: '#6b7280', marginTop: '4rpx' }}>{row.sourceName}</Text>
              </View>
              <View style={{ display: 'flex', flexDirection: 'row', gap: '8rpx', alignItems: 'center', flexShrink: 0 }}>
                {row.totalConfirmed > 0 && <Text style={{ fontSize: '18rpx', fontWeight: 700, color: '#dc2626' }}>{row.totalConfirmed} 确诊</Text>}
                {row.monitoring > 0 && <Text style={{ fontSize: '18rpx', color: '#2563eb' }}>{row.monitoring} 监测</Text>}
                {row.deaths > 0 && <Text style={{ fontSize: '18rpx', fontWeight: 700, color: '#111827' }}>{row.deaths} 死亡</Text>}
                {row.totalConfirmed === 0 && row.monitoring === 0 && row.deaths === 0 && <Text style={{ fontSize: '18rpx', color: '#d1d5db' }}>—</Text>}
              </View>
            </View>
          ))}
        </View>

        {/* ─── ⑤ Monitoring leads ─── */}
        {metrics.monitoringLeads.length > 0 && (
          <View style={{ padding: '16rpx 24rpx', borderBottom: '1rpx solid #f1f5f9', background: 'rgba(245,243,255,0.3)' }}>
            <Text style={{ fontSize: '18rpx', fontWeight: 600, color: '#7c3aed', marginBottom: '10rpx' }}>待官方确认的监测动态</Text>
            {metrics.monitoringLeads.map((lead) => (
              <View key={lead.id} style={{ marginBottom: '6rpx' }}>
                <Text style={{ fontSize: '22rpx', color: '#1f2937', display: 'block', lineHeight: 1.5 }}>{lead.summary_zh}</Text>
                {lead.key_facts_zh?.length > 0 && (
                  <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '4rpx', marginTop: '6rpx', marginLeft: '12rpx' }}>
                    {lead.key_facts_zh.slice(0, 3).map((f) => (
                      <View key={f} style={{ borderRadius: '100rpx', background: '#f5f3ff', padding: '2rpx 10rpx' }}>
                        <Text style={{ fontSize: '16rpx', color: '#7c3aed' }}>{f}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ─── ⑥ Action suggestion ─── */}
        {userActionHint && (
          <View style={{ padding: '16rpx 24rpx', borderBottom: '1rpx solid #f1f5f9', background: 'rgba(236,253,245,0.5)' }}>
            <Text style={{ fontSize: '18rpx', fontWeight: 600, color: '#047857', marginBottom: '6rpx' }}>行动建议</Text>
            <Text style={{ fontSize: '24rpx', fontWeight: 600, color: '#065f46', display: 'block', lineHeight: 1.45 }}>{userActionHint}</Text>
          </View>
        )}

        {/* ─── ⑦ Details toggle ─── */}
        <View style={{ padding: '12rpx 24rpx' }} onClick={() => setShowDetails(v => !v)}>
          <Text style={{ fontSize: '18rpx', color: '#6b7280' }}>{showDetails ? '收起 ▲' : '数据溯源与综合判断 ▼'}</Text>
        </View>
        {showDetails && (
          <View style={{ padding: '0 24rpx 20rpx 24rpx', borderTop: '1rpx solid #f1f5f9', paddingTop: '16rpx' }}>
            {officialExcerpt && (
              <View style={{ borderRadius: '8rpx', background: '#f9fafb', padding: '12rpx', marginBottom: '12rpx' }}>
                <Text style={{ fontSize: '16rpx', color: '#6b7280', marginBottom: '4rpx' }}>事件摘要</Text>
                <Text style={{ fontSize: '20rpx', color: '#374151', display: 'block' }}>{officialExcerpt}</Text>
              </View>
            )}
            <View style={{ borderRadius: '8rpx', background: '#f8fafc', padding: '12rpx', marginBottom: '12rpx' }}>
              <Text style={{ fontSize: '16rpx', color: '#64748b', marginBottom: '4rpx' }}>结构指标</Text>
              <Text style={{ fontSize: '20rpx', color: '#475569', display: 'block' }}>{structuralMetricsLine}</Text>
            </View>
            <View style={{ borderRadius: '8rpx', background: '#eff6ff', border: '1rpx solid #bfdbfe', padding: '16rpx' }}
              onClick={() => Taro.navigateTo({ url: '/pages/events/mv-hondius/index' })}>
              <Text style={{ fontSize: '22rpx', fontWeight: 600, color: '#1e40af' }}>查看 MV Hondius 完整事件时间线 →</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
